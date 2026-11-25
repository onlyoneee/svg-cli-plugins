import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CliApplication } from "../src/cli/CliApplication.js";
import { StatsPlugin } from "../src/plugins/command-stats/StatsPlugin.js";
import { DirPlugin } from "../src/plugins/command-dir/DirPlugin.js";
import { NodeDirectoryReader } from "../src/plugins/command-dir/NodeDirectoryReader.js";

// Host integration tests complement the isolated command tests.
test("stats counts empty groups and preserves first-seen type order", () => {
  const cli = new CliApplication([new StatsPlugin()]);
  assert.equal(cli.executeLine("stats"), "error: no document. use 'init' or 'read' first");
  cli.executeLine("init");
  assert.equal(cli.executeLine("stats"), "(total 0, containers 0)");
  cli.executeLine("create g empty");
  cli.executeLine("create g group");
  cli.executeLine("create circle c 1 1 1 in group");
  cli.executeLine("create rect r 0 0 1 1");
  assert.equal(cli.executeLine("stats"), "circle: 1  rect: 1  (total 2, containers 2)");
  assert.equal(cli.executeLine("stats extra"), "error: usage: stats");
});

test("dir works without a document, sorts hidden entries, and does not mutate reader output", () => {
  const entries = Object.freeze([
    { name: "z.svg", kind: "file" as const },
    { name: "docs", kind: "directory" as const },
    { name: ".hidden", kind: "file" as const },
    { name: ".", kind: "directory" as const },
  ]);
  const cli = new CliApplication([new DirPlugin({ read: (path) => {
    assert.equal(path, process.cwd());
    return entries;
  } })]);
  assert.equal(cli.executeLine("dir"), "[DIR]  docs\n[FILE]  .hidden\n[FILE]  z.svg");
  assert.equal(cli.currentDocument(), null);
  assert.equal(cli.executeLine("dir extra"), "error: usage: dir");
  assert.equal(entries[0]?.name, "z.svg");
});

test("dir handles empty directories and failures while keeping CLI usable", () => {
  assert.equal(new CliApplication([new DirPlugin({ read: () => [] })]).executeLine("dir"), "(empty directory)");
  const cli = new CliApplication([new DirPlugin({ read: () => { throw new Error("denied"); } })]);
  assert.equal(cli.executeLine("dir"), `error: cannot read directory: ${process.cwd()}`);
  assert.equal(cli.executeLine("init"), "canvas 800x600 created");
});

test("queries preserve document and pending redo, including directory failure", () => {
  for (const fails of [false, true]) {
    const cli = new CliApplication([new StatsPlugin(), new DirPlugin({ read: () => {
      if (fails) throw new Error("denied");
      return [];
    } })]);
    cli.executeLine("init");
    cli.executeLine("create rect r 0 0 10 10");
    cli.executeLine("move r 2 3");
    cli.executeLine("undo");
    const before = cli.currentDocument()?.toSvg();
    cli.executeLine("stats");
    cli.executeLine("dir");
    assert.equal(cli.currentDocument()?.toSvg(), before);
    assert.equal(cli.executeLine("redo"), "rect#r moved to (2,3)");
    assert.equal(cli.executeLine("undo"), "rect#r moved back to (0,0)");
  }
});

test("plugins can be enabled separately and contribute help automatically", () => {
  const stats = new CliApplication([new StatsPlugin()]);
  assert.ok(stats.executeLine("help")?.split("\n").includes("stats"));
  assert.equal(stats.executeLine("dir"), "error: unknown command: dir");
  const dir = new CliApplication([new DirPlugin({ read: () => [] })]);
  assert.ok(dir.executeLine("help")?.split("\n").includes("dir"));
  assert.equal(dir.executeLine("stats"), "error: unknown command: stats");
});

test("real adapter reads direct children including hidden files", () => {
  const path = mkdtempSync(join(tmpdir(), "svg-command-dir-"));
  try {
    mkdirSync(join(path, "docs"));
    writeFileSync(join(path, ".hidden"), "");
    writeFileSync(join(path, "docs", "nested.txt"), "");
    const entries = new NodeDirectoryReader().read(path);
    assert.deepEqual([...entries].sort((a, b) => a.name < b.name ? -1 : 1), [
      { name: ".hidden", kind: "file" },
      { name: "docs", kind: "directory" },
    ]);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});


test("queries preserve multi-step undo/redo and existing I/O barriers against an untouched session", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-query-history-"));
  const file = join(directory, "saved.svg");
  const originalCwd = process.cwd();
  try {
    for (const fails of [false, true]) {
      const baseline = new CliApplication();
      const queried = new CliApplication([new StatsPlugin(), new DirPlugin({ read: () => {
        if (fails) throw new Error("denied");
        return [];
      } })]);
      const session = [
        "init", "undo", "create rect r 0 0 10 10", "move r 2 3", "set r fill red",
        "undo", "undo", "redo", "redo", "undo", "create circle c 2 2 1", "redo",
        "undo", "undo", "redo", `save "${file}"`, "undo", "redo",
        "move r 1 1", "undo", "redo", `read "${file}"`, "undo", "redo",
      ];
      for (const line of session) {
        assert.equal(queried.executeLine(line), baseline.executeLine(line), line);
        const document = queried.currentDocument();
        const svg = document?.toSvg();
        const sourcePath = document?.sourcePath;
        const tree = queried.executeLine("tree");
        assert.doesNotMatch(queried.executeLine("stats") ?? "", /^error:/);
        const listing = queried.executeLine("dir");
        assert.equal(listing, fails ? `error: cannot read directory: ${originalCwd}` : "(empty directory)");
        assert.equal(queried.currentDocument(), document);
        assert.equal(document?.toSvg(), svg);
        assert.equal(document?.sourcePath, sourcePath);
        assert.equal(queried.executeLine("tree"), tree);
        assert.equal(queried.currentDocument()?.toSvg(), baseline.currentDocument()?.toSvg());
        assert.equal(process.cwd(), originalCwd);
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
