import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { prepareWorkspace, SOURCE, FIXED, FILES } from "./workspace.js";
import { CLI_MODES, validateConfig } from "./protocol.js";
import { runProcess, cliExecutable, privateEnv, redact } from "./processes.js";
import { toolDecision, gateExit, LINT, TEST, FORBIDDEN } from "./policy.js";
const { mode } = validateConfig({ mode: process.argv[2] });
const emit = (event: any) =>
  process.stdout.write(redact(JSON.stringify(event)) + "\n");
const observe = (kind: string, detail: any) => {
  const observation = { kind, at: new Date().toISOString(), detail };
  observations.push(observation);
  emit({ type: "observation", observation });
};
const observations: any[] = [],
  tools: any[] = [],
  commands: any[] = [],
  results: any[] = [];
const controller = new AbortController();
const deadline = setTimeout(() => controller.abort(), 300000);
process.on("message", (message) => {
  if ((message as any)?.type === "abort") controller.abort();
});
let w: Awaited<ReturnType<typeof prepareWorkspace>> | undefined,
  evidence: any,
  exception: string | null = null;
try {
  w = await prepareWorkspace();
  const before = await w.snapshot(),
    env = privateEnv(w),
    model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  let runtime: any,
    structured: any = null,
    validationError: string | null = null,
    lint: any = null,
    tests: any = null;
  const schema = z.toJSONSchema(
    z.object({ functions: z.array(z.string()) }).strict(),
    { target: "draft-7" },
  );
  if (CLI_MODES.has(mode)) {
    const bare = mode !== "cli";
    const prompt =
      mode === "structured"
        ? "Read src/greeting.js and return the two exported function names in the configured schema, in source order."
        : "Read README.md. Summarize the project code and purpose in at most three bullets. Include any explicitly supplied or auto-discovered classroom marker if one is provided; do not invent a marker.";
    const args = [
      ...(bare ? ["--bare"] : []),
      "-p",
      prompt,
      "--model",
      model,
      "--output-format",
      "json",
      "--tools",
      "Read",
      "--allowedTools",
      mode === "structured" ? "Read,StructuredOutput" : "Read",
      "--permission-mode",
      "dontAsk",
      "--max-turns",
      mode === "turnlimit" ? "1" : "6",
      "--max-budget-usd",
      "0.30",
      "--effort",
      "low",
      "--no-session-persistence",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--setting-sources",
      bare ? "" : "project",
    ];
    if (mode === "context")
      args.push(
        "--append-system-prompt-file",
        join(w.cwd, "ci/review-rules.md"),
      );
    if (mode === "structured" || mode === "schema")
      args.push(
        "--json-schema",
        mode === "schema"
          ? '{"type":"not-a-json-schema-type"}'
          : JSON.stringify(schema),
      );
    const executable = cliExecutable();
    const version = await runProcess(executable, ["--version"], {
      cwd: w.cwd,
      env,
    });
    observe("configuration", {
      source: "Actual bundled native claude CLI",
      version: version.stdout.trim(),
      bare,
      argv: args,
      tools: ["Read"],
      permissionMode: "dontAsk",
      maxTurns: mode === "turnlimit" ? 1 : 6,
      maxBudgetUsd: 0.3,
      settingSources: bare ? [] : ["project"],
      explicitRules: mode === "context",
    });
    const native = await runProcess(executable, args, {
      cwd: w.cwd,
      env,
      signal: controller.signal,
    });
    let result: any = null,
      parseError: string | null = null;
    try {
      result = JSON.parse(native.stdout.trim());
    } catch {
      parseError =
        "Native stdout was not a JSON result; inspect its real exit code and stderr.";
    }
    runtime = {
      kind: "cli",
      version: version.stdout.trim(),
      exitCode: native.exitCode,
      signal: native.signal,
      stdout: native.stdout,
      stderr: native.stderr,
      result,
      parseError,
    };
    if (result) {
      results.push(result);
      emit({ type: "result", result });
      if (result.result) emit({ type: "text", text: result.result });
    }
    observe("cli-process", runtime);
    if (mode === "structured")
      try {
        structured = z
          .object({ functions: z.array(z.string()) })
          .strict()
          .parse(result?.structured_output);
        if (
          JSON.stringify(structured.functions) !==
          JSON.stringify(["greet", "isReady"])
        )
          throw new Error(
            "Functions do not match the actual fixture source order.",
          );
      } catch (e) {
        validationError = String(e);
      }
  } else {
    const fix = mode === "fix";
    const options: Options = {
      cwd: w.cwd,
      model,
      settingSources: [],
      plugins: [],
      skills: [],
      mcpServers: {},
      strictMcpConfig: true,
      persistSession: false,
      tools: [
        "Read",
        ...(fix ? ["Edit", "Bash"] : mode === "deny" ? ["Bash"] : []),
      ],
      allowedTools: [
        "Read",
        ...(fix ? ["Edit", `Bash(${LINT})`, `Bash(${TEST})`] : []),
      ],
      permissionMode: "dontAsk",
      maxTurns: fix ? 10 : 6,
      maxBudgetUsd: 0.35,
      effort: "low",
      thinking: { type: "disabled" },
      abortController: controller,
      env,
      systemPrompt:
        "You run an unattended classroom CI job on a trusted generated fixture, not a real user repository. Read README.md first. The linter is a tiny teaching script, not ESLint. For fix mode run node ci/lint.mjs, change only var message to const message in src/greeting.js using Edit, run the same linter again, then run node --test tests/greeting.test.mjs. Run each command as a separate exact Bash call; never combine commands or add prefixes. No other edit is allowed. For deny mode submit node ci/forbidden.mjs once as a controlled permission test, then read README.md after denial; never retry or substitute another command. Never read credentials or anything outside the fixture. Report the actual observed outcome in under 120 words. A native success is separate from the host CI gate.",
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (i) => {
                if (i.hook_event_name !== "PreToolUse") return {};
                const decision = toolDecision(
                  w!.cwd,
                  mode,
                  i.tool_name,
                  i.tool_input,
                );
                observe("tool-policy", {
                  tool: i.tool_name,
                  input: i.tool_input,
                  decision,
                });
                return decision === "deny"
                  ? {
                      hookSpecificOutput: {
                        hookEventName: "PreToolUse",
                        permissionDecision: "deny",
                        permissionDecisionReason:
                          "Only trusted fixture reads, the exact var-to-const edit and the two fixed CI commands are permitted.",
                      },
                    }
                  : {};
              },
            ],
          },
        ],
        PostToolUse: [
          {
            hooks: [
              async (i) => {
                if (i.hook_event_name === "PostToolUse") {
                  const row = {
                    tool: i.tool_name,
                    input: i.tool_input,
                    response: i.tool_response,
                  };
                  observe("tool-result", row);
                  if (i.tool_name === "Bash") commands.push(row);
                }
                return {};
              },
            ],
          },
        ],
      },
    };
    observe("configuration", {
      source: "Actual TypeScript Agent SDK pipeline step",
      tools: options.tools,
      allowedTools: options.allowedTools,
      permissionMode: options.permissionMode,
      settingSources: options.settingSources,
      maxTurns: options.maxTurns,
      maxBudgetUsd: options.maxBudgetUsd,
      editsRestrictedTo: "src/greeting.js: var message -> const message",
    });
    const prompt = fix
      ? "Perform the fixture lint-fix job: read, run the linter, fix its one var-to-const issue, rerun lint and run tests."
      : mode === "deny"
        ? `Permission test: call Bash with exactly ${FORBIDDEN} once. Observe dontAsk denying it, do not retry, then summarize README.md.`
        : "Read README.md and src/greeting.js. Summarize project code CI55-DEMO and the two exported functions. Do not edit anything or run a shell command.";
    const run = query({ prompt, options });
    try {
      for await (const m of run) {
        if (m.type === "system" && m.subtype === "init")
          observe("init", {
            sessionId: m.session_id,
            model: m.model,
            tools: m.tools,
            plugins: m.plugins,
          });
        if (m.type === "assistant")
          for (const b of m.message.content) {
            if (b.type === "text") emit({ type: "text", text: b.text });
            if (b.type === "tool_use") {
              const row = { name: b.name, id: b.id, input: b.input };
              tools.push(row);
              observe("native-tool", row);
            }
          }
        if (m.type === "result") {
          results.push(m);
          emit({ type: "result", result: m });
        }
      }
    } catch (e) {
      exception = String(e);
    } finally {
      run.close();
    }
    runtime = { kind: "sdk", result: results.at(-1) || null, exception };
  }
  const after = await w.snapshot(),
    diff = await w.git("diff", "--no-ext-diff", "--no-textconv"),
    forbiddenExecuted = existsSync(join(w.cwd, "forbidden.txt"));
  const expectedSource = mode === "fix" ? FIXED : SOURCE;
  const fixturesValid =
    after.files["src/greeting.js"] === expectedSource &&
    Object.keys(FILES).every(
      (f) => f === "src/greeting.js" || after.files[f] === before.files[f],
    ) &&
    !forbiddenExecuted;
  if ((mode === "fix" || mode === "gate") && fixturesValid) {
    const testEnv = { ...env };
    delete testEnv.ANTHROPIC_API_KEY;
    lint = await runProcess(process.execPath, ["ci/lint.mjs"], {
      cwd: w.cwd,
      env: testEnv,
      signal: controller.signal,
    });
    tests = await runProcess(
      process.execPath,
      ["--test", "tests/greeting.test.mjs"],
      { cwd: w.cwd, env: testEnv, signal: controller.signal },
    );
    observe("host-verification", {
      source: "Actual independent trusted-host processes, not model assertions",
      lint,
      tests,
    });
  }
  const final = runtime.result;
  const nativeSuccess =
    final?.subtype === "success" &&
    !final?.is_error &&
    !exception &&
    (runtime.kind !== "cli" || runtime.exitCode === 0);
  const denials = final?.permission_denials?.length || 0;
  const pipelineExitCode = gateExit({
    nativeSuccess,
    validated: fixturesValid && !validationError,
    denials,
    ...(lint ? { lint: lint.exitCode, tests: tests.exitCode } : {}),
  });
  evidence = {
    mode,
    source:
      "Real local CI processes; no hosted agent job, comment, PR or automatic commit is performed.",
    runtime,
    results,
    tools,
    commands,
    observations,
    structured,
    lint,
    tests,
    diff,
    before,
    after,
    fixturesValid,
    fixtureUnchanged: before.hash === after.hash,
    forbiddenExecuted,
    nativeSuccess,
    denials,
    validationError,
    exception,
    pipelineExitCode,
    scope:
      "CLI -p/--bare and real Agent SDK run on a generated trusted Git fixture. Only the classroom var-to-const change is permitted. Process exits are actual local jobs, not a hosted GitHub Actions agent run. Bare mode reduces configuration discovery; it does not make model outputs deterministic or provide an OS sandbox.",
  };
} catch (e) {
  exception = String(e);
  evidence = {
    mode,
    exception,
    pipelineExitCode: 1,
    observations,
    results,
    tools,
    commands,
  };
} finally {
  clearTimeout(deadline);
  try {
    await w?.cleanup();
  } catch (e) {
    evidence = { ...evidence, cleanupError: String(e), pipelineExitCode: 1 };
  }
}
const folder = new URL(
  "../.runtime/runs/" + (w?.id || "startup-error") + "/",
  import.meta.url,
);
await mkdir(folder, { recursive: true });
await writeFile(
  new URL("evidence.json", folder),
  redact(JSON.stringify(evidence, null, 2)),
);
emit({ type: "job-evidence", evidence });
process.exitCode = evidence.pipelineExitCode;
if (process.connected) process.disconnect();
