/** B's code-composition example. The original Phase 1 entry stays unchanged. */
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import type { PluginManifest } from "../api/index.js";
import { CliApplication } from "../cli/CliApplication.js";
import stats from "../plugins/command-stats/index.mjs";
import dir from "../plugins/command-dir/index.mjs";

const require = createRequire(import.meta.url);
// Read the source manifests, which remain alongside the repository plugin packages.
const statsManifest = require("../../../src/plugins/command-stats/package.json") as PluginManifest;
const dirManifest = require("../../../src/plugins/command-dir/package.json") as PluginManifest;
const application = new CliApplication([
  { plugin: stats, manifest: statsManifest },
  { plugin: dir, manifest: dirManifest },
]);
const terminal = createInterface({ input: process.stdin, output: process.stdout, prompt: "svg> " });
for (const error of application.startupErrors()) console.error(error);
console.log("svg-editor 0.1 — type 'help' for commands");
terminal.prompt();
terminal.on("line", (line) => {
  const output = application.executeLine(line);
  if (output) console.log(output);
  terminal.prompt();
});
terminal.on("close", () => console.log());
