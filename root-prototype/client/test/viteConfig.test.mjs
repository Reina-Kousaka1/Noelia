import assert from "node:assert/strict";
import test from "node:test";
import config from "../vite.config.mjs";

async function pluginsFor(command) {
  const resolved = await config({ command, mode: "test" });
  return resolved.plugins.flat(Infinity);
}

test("Vite production builds leave type-checking to the tsc build step", async () => {
  const plugins = await pluginsFor("build");
  assert.equal(
    plugins.some((plugin) => plugin?.name === "vite-plugin-checker"),
    false,
  );
});

test("Vite development keeps the interactive TypeScript checker", async () => {
  const plugins = await pluginsFor("serve");
  assert.equal(
    plugins.some((plugin) => plugin?.name === "vite-plugin-checker"),
    true,
  );
});
