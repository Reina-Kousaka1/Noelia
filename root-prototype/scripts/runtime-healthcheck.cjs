const fs = require("node:fs");

function childIds(parentId) {
  try {
    return fs
      .readFileSync(`/proc/${parentId}/task/${parentId}/children`, "utf8")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function processArguments(processId) {
  try {
    return fs
      .readFileSync(`/proc/${processId}/cmdline`, "utf8")
      .split("\0")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isRunning(processId) {
  const args = processArguments(processId);
  if (
    !args.some((argument) =>
      argument.endsWith("/@rootsdk/dev-tools/bin/rootsdk"),
    )
  ) {
    return false;
  }

  try {
    const stat = fs.readFileSync(`/proc/${processId}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0] !== "Z";
  } catch {
    return false;
  }
}

const pending = [{ processId: "1", depth: 0 }];
const visited = new Set();

while (pending.length > 0) {
  const { processId, depth } = pending.shift();
  if (visited.has(processId)) continue;
  visited.add(processId);

  if (isRunning(processId)) process.exit(0);
  if (depth >= 4) continue;

  for (const childId of childIds(processId)) {
    pending.push({ processId: childId, depth: depth + 1 });
  }
}

process.exit(1);
