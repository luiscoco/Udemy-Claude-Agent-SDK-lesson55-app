# Claude Agent SDK · Lesson 55 · Build agents in CI/CD

Five student pages, a real CLI and SDK pipeline lab and thirteen source-linked UML code steps.

## What you will learn

- Run the real headless CLI: Use the pinned bundled claude binary with -p and JSON output. Compare ordinary project-memory discovery with --bare plus an explicit rules file. Reduced configuration discovery does not make model outputs deterministic.
- Parse native machine-readable results: Inspect the actual CLI JSON envelope, result subtype, structured_output, cost estimate, stdout, stderr and process exit. Invalid JSON Schema produces a real validator diagnostic before model work.
- Build an unattended SDK step: Use settingSources: [], explicit tools, dontAsk and finite turn/spend estimates. A known unapproved command is denied by the native permission mode rather than waiting for a human.
- Fix a trusted lint fixture: The SDK runs a tiny teaching linter, changes only var message to const message and reruns lint and tests. The host verifies the exact source change and independently runs the same trusted checks; this is not a general-purpose ESLint bot.
- Gate on evidence and actual exit codes: Native model success and CI policy are separate. The worker exits nonzero for a denied tool, incomplete run, schema failure or failed lint gate. The browser observes the actual OS process exit instead of displaying an invented pass badge.
- Configure GitHub workflows safely: Source checks run without an API key. A manual main-branch agent workflow uses a repository secret when you choose to configure it. A Claude Code Action reference is included separately; no hosted agent run, comment, PR or automatic commit is performed by the classroom app.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson55-app.git
cd .\Udemy-Claude-Agent-SDK-lesson55-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations: `cd .\agent-sdk\lesson55-ci-cd`. Open http://127.0.0.1:3155. Node 24+, API credit and Windows Git Bash if needed.

## Create your .env file

Copy the template once and enter your own model key privately. Restart after edits. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3155
# Windows only, if required:
# CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe
```

No Docker, database, global CLI or GitHub token is needed locally. Hosted agent jobs require a repository secret that you configure separately.

## Run the experiments

### Compare CLI discovery and structured output

CLI runs -p without --bare and can load the fixture CLAUDE.md marker AUTO-DISCOVERY-55. Context uses --bare plus an explicit CI55-EXPLICIT rules file. Structured returns the actual exported names greet and isReady. This controlled comparison is about configuration loading, not deterministic answers.

```powershell
npm run pipeline -- cli
npm run pipeline -- context
npm run pipeline -- structured
```

### Inspect intentional failures

Fix should finish with exact var-to-const diff and independent lint/test exit 0. Deny, Turnlimit, Schema and Gate intentionally produce actual job exit 1. Gate demonstrates native success while the unmodified fixture still fails lint. A failed command is an expected lesson outcome, not a reason to pretend the pipeline passed.

```powershell
npm run pipeline -- fix
npm run pipeline -- deny
npm run pipeline -- turnlimit
npm run pipeline -- schema
npm run pipeline -- gate
# PowerShell: inspect the preceding command exit
$LASTEXITCODE
```

### Enable hosted agent jobs only when ready

The source-check workflow runs npm test without API secrets. For hosted agent jobs, open the repository Settings > Secrets and variables > Actions > New repository secret and privately add ANTHROPIC_API_KEY. Then choose Actions > Manual trusted-fixture agent job > Run workflow on main. This application does not upload that secret. The Claude Code Action reference remains under .github/examples; review the official app setup before copying it into workflows. No recurring cron or mention-triggered automation is enabled.

```powershell
npm test
# Local evidence: .runtime/runs/<run-id>/evidence.json
# Hosted workflow: .github/workflows/agent-demo.yml
# Optional reference: .github/examples/claude-code-action.yml
```

## How the app was built

### 1. Validate the chosen classroom job

The browser chooses only a fixed experiment. It cannot submit arbitrary shell commands, prompts, workflow expressions or filesystem paths.

Source: `src/protocol.ts`, selected lines 23–29. Surrounding code omitted.

```typescript
if (
    !value ||
    Object.keys(value).some((k) => k !== "mode") ||
    !MODES.includes(value.mode)
  )
    throw new Error("Choose a listed pipeline experiment.");
  return { mode: value.mode };
