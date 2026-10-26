import { realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { FILES } from "./workspace.js";
import type { Mode } from "./protocol.js";
export const LINT = "node ci/lint.mjs",
  TEST = "node --test tests/greeting.test.mjs",
  FORBIDDEN = "node ci/forbidden.mjs";
export function toolDecision(
  cwd: string,
  mode: Mode,
  name: string,
  input: any,
): "allow" | "deny" | "defer" {
  if (name === "Bash") {
    if (mode === "deny" && input.command === FORBIDDEN) return "defer";
    return mode === "fix" && [LINT, TEST].includes(input.command)
      ? "allow"
      : "deny";
  }
  if (!["Read", "Edit"].includes(name)) return "deny";
  let file: string;
  try {
    const base = realpathSync.native(cwd);
    file = relative(
      base,
      realpathSync.native(resolve(base, input.file_path || "")),
    ).replaceAll("\\", "/");
  } catch {
    return "deny";
  }
  if (!file || isAbsolute(file) || file.startsWith("..") || !(file in FILES))
    return "deny";
  if (name === "Read") return "allow";
  return mode === "fix" &&
    file === "src/greeting.js" &&
    typeof input.old_string === "string" &&
    input.old_string.includes("var message") &&
    input.new_string ===
      input.old_string.replace("var message", "const message")
    ? "allow"
    : "deny";
}
export function gateExit(input: {
  nativeSuccess: boolean;
  validated: boolean;
  denials: number;
  lint?: number | null;
  tests?: number | null;
}) {
  return input.nativeSuccess &&
    input.validated &&
    input.denials === 0 &&
    (input.lint === undefined || input.lint === 0) &&
    (input.tests === undefined || input.tests === 0)
    ? 0
    : 1;
}
