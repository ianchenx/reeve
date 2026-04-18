import { timingSafeEqual } from 'crypto';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { streamSSE } from 'hono/streaming';
import type { Kernel } from './kernel';

// Register all actions
import '../actions/index';
import { executeAction } from '../actions/registry';
import type { ActionContext } from '../actions/types';
import { readUpdateCache, hasNewerVersion, getCurrentVersion } from '../update-check';

type ApiEnv = {
  Variables: {
    actionCtx: ActionContext;
  };
};

interface CreateApiAppDeps {
  getCtx: () => ActionContext;
  onActivate?: () => Promise<void>;
}

export function createApiApp(deps: CreateApiAppDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  let activationPromise: Promise<void> | null = null;

  const actionRoute = (
    name: string,
    inputFn?: (c: Context<ApiEnv>) => unknown | Promise<unknown>,
  ) => {
    return async (c: Context<ApiEnv>) => {
      const ctx = c.get('actionCtx') ?? deps.getCtx();
      const input = inputFn ? await inputFn(c) : {};
      const result = await executeAction(ctx, name, input);
      if (!result.ok) {
        const status =
          result.code === 'NOT_FOUND'
            ? 404
            : result.code === 'VALIDATION_ERROR'
              ? 400
              : 500;
        return c.json({ error: result.error }, status);
      }
      return c.json(result.data);
    };
  };

  app.use('*', cors());

  app.get('/health', actionRoute('health'));

  app.get('/version', (c) => {
    const cache = readUpdateCache();
    const current = getCurrentVersion();
    const latest = cache?.latest ?? null;
    return c.json({
      current,
      latest,
      hasUpdate: latest ? hasNewerVersion(current, latest) : false,
    });
  });

  app.use('*', async (c, next) => {
    const secret = process.env.DASHBOARD_SECRET;
    if (!secret) {
      await next();
      return;
    }

    const authHeader = c.req.header('authorization');
    const bearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const token = c.req.query('key') ?? bearer;
    const tokenBuf = Buffer.from(token ?? '');
    const secretBuf = Buffer.from(secret);

    if (
      !token
      || tokenBuf.length !== secretBuf.length
      || !timingSafeEqual(tokenBuf, secretBuf)
    ) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
  });

  app.use('*', async (c, next) => {
    c.set('actionCtx', deps.getCtx());
    await next();
  });

  app.get('/status', actionRoute('status'));
  app.get('/config', actionRoute('configGet'));
  app.get('/setup/check', actionRoute('setupCheck'));
  app.get('/setup/status', actionRoute('setupStatus'));
  app.post('/setup/save', actionRoute('setupSave', async (c) => c.req.json()));
  app.get('/projects', actionRoute('projectList'));
  app.get('/github/repos', actionRoute('githubRepos', (c) => ({ query: c.req.query('q') })));
  app.get('/teams/:teamKey/projects', actionRoute('teamProjects', (c) => ({ teamKey: c.req.param('teamKey') })));
  app.post('/projects/detect', actionRoute('projectDetect', async (c) => c.req.json()));
  app.post('/projects/import', actionRoute('projectImport', async (c) => c.req.json()));
  app.delete('/projects/:slug', actionRoute('projectRemove', (c) => ({ slug: c.req.param('slug') })));
  app.patch('/projects/:slug', actionRoute('projectUpdate', async (c) => ({ slug: c.req.param('slug'), ...await c.req.json() })));
  app.get('/tasks', actionRoute('taskList'));
  app.get('/tasks/:id', actionRoute('taskDetail', (c) => ({ id: c.req.param('id') })));
  app.post('/tasks/:id/cancel', actionRoute('cancel', (c) => ({ id: c.req.param('id') })));
  app.get('/log', actionRoute('log', (c) => ({ task: c.req.query('task'), tail: parseInt(c.req.query('tail') ?? '100') })));
  app.get('/history', actionRoute('historyList', (c) => ({ project: c.req.query('project') ?? undefined, query: (c.req.query('q') || c.req.query('identifier'))?.trim() || undefined, agent: c.req.query('agent')?.trim() || undefined, outcome: c.req.query('outcome') ?? undefined, limit: parseInt(c.req.query('limit') ?? '50'), offset: parseInt(c.req.query('offset') ?? '0') })));
  app.get('/history/:id/agents', actionRoute('historyAgents', (c) => ({ id: c.req.param('id') })));
  app.get('/history/:id/session', actionRoute('historySub', (c) => ({ id: c.req.param('id'), sub: 'session' })));
  app.get('/history/:id/prompt', actionRoute('historySub', (c) => ({ id: c.req.param('id'), sub: 'prompt' })));
  app.get('/history/:id/:agent/session', actionRoute('historySub', (c) => ({ id: c.req.param('id'), sub: `${c.req.param('agent')}/session` })));
  app.get('/history/:id/:agent/prompt', actionRoute('historySub', (c) => ({ id: c.req.param('id'), sub: `${c.req.param('agent')}/prompt` })));
  app.get('/history/:id', actionRoute('historyDetail', (c) => ({ id: c.req.param('id') })));
  app.get('/live/session/:identifier', actionRoute('liveSession', (c) => ({ identifier: c.req.param('identifier') })));
  app.get('/worktree/:identifier', actionRoute('worktreeStatus', (c) => ({ identifier: c.req.param('identifier') })));
  app.get('/worktree/:identifier/diff/*', actionRoute('worktreeDiff', (c) => ({ identifier: c.req.param('identifier'), file: c.req.param('*') })));
  app.post('/tasks/:identifier/clean', actionRoute('cleanTask', (c) => ({ identifier: c.req.param('identifier') })));
  app.post('/clean-done', actionRoute('cleanAllDone'));
  app.get('/validate', actionRoute('validate'));

  app.get('/events', (c) => {
    const kernel = c.get('actionCtx').kernel as Kernel;
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: 'init', tasks: kernel.tasks }) });

      const unsub = kernel.onSSE((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {});
      });

      const heartbeat = setInterval(() => {
        void stream.writeSSE({ event: 'heartbeat', data: '{}' }).catch(() => {});
      }, 30_000);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(heartbeat);
        unsub();
      };

      stream.onAbort(cleanup);

      try {
        while (true) {
          await stream.sleep(60_000);
        }
      } finally {
        cleanup();
      }
    });
  });

  app.post('/runtime/activate', async (c) => {
    if (!deps.onActivate) {
      return c.json({ error: 'runtime activation is not available' }, 400);
    }

    if (!activationPromise) {
      activationPromise = deps.onActivate().finally(() => {
        activationPromise = null;
      });
    }

    try {
      await activationPromise;
      return c.json({ ok: true });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.notFound((c) => c.json({ error: 'Not Found' }, 404));

  return app;
}

export function serveSpa(distDir: string): MiddlewareHandler {
  const staticMiddleware = serveStatic({
    root: distDir,
    onFound: (path, c) => {
      c.header(
        'Cache-Control',
        path.includes('/assets/') || path.startsWith('assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });

  const spaFallback = serveStatic({
    root: distDir,
    path: 'index.html',
    onFound: (_path, c) => {
      c.header('Cache-Control', 'no-cache');
    },
  });

  return async (c, next) => {
    if (c.req.path === '/api' || c.req.path.startsWith('/api/')) {
      await next();
      return;
    }
    const staticResponse = await staticMiddleware(c, async () => {});
    if (staticResponse) return staticResponse;
    if (c.finalized) return;
    return spaFallback(c, next);
  };
}
