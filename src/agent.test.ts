import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { validateConfig } from "./protocol.js";
import { toolDecision, gateExit, LINT, FORBIDDEN } from "./policy.js";
import { SOURCE, FIXED } from "./workspace.js";
import { runProcess, privateEnv, redact } from "./processes.js";
test("browser config cannot supply shell commands, prompts or paths", () => {
  assert.deepEqual(validateConfig({ mode: "fix" }), { mode: "fix" });
  for (const c of [
    { mode: "unknown" },
    { mode: "fix", command: "override" },
    { mode: "cli", prompt: "override" },
  ])
    assert.throws(() => validateConfig(c));
});
test("native success and the independent pipeline gate are separate", () => {
  assert.equal(
    gateExit({ nativeSuccess: true, validated: true, denials: 0 }),
    0,
  );
  assert.equal(
    gateExit({
      nativeSuccess: true,
      validated: true,
      denials: 0,
      lint: 1,
      tests: 0,
    }),
    1,
  );
  assert.equal(
    gateExit({ nativeSuccess: true, validated: true, denials: 1 }),
    1,
  );
  assert.equal(
    gateExit({ nativeSuccess: false, validated: true, denials: 0 }),
    1,
  );
});
test("Bash policy permits exact fixture commands and defers only the harmless denial test", () => {
  assert.equal(toolDecision(".", "fix", "Bash", { command: LINT }), "allow");
  assert.equal(
    toolDecision(".", "fix", "Bash", { command: LINT + " && echo extra" }),
    "deny",
  );
  assert.equal(
    toolDecision(".", "deny", "Bash", { command: FORBIDDEN }),
    "defer",
  );
  assert.equal(
    toolDecision(".", "sdk", "Bash", { command: FORBIDDEN }),
    "deny",
  );
});
test("read/edit policy binds to the exact trusted fixture change", async () => {
  const root = join(tmpdir(), "sdk55-policy-" + randomUUID());
  await mkdir(join(root, "src"), { recursive: true });
  try {
    await writeFile(join(root, "src/greeting.js"), SOURCE);
    assert.equal(
      toolDecision(root, "fix", "Edit", {
        file_path: "src/greeting.js",
        old_string: "var message",
        new_string: "const message",
      }),
      "allow",
    );
    assert.equal(
      toolDecision(root, "fix", "Edit", {
        file_path: "src/greeting.js",
        old_string: SOURCE,
        new_string: SOURCE + "extra",
      }),
      "deny",
    );
    assert.equal(
      toolDecision(root, "fix", "Read", { file_path: "../outside.txt" }),
      "deny",
    );
    assert.equal(FIXED, SOURCE.replace("var message", "const message"));
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "sdk55-policy-")));
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 4,
      retryDelay: 100,
    });
  }
});
test("runner observes actual child exit codes without a shell", async () => {
  const r = await runProcess(
    process.execPath,
    ["-e", "console.log('native-check');process.exitCode=7"],
    { cwd: process.cwd(), env: { ...process.env } },
  );
  assert.equal(r.exitCode, 7);
  assert.match(r.stdout, /native-check/);
});
test("child environment removes unrelated credentials and telemetry body logging", () => {
  process.env.SDK55_TEST_TOKEN = "private-demo-value";
  try {
    const env = privateEnv({ home: "demo-home", config: "demo-config" });
    assert.equal(env.SDK55_TEST_TOKEN, undefined);
    assert.equal(env.HOME, "demo-home");
    assert.equal(env.OTEL_LOG_RAW_API_BODIES, "0");
  } finally {
    delete process.env.SDK55_TEST_TOKEN;
  }
});
test("current API key is removed from diagnostics", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "classroom-private-fixture-value";
  try {
    assert.equal(
      redact("key=classroom-private-fixture-value"),
      "key=[REDACTED]",
    );
  } finally {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  }
});
