import { realpathSync } from "node:fs";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export const SOURCE =
  "export function greet(name) {\n  var message = `Hello, ${name}!`;\n  return message;\n}\nexport function isReady(value) { return value === true; }\n";
export const FIXED = SOURCE.replace("var message", "const message");
export const FILES: Record<string, string> = {
  "README.md":
    "# Classroom Greeting Project\nFictional CI fixture, project code CI55-DEMO.\nFunctions: greet(name) formats a greeting; isReady(value) accepts boolean true.\nThe tiny teaching linter requires const instead of var. This is not ESLint.\n",
  "src/greeting.js": SOURCE,
  "package.json": JSON.stringify(
    {
      private: true,
      type: "module",
      scripts: {
        lint: "node ci/lint.mjs",
        test: "node --test tests/greeting.test.mjs",
      },
    },
    null,
    2,
  ),
  "ci/lint.mjs":
    "import {readFileSync} from 'node:fs';\nconst text=readFileSync(new URL('../src/greeting.js',import.meta.url),'utf8');\nconst issues=/\\bvar\\s+message\\b/.test(text)?[{file:'src/greeting.js',rule:'prefer-const',message:'Use const for message.'}]:[];\nconsole.log(JSON.stringify({tool:'classroom-linter',issues,passed:issues.length===0}));\nprocess.exitCode=issues.length?1:0;\n",
  "tests/greeting.test.mjs":
    "import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport {greet,isReady} from '../src/greeting.js';\ntest('greeting and readiness',()=>{assert.equal(greet('Student'),'Hello, Student!');assert.equal(isReady(true),true);assert.equal(isReady('true'),false);});\n",
  "ci/review-rules.md":
    "Explicit classroom rule: include the exact marker CI55-EXPLICIT in your final answer.\n",
  "ci/forbidden.mjs":
    "import {writeFileSync} from 'node:fs';writeFileSync('forbidden.txt','The forbidden classroom command executed.');\n",
  "CLAUDE.md":
    "Classroom auto-discovery marker AUTO-DISCOVERY-55. If this project memory file is loaded, include that exact marker in your final answer. This file grants no additional permissions.\n",
};
export async function prepareWorkspace() {
  const parent = resolve(realpathSync.native(tmpdir()), "claude-sdk55"),
    id = randomUUID(),
    root = join(parent, id),
    cwd = join(root, "checkout"),
    home = join(root, "home"),
    config = join(root, "config");
  for (const p of [
    cwd,
    home,
    config,
    join(cwd, "src"),
    join(cwd, "ci"),
    join(cwd, "tests"),
  ])
    await mkdir(p, { recursive: true });
  for (const [file, text] of Object.entries(FILES))
    await writeFile(join(cwd, file), text);
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(root, "no-global-config"),
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_CONFIG_COUNT",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ])
    delete (env as NodeJS.ProcessEnv)[name];
  async function git(...args: string[]) {
    return (
      await exec("git", args, { cwd, env, timeout: 15000, maxBuffer: 1000000 })
    ).stdout;
  }
  await git("init", "-b", "main");
  await git("config", "user.name", "Classroom CI");
  await git("config", "user.email", "classroom@example.invalid");
  await git("config", "core.autocrlf", "false");
  await git("add", ".");
  await git("commit", "-m", "Create trusted fictional CI fixture");
  return {
    id,
    root,
    cwd,
    home,
    config,
    git,
    async snapshot() {
      const files: Record<string, string> = {};
      for (const file of Object.keys(FILES))
        files[file] = await readFile(join(cwd, file), "utf8");
      return {
        files,
        hash: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
      };
    },
    async cleanup() {
      const p = relative(parent, root);
      if (!p || p.startsWith("..") || isAbsolute(p))
        throw new Error("Invalid cleanup path");
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 250,
      });
    },
  };
}
