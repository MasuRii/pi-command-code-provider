import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DebugLogger } from "../src/debug-logger.ts";

async function withTempRoot(run: (root: string) => Promise<void> | void): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "pi-command-code-debug-"));
  try {
    await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("disabled debug logger is a no-op and does not create debug artifacts", async () => {
  await withTempRoot(async (root) => {
    const logger = new DebugLogger({ extensionRoot: root, debug: false });

    assert.equal(logger.debug("disabled", { apiKey: "secret" }), undefined);
    logger.warn("disabled-warning");
    logger.error("disabled-error");
    await logger.flush();

    assert.equal(existsSync(join(root, "debug")), false);
  });
});

test("enabled debug logger writes on flush and redacts secret keys", async () => {
  await withTempRoot(async (root) => {
    const logger = new DebugLogger({ extensionRoot: root, debug: true });

    assert.equal(logger.debug("request", {
      apiKey: "secret-key",
      nested: { authorization: "Bearer live-token", safe: "visible" },
    }), undefined);
    assert.equal(existsSync(join(root, "debug")), false, "write should be scheduled asynchronously");
    await logger.flush();

    const logContent = readFileSync(join(root, "debug", "debug.log"), "utf-8");
    assert.match(logContent, /"extension":"pi-command-code-provider"/);
    assert.match(logContent, /"event":"request"/);
    assert.match(logContent, /"apiKey":"\[REDACTED\]"/);
    assert.match(logContent, /"authorization":"\[REDACTED\]"/);
    assert.match(logContent, /"safe":"visible"/);
    assert.doesNotMatch(logContent, /secret-key|live-token/);
  });
});

test("debug logger swallows filesystem failures", async () => {
  await withTempRoot(async (root) => {
    writeFileSync(join(root, "debug"), "not a directory", "utf-8");
    const logger = new DebugLogger({ extensionRoot: root, debug: true });

    assert.doesNotThrow(() => logger.error("write-fails", { token: "secret-token" }));
    await assert.doesNotReject(() => logger.flush());
  });
});
