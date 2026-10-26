export const MODES = [
  "cli",
  "context",
  "structured",
  "sdk",
  "fix",
  "deny",
  "turnlimit",
  "schema",
  "gate",
] as const;
export type Mode = (typeof MODES)[number];
export type RunConfig = { mode: Mode };
export type LabEvent = { type: string; [key: string]: any };
export const CLI_MODES = new Set<Mode>([
  "cli",
  "context",
  "structured",
  "turnlimit",
  "schema",
]);
export function validateConfig(value: any): RunConfig {
  if (
    !value ||
    Object.keys(value).some((k) => k !== "mode") ||
    !MODES.includes(value.mode)
  )
    throw new Error("Choose a listed pipeline experiment.");
  return { mode: value.mode };
}