```

### 2. Prepare a real trusted Git checkout

Generate a fresh fixture, initialize actual Git history and commit its trusted baseline locally. It is not a clone of an untrusted PR and never changes the application repository.

Source: `src/workspace.ts`, selected lines 79–85. Surrounding code omitted.

```typescript
await git("init", "-b", "main");
  await git("config", "user.name", "Classroom CI");
  await git("config", "user.email", "classroom@example.invalid");
  await git("config", "core.autocrlf", "false");
  await git("add", ".");
  await git("commit", "-m", "Create trusted fictional CI fixture");
  return {
```

### 3. Spawn the actual pipeline worker

Launch a real Node/tsx job process with argument arrays and shell:false. The host observes stdout, stderr and the actual exit event; no shell command is composed from browser input.

Source: `src/agent.ts`, selected lines 23–32. Surrounding code omitted.

```typescript
const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(new URL("./job.ts", import.meta.url)),
      mode,
    ],
    {
      cwd: root,
```

### 4. Build headless CLI JSON arguments

The worker resolves the SDK-pinned native claude executable and supplies -p, optional --bare and JSON output. Tool, turn and estimate limits are explicit; the UI preserves its actual native process result.

Source: `src/job.ts`, selected lines 50–59. Surrounding code omitted.

```typescript
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
```

### 5. Pass context explicitly in bare mode

Bare skips automatic project-memory discovery. The explicit append-system-prompt-file option supplies the reviewed classroom rule, so the result includes CI55-EXPLICIT without relying on ambient CLAUDE.md.

Source: `src/job.ts`, selected lines 77–82. Surrounding code omitted.

```typescript
if (mode === "context")
      args.push(
        "--append-system-prompt-file",
        join(w.cwd, "ci/review-rules.md"),
      );
    if (mode === "structured" || mode === "schema")
```

### 6. Request and validate a real JSON schema

Pass the schema as a literal process argument, not shell-generated text. Structured parses the actual functions field. Schema mode deliberately supplies an invalid type and preserves the native validator failure.

Source: `src/job.ts`, selected lines 82–89. Surrounding code omitted.

```typescript
if (mode === "structured" || mode === "schema")
      args.push(
        "--json-schema",
        mode === "schema"
          ? '{"type":"not-a-json-schema-type"}'
          : JSON.stringify(schema),
      );
    const executable = cliExecutable();
```

### 7. Capture native stdout, stderr and exit

Capture the real child-process exit and its separate output streams. A native JSON result, validator diagnostic and process failure are different evidence, not interchangeable strings.

Source: `src/processes.ts`, selected lines 55–62. Surrounding code omitted.

```typescript
child.once("close", (exitCode, signal) => {
      options.signal?.removeEventListener("abort", abort);
      if (overflow)
        reject(new Error("Child output exceeded the classroom limit."));
      else resolve({ exitCode, signal, stdout, stderr });
    });
  });
}
```

### 8. Configure an unattended SDK job

settingSources is empty, tools are declared, turns and estimated spend are finite, and dontAsk denies unresolved calls. It is not bypassPermissions. Callback hooks still enforce the trusted fixture scope.

Source: `src/job.ts`, selected lines 100–106. Surrounding code omitted.

```typescript
permissionMode: "dontAsk",
      maxTurns: mode === "turnlimit" ? 1 : 6,
      maxBudgetUsd: 0.3,
      settingSources: bare ? [] : ["project"],
      explicitRules: mode === "context",
    });
    const native = await runProcess(executable, args, {
```

### 9. Permit only exact fixture commands

Fix mode permits only the exact linter and test commands. The harmless forbidden-command test is deliberately deferred to native dontAsk, which must deny it. Every other command is refused by the host.

Source: `src/policy.ts`, selected lines 14–21. Surrounding code omitted.

```typescript
if (name === "Bash") {
    if (mode === "deny" && input.command === FORBIDDEN) return "defer";
    return mode === "fix" && [LINT, TEST].includes(input.command)
      ? "allow"
      : "deny";
  }
  if (!["Read", "Edit"].includes(name)) return "deny";
  let file: string;
```

### 10. Consume the actual SDK stream

The real SDK owns model/tool orchestration. Preserve native messages, tool requests and the final result instead of creating a manual model loop or simulated responses.

Source: `src/job.ts`, selected lines 245–253. Surrounding code omitted.

```typescript
const run = query({ prompt, options });
    try {
      for await (const m of run) {
        if (m.type === "system" && m.subtype === "init")
          observe("init", {
            sessionId: m.session_id,
            model: m.model,
            tools: m.tools,
            plugins: m.plugins,
```

### 11. Independently verify the model fix

Only after exact fixture validation may the host execute its known linter and tests. The API key is removed from these verification processes. A model claim that lint passed is not accepted as verification.

Source: `src/job.ts`, selected lines 286–295. Surrounding code omitted.

```typescript
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
```

### 12. Map native and policy checks to a gate

Require native success, valid fixture state, no denials and successful required checks. Thus an SDK success can still produce a failed CI gate when real lint fails.

Source: `src/policy.ts`, selected lines 50–59. Surrounding code omitted.

```typescript
return input.nativeSuccess &&
    input.validated &&
    input.denials === 0 &&
    (input.lint === undefined || input.lint === 0) &&
    (input.tests === undefined || input.tests === 0)
    ? 0
    : 1;
}
```

### 13. Exit with the real pipeline decision

Set the job process exit after retaining evidence and cleaning temporary state. The parent observes that actual OS exit and compares it with the reported decision before updating the browser.

Source: `src/job.ts`, selected lines 373–374. Surrounding code omitted.

```typescript
process.exitCode = evidence.pipelineExitCode;
if (process.connected) process.disconnect();
```

## Reference topics and limits

- Real local jobs versus hosted automation: The app runs actual native CLI and SDK processes locally on generated trusted fixtures. It does not post comments, open PRs, auto-commit fixes or run a hosted GitHub agent job. The public repository includes offline source checks and a manual secret-dependent workflow for you to enable.
- Bare mode is not deterministic inference: --bare skips discovery of hooks, skills, commands, subagents, plugins, MCP, auto memory and CLAUDE.md. Explicit options can still supply context. It reduces ambient configuration differences; it does not guarantee identical text, eliminate managed policy or create an OS sandbox.
- A controlled discovery comparison: The ordinary CLI case sees the benign fixture CLAUDE.md marker AUTO-DISCOVERY-55. Context adds --bare and a reviewed rules file containing CI55-EXPLICIT. The trusted fixture README separately identifies the project as CI55-DEMO. No real user configuration or untrusted PR instruction is deliberately imported.
- CLI JSON and invalid schema: CLI stdout is the actual JSON result in ordinary cases. Schema uses a real invalid JSON Schema type and preserves the actual stderr validator diagnostic and nonzero native process exit. It does not invent a model outage or synthesize a result object when stdout is not JSON.
- dontAsk is an unattended gate: Unapproved calls are denied rather than waiting for a user. Deny submits only the harmless known fixture command once, allowing the native permission mode to reject it; the marker file must remain absent. Other unreviewed commands are blocked by the host before execution.
- A deliberately small lint task: The generated fixture uses a tiny regex teaching linter, not ESLint. The only permitted edit is var message to const message in src/greeting.js. Hooks reject arbitrary edits and shell combinations. The parent verifies exact file contents before running independent trusted checks.
- Native success differs from job success: Gate leaves the lint issue intact, lets the native read-only SDK task succeed, then fails the real lint check. The worker must exit 1. Fix must have the expected diff plus independent lint/test exit 0 before its actual process may pass. The UI displays actual and reported process exits separately.
- Secrets and trusted runners: The key lives only in private .env or a shell. Non-model verification subprocesses do not receive it. Never give credentials to untrusted PR code, repository hooks, package scripts or arbitrary agent-generated programs. Tool policies are not OS isolation; production runners need appropriate sandboxing, identity and repository trust controls.
- Bound work and costs: CLI tasks allow six turns, or one for the limit case, with a $0.30 estimate threshold. SDK read tasks allow six turns and fix allows ten, with a $0.35 threshold. Worker timeout is five minutes. Estimates can overshoot before checks and are not hard prepaid caps.
- Workflow triggers and permissions: ci.yml checks source on push/main and pull requests without API secrets. agent-demo.yml is manual, main-only and contents-read; the selected input is an enum passed through an environment variable, not interpolated as shell code. Checkout does not persist credentials. No recurring schedule is enabled.
- Claude Code Action alternative: The optional reference uses anthropics/claude-code-action and repository secrets, with explicit CLI arguments. It remains outside .github/workflows until you review official GitHub App setup and choose to enable it. Mention-based issue/PR actions and scheduled prompts are explained, not activated by this app.
- Evidence and platform support: Native stdout/stderr, JSON, tool observations, independent checks and real Git diff are retained in the ignored runtime folder. Windows may need Git Bash. The pinned SDK supplies a matching platform CLI; no global claude binary or jq installation is required for the app.
- Primary references: https://code.claude.com/docs/en/headless ; https://code.claude.com/docs/en/cli-reference ; https://github.com/anthropics/claude-code-action ; https://docs.github.com/en/actions/reference/security/secure-use

## Validation

Run `npm test` and `npm run build:client`. Regenerate pages with `python scripts/build-pages.py`. Secrets, dependencies, recordings and teaching media are excluded from Git.
