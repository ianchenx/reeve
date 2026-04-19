import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { ReeveDaemonConfig } from '../config';
import type { Source, SourceDisposition } from './source';
import { StateStore } from './state';
import type { KernelConfig, Task } from './types';

const KERNEL_CONFIG: KernelConfig = {
  maxRounds: 2,
  maxRetries: 2,
  pollIntervalMs: 60_000,
  stallTimeoutMs: 1,
  turnTimeoutMs: 3_600_000,
  agentDefault: 'codex',
  dashboardPort: 14500,
  dashboardEnabled: false,
};

function createConfig(workspaceRoot: string): ReeveDaemonConfig {
  return {
    source: 'linear',
    linear: {
      apiKey: 'lin_api_test',
      projectSlug: 'test-project',
      teamKey: 'TES',
      dispatchableStateTypes: ['unstarted', 'started'],
      terminalStates: ['Done', 'Cancelled'],
      stateNames: {
        todo: 'Todo',
        inProgress: 'In Progress',
        inReview: 'In Review',
        done: 'Done',
        backlog: 'Backlog',
      },
    },
    workspace: { root: workspaceRoot },
    agent: {
      maxRounds: 2,
      maxRetries: 2,
      stallTimeoutMs: 1,
      turnTimeoutMs: 3_600_000,
      default: 'codex',
    },
    polling: { intervalMs: 60_000 },
    dashboard: { port: 14500, enabled: false },
    projects: [],
  };
}

function createSource(dispositions: Record<string, SourceDisposition>): Source {
  return {
    poll: async () => [],
    onStart: async () => {},
    onDone: async () => {},
    fetchDisposition: async (itemId: string) => dispositions[itemId] ?? 'unknown',
  };
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    identifier: 'TES-1',
    title: 'recovery test',
    description: '',
    labels: [],
    priority: null,
    state: 'queued',
    repo: 'acme/app',
    baseBranch: 'main',
    round: 0,
    maxRounds: 2,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Kernel recovery', () => {
  let reeveDir: string;

  beforeEach(() => {
    reeveDir = mkdtempSync(join(tmpdir(), 'reeve-recovery-'));
    process.env.REEVE_DIR = reeveDir;
    process.env.REEVE_NO_UPDATE_CHECK = '1';
    mkdirSync(join(reeveDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    rmSync(reeveDir, { recursive: true, force: true });
    delete process.env.REEVE_DIR;
    delete process.env.REEVE_NO_UPDATE_CHECK;
  });

  test('start recovers mixed state and ignores delayed exit for already-done task', async () => {
    const staleTs = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const statePath = join(reeveDir, 'state.json');
    const tasks: Task[] = [
      makeTask({
        id: 'done-1',
        identifier: 'TES-58',
        state: 'done',
        doneReason: 'failed',
      }),
      makeTask({
        id: 'published-1',
        identifier: 'TES-59',
        state: 'published',
        lastExitDisposition: 'passive',
      }),
      makeTask({
        id: 'active-1',
        identifier: 'TES-60',
        state: 'active',
        startedAt: staleTs,
        lastOutputAt: staleTs,
      }),
    ];

    writeFileSync(statePath, JSON.stringify({ version: 1, tasks }, null, 2));

    const { Kernel } = await import(`./kernel?recovery=${Date.now()}`);
    const kernel = new Kernel(
      createSource({
        'done-1': 'done',
        'published-1': 'passive',
        'active-1': 'actionable',
      }),
      createConfig(join(reeveDir, 'workspace')),
      KERNEL_CONFIG,
    );
    (kernel as any).store = new StateStore(statePath);
    (kernel as any).workspace = { cleanOrphans: async () => [] };

    try {
      await kernel.start();

      expect(kernel.getTask('done-1')?.state).toBe('done');
      expect(kernel.getTask('published-1')?.state).toBe('published');
      expect(kernel.getTask('active-1')?.state).toBe('done');

      await expect(
        (kernel as any).onAgentExit('active-1', { exitCode: 143, stderr: 'killed' }),
      ).resolves.toBeUndefined();

      expect(kernel.getTask('active-1')?.state).toBe('done');
      expect(kernel.getTask('active-1')?.pid).toBeUndefined();
    } finally {
      kernel.stop();
    }
  });
});
