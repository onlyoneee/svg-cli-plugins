import { createInterface } from "node:readline";
import { CliApplication } from "./cli/CliApplication.js";
import box, { manifest } from "./plugins/box/index.mjs";

const application = new CliApplication(process.argv.includes("--box") ? [{ plugin: box, manifest }] : []);
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "svg> ",
});

for (const error of application.startupErrors()) console.error(error);
console.log("svg-editor 0.1 — type 'help' for commands");
terminal.prompt();

terminal.on("line", (line) => {
  const output = application.executeLine(line);
  if (output) console.log(output);
  terminal.prompt();
});

terminal.on("close", () => {
  console.log();
});
