import { describe, expect, test } from "bun:test"
import { mkdirSync } from "fs"
import { resolve } from "path"

import { RepoStore } from "./repo-store"
import { testTmpDir } from "../test-helpers"

describe("RepoStore", () => {
  test("repoDirOf returns reposRoot/org/repo", () => {
    const root = "/tmp/reeve-repos"
    const store = new RepoStore(root)
    expect(store.repoDirOf("acme/app")).toBe(resolve(root, "acme/app"))
  })

  test("repoDirOf rejects local paths", () => {
    const store = new RepoStore("/tmp/reeve-repos")
    expect(() => store.repoDirOf("/Users/me/code/app")).toThrow(/Local paths are not supported/)
  })

  test("repoDirOf rejects malformed identifiers", () => {
    const store = new RepoStore("/tmp/reeve-repos")
    expect(() => store.repoDirOf("just-a-name")).toThrow(/Invalid repo format/)
    expect(() => store.repoDirOf("a/b/c")).toThrow(/Invalid repo format/)
  })

  test("ensure returns existing clone without invoking gh", async () => {
    const root = testTmpDir("reeve-repo-store-")
    mkdirSync(resolve(root, "acme/app/.git"), { recursive: true })
    const store = new RepoStore(root)
    const dir = await store.ensure("acme/app")
    expect(dir).toBe(resolve(root, "acme/app"))
  })
})
