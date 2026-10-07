const { spawn } = require("node:child_process");
const path = require("node:path");
const { createDevhostEnvironment } = require("./devhost-config.cjs");

const rootProject = path.resolve(__dirname, "..");
const runtimes = {
  app: {
    cwd: path.join(rootProject, "server"),
    args: ["--project-folder=../"],
  },
  bot: {
    cwd: path.join(rootProject, "community-bot"),
    args: [],
  },
};

const surface = process.argv[2];
const runtime = runtimes[surface];

try {
  if (!runtime) throw new Error("Choose the app or bot runtime.");

  const environment = createDevhostEnvironment(surface);
  const rootSdkCli = path.join(rootProject, "node_modules", "@rootsdk", "dev-tools", "bin", "rootsdk");
  const child = spawn(process.execPath, [rootSdkCli, "start", "devhost", ...runtime.args], {
    cwd: runtime.cwd,
    env: environment,
    stdio: "inherit",
  });

  child.on("error", () => {
    process.stderr.write("Root DevHost could not start. Check the local Root SDK installation.\n");
    process.exitCode = 1;
  });
  child.on("close", (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
