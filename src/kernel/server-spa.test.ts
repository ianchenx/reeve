import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { resolve } from "path"
import { Hono } from "hono"
import { serveSpa } from "./server"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs.length = 0
})

function createDistFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "reeve-spa-"))
  tempDirs.push(dir)

  mkdirSync(resolve(dir, "assets"), { recursive: true })
  writeFileSync(
    resolve(dir, "index.html"),
    "<!doctype html><html><body><div id='root'></div></body></html>",
  )
  writeFileSync(resolve(dir, "assets", "app.js"), "console.log('asset ok')")
  return dir
}

async function fetchFromSpa(distDir: string, path: string): Promise<Response> {
  const app = new Hono()
  app.use("*", serveSpa(distDir))

  const server = Bun.serve({
    port: 0,
    fetch: app.fetch,
  })

  try {
    return await fetch(`http://localhost:${server.port}${path}`)
  } finally {
    server.stop()
  }
}

describe("serveSpa", () => {
  it("serves real asset files instead of falling back to index.html", async () => {
    const distDir = createDistFixture()

    const res = await fetchFromSpa(distDir, "/assets/app.js")
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("javascript")
    expect(body).toBe("console.log('asset ok')")
  })

  it("falls back to index.html for client-side routes", async () => {
    const distDir = createDistFixture()

    const res = await fetchFromSpa(distDir, "/setup")
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
    expect(body).toContain("<div id='root'></div>")
  })
})
