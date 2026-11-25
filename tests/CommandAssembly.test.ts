import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, dirname } from "node:path";
import { test } from "node:test";

const root = resolve(__dirname, "../..");
const harness = resolve(__dirname, "helpers/commandSession.js");

function run(cwd: string, input: string, config?: string, entry = harness): string {
  const result = spawnSync(process.execPath, [entry, ...(config ? [config] : [])], { cwd, input, encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return result.stdout;
}

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "svg-command-assembly-"));
  mkdirSync(join(directory, "docs"));
  writeFileSync(join(directory, ".hidden"), "");
  writeFileSync(join(directory, "demo.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"/>');
  return directory;
}

test("code and configuration contract harness produce identical transcript bytes in a fixed cwd", () => {
  const cwd = fixture();
  try {
    const input = readFileSync(join(root, "doc/transcript/b-commands.txt"), "utf8");
    const expected = readFileSync(join(root, "doc/transcript/b-commands.expected.txt"), "utf8");
    const code = run(cwd, input);
    const configured = run(cwd, input, join(root, "examples/command-plugins.config.json"));
    assert.equal(code, expected);
    assert.equal(configured, code);
    const interactive = run(cwd, input, undefined, join(root, "dist/src/assembly/command-plugins-main.mjs"));
    const body = interactive.slice(interactive.indexOf("\n") + 1).replaceAll("svg> ", "").trimEnd();
    assert.equal(body, expected.trimEnd());
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("configuration can enable either command independently with paths relative to config", () => {
  const cwd = fixture();
  const configs = mkdtempSync(join(tmpdir(), "svg-plugin-configs-"));
  const file = join(configs, "plugins.json");
  try {
    for (const selected of ["stats", "dir", "none"]) {
      const plugins = ["stats", "dir"].map((name) => ({
        module: `./${relative(dirname(file), join(root, `src/plugins/command-${name}`))}`,
        enabled: name === selected,
      }));
      // A nonexistent disabled entry must never be evaluated.
      writeFileSync(file, JSON.stringify({ plugins: [...plugins, { module: "./missing", enabled: false }] }));
      const output = run(cwd, "init\nstats\ndir\nhelp\n", file);
      assert.equal(output.includes("error: unknown command: stats"), selected !== "stats");
      assert.equal(output.includes("error: unknown command: dir"), selected !== "dir");
      const lines = output.split("\n");
      assert.equal(lines.includes("stats"), selected === "stats");
      assert.equal(lines.includes("dir"), selected === "dir");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(configs, { recursive: true, force: true });
  }
});

test("read and save do not redirect dir to the SVG directory in either assembly", () => {
  const cwd = fixture();
  const documents = mkdtempSync(join(tmpdir(), "svg-documents-"));
  const inputPath = join(documents, "input.svg");
  const outputPath = join(documents, "output.svg");
  try {
    writeFileSync(inputPath, '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"/>');
    const listing = "[DIR]  docs\n[FILE]  .hidden\n[FILE]  demo.svg";
    const input = `dir\nread "${inputPath}"\ndir\nsave "${outputPath}"\ndir\n`;
    for (const config of [undefined, join(root, "examples/command-plugins.config.json")]) {
      const output = run(cwd, input, config);
      assert.equal(output.split(listing).length - 1, 3);
      assert.equal(output.includes("error:"), false, output);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(documents, { recursive: true, force: true });
  }
});
