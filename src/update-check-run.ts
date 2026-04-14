#!/usr/bin/env bun
// Standalone script for background update checking.
// Spawned as a detached child process by spawnUpdateCheck().
// Separated from update-check.ts to avoid module-level side effects.

import { checkForUpdate } from "./update-check"

await checkForUpdate()
