// banner.ts — Animated startup banner for `reeve run`
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

const REEVE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');

// ── ANSI helpers ────────────────────────────────────────
const ESC = '\x1b[';
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const RESET = `${ESC}0m`;

// ── Load art ────────────────────────────────────────────
function loadArt(): string[] {
  try {
    const artPath = resolve(REEVE_ROOT, 'assets/logo.txt');
    const raw = readFileSync(artPath, 'utf-8');
    return raw.split('\n');
  } catch {
    return [];
  }
}

// ── Rounded box ─────────────────────────────────────────
const BOX = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' } as const;

export function renderBox(lines: string[], padding = 1): string {
  // Strip ANSI for width calculation
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const contentWidth = Math.max(...lines.map((l) => strip(l).length)) + padding * 2;

  const top = BOX.tl + BOX.h.repeat(contentWidth) + BOX.tr;
  const bot = BOX.bl + BOX.h.repeat(contentWidth) + BOX.br;
  const pad = ' '.repeat(padding);
  const body = lines.map((l) => {
    const visible = strip(l).length;
    const right = ' '.repeat(contentWidth - padding - visible);
    return `${BOX.v}${pad}${l}${right}${BOX.v}`;
  });

  return [top, ...body, bot].join('\n');
}

// ── Reveal animation ────────────────────────────────────
export async function playReveal(durationMs = 800): Promise<void> {
  const artLines = loadArt();
  const totalLines = artLines.length;
  if (totalLines === 0) return;

  const delayPerLine = Math.max(Math.floor(durationMs / totalLines), 10);

  process.stdout.write(HIDE_CURSOR);
  try {
    // Phase 1: line-by-line reveal (dim → bold)
    for (let i = 0; i < totalLines; i++) {
      process.stdout.write(`${DIM}${artLines[i]}${RESET}\n`);
      await Bun.sleep(delayPerLine);
    }

    // Phase 2: quick brightness pulse — redraw all lines as bold, then reset
    await Bun.sleep(100);
    process.stdout.write(`${ESC}${totalLines}A`);
    for (const line of artLines) {
      process.stdout.write(`\r${BOLD}${line}${RESET}\n`);
    }
    await Bun.sleep(300);

    // Phase 3: settle to normal weight
    process.stdout.write(`${ESC}${totalLines}A`);
    for (const line of artLines) {
      process.stdout.write(`\r${line}${RESET}\n`);
    }
  } finally {
    process.stdout.write(SHOW_CURSOR);
  }
}

// ── Static logo (no animation) ──────────────────────────
export function printStaticLogo(): void {
  const artLines = loadArt();
  if (artLines.length === 0) return;
  console.log(artLines.join('\n'));
}

// ── Public: full startup banner ─────────────────────────
export async function printAnimatedBanner(info: {
  repos: string;
  dashboardUrl?: string;
  version: string;
}): Promise<void> {
  // Only animate when stdout is a TTY (skip in pipes/logs)
  const isTTY = process.stdout.isTTY;

  if (isTTY) {
    await playReveal(800);
    console.log(); // blank line after art
  }

  // Status box
  const lines: string[] = [
    `${BOLD}reeve${RESET} v${info.version}`,
    '',
    `Watching  ${info.repos}`,
  ];
  if (info.dashboardUrl) {
    lines.push(`Dashboard ${info.dashboardUrl}`);
  }

  if (isTTY) {
    console.log(renderBox(lines));
  } else {
    // Plain fallback for non-TTY (daemon log)
    console.log(`[kernel] Watching: ${info.repos}`);
    if (info.dashboardUrl) {
      console.log(`[kernel] Dashboard: ${info.dashboardUrl}`);
    }
  }
}
