import type { BalletTeacherSignal } from "@noelia-root/persona";

export type CommunityCommand =
  | Readonly<{ name: "help" }>
  | Readonly<{ name: "status" }>
  | Readonly<{ name: "greeting" }>
  | Readonly<{ name: "casual" }>
  | Readonly<{ name: "ballet"; signal: BalletTeacherSignal }>
  | Readonly<{ name: "style" }>
  | Readonly<{ name: "luxury" }>;

export type CommunityCommandParseResult =
  | Readonly<{ kind: "ignore" }>
  | Readonly<{ kind: "malformed"; reason: "invalid_input" | "too_long" | "missing_command" | "invalid_argument" }>
  | Readonly<{ kind: "unknown"; command: string }>
  | Readonly<{ kind: "command"; command: CommunityCommand }>;

const commandPrefix = /^!noelia(?=$|\s)/i;
const maximumCommandLength = 256;

const balletSignals: Readonly<Record<string, BalletTeacherSignal>> = Object.freeze({
  prepare: "preparation",
  preparation: "preparation",
  success: "success",
  miss: "failure",
  fail: "failure",
  failure: "failure",
  again: "repeated_failure",
  repeat: "repeated_failure",
  encourage: "encouragement",
  encouragement: "encouragement",
  warning: "warning",
  correct: "corrective_task",
  task: "corrective_task",
  confused: "confusion",
  confusion: "confusion",
  recover: "recovery",
  recovery: "recovery",
  stamina: "stamina",
  ready: "readiness",
  readiness: "readiness",
});

export function parseCommunityCommand(input: unknown): CommunityCommandParseResult {
  if (typeof input !== "string") return { kind: "malformed", reason: "invalid_input" };

  const message = input.trim();
  const prefix = commandPrefix.exec(message);
  if (!prefix) return { kind: "ignore" };
  if (message.length > maximumCommandLength) return { kind: "malformed", reason: "too_long" };

  const remainder = message.slice(prefix[0].length).trim();
  if (!remainder) return { kind: "malformed", reason: "missing_command" };

  const [rawName, ...arguments_] = remainder.split(/\s+/);
  const name = rawName.toLowerCase();
  if (name === "help") {
    return arguments_.length === 0
      ? { kind: "command", command: { name: "help" } }
      : { kind: "malformed", reason: "invalid_argument" };
  }
  if (name === "status") {
    return arguments_.length === 0
      ? { kind: "command", command: { name: "status" } }
      : { kind: "malformed", reason: "invalid_argument" };
  }
  if (name === "hello" || name === "bonjour") {
    return arguments_.length === 0
      ? { kind: "command", command: { name: "greeting" } }
      : { kind: "malformed", reason: "invalid_argument" };
  }
  if (name === "chat") {
    return arguments_.length === 0
      ? { kind: "command", command: { name: "casual" } }
      : { kind: "malformed", reason: "invalid_argument" };
  }
  if (name === "style" || name === "fashion") {
    return arguments_.length === 0
      ? { kind: "command", command: { name: "style" } }
      : { kind: "malformed", reason: "invalid_argument" };
  }
  if (name === "luxury") {
    return arguments_.length === 0
      ? { kind: "command", command: { name: "luxury" } }
      : { kind: "malformed", reason: "invalid_argument" };
  }
  if (name === "ballet") {
    if (arguments_.length > 1) return { kind: "malformed", reason: "invalid_argument" };
    const signalName = (arguments_[0] || "prepare").toLowerCase();
    const signal = balletSignals[signalName];
    return signal
      ? { kind: "command", command: { name: "ballet", signal } }
      : { kind: "malformed", reason: "invalid_argument" };
  }

  return { kind: "unknown", command: name.slice(0, 48) };
}
