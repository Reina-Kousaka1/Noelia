const { spawn } = require("node:child_process");
const path = require("node:path");
const { createDevhostEnvironment } = require("./devhost-config.cjs");
const { createSecretRedactor } = require("./secret-redactor.cjs");

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
    stdio: ["inherit", "pipe", "pipe"],
  });

  const secrets = [
    process.env.NOELIA_ROOT_APP_DEV_TOKEN,
    process.env.NOELIA_ROOT_BOT_DEV_TOKEN,
  ].filter((value) => typeof value === "string" && value.length > 0);
  const stdoutRedactor = createSecretRedactor(secrets, process.stdout);
  const stderrRedactor = createSecretRedactor(secrets, process.stderr);
  child.stdout.on("data", (chunk) => stdoutRedactor.write(chunk));
  child.stderr.on("data", (chunk) => stderrRedactor.write(chunk));
  child.stdout.on("end", () => stdoutRedactor.flush());
  child.stderr.on("end", () => stderrRedactor.flush());

  child.on("error", () => {
    process.stderr.write("Root DevHost could not start. Check the local Root SDK installation.\n");
    process.exitCode = 1;
  });
  child.on("close", (code) => {
    stdoutRedactor.flush();
    stderrRedactor.flush();
    process.exitCode = code ?? 1;
  });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
