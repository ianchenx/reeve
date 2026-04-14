/**
 * Test helpers — provide a project-local temp directory for test fixtures.
 *
 * Why: Codex runs in a macOS Seatbelt sandbox where only $PWD (worktree),
 * $TMPDIR, and ~/.codex are writable. os.tmpdir() may resolve to a path
 * outside the sandbox whitelist, causing test failures. Using project-local
 * temp dirs guarantees writes work in all environments (sandbox, CI, local).
 *
 * Cleanup: afterAll hooks should call cleanupTestTmp() to remove all
 * test fixtures. The directory is also listed in .gitignore.
 */

import { mkdirSync, mkdtempSync, rmSync } from "fs"
import { join, resolve } from "path"

const TEST_TMP_ROOT = resolve(process.cwd(), ".test-tmp")

/** Track all created temp dirs for cleanup */
const createdDirs: string[] = []

/**
 * Create a temp directory inside the project's .test-tmp/ folder.
 * Works in Codex sandbox, CI, and local development.
 *
 * @param prefix - Directory name prefix (e.g., "reeve-publisher-")
 * @returns Absolute path to the created temp directory
 */
export function testTmpDir(prefix: string): string {
  mkdirSync(TEST_TMP_ROOT, { recursive: true })
  const dir = mkdtempSync(join(TEST_TMP_ROOT, prefix))
  createdDirs.push(dir)
  return dir
}

/**
 * Remove all temp directories created by testTmpDir() in this process.
 * Call in afterAll() or at end of test suite.
 */
export function cleanupTestTmp(): void {
  for (const dir of createdDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
  createdDirs.length = 0

  // Remove the root .test-tmp/ if empty
  try {
    rmSync(TEST_TMP_ROOT, { recursive: false })
  } catch {
    // not empty or already gone — fine
  }
}
