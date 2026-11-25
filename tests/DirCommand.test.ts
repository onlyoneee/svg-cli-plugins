import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DirCommand } from "../src/plugins/command-dir/DirCommand.js";
import type { DirectoryEntry } from "../src/plugins/command-dir/DirectoryReader.js";
import { NodeDirectoryReader } from "../src/plugins/command-dir/NodeDirectoryReader.js";
import { queryContext } from "./helpers/commandDoubles.js";

const entries: readonly DirectoryEntry[] = Object.freeze([
  { name: "z", kind: "file" }, { name: "b", kind: "directory" },
  { name: ".hidden", kind: "file" }, { name: "a", kind: "directory" },
  { name: "A", kind: "file" }, { name: "a", kind: "file" },
  { name: "link", kind: "other" }, { name: ".", kind: "directory" },
  { name: "..", kind: "directory" },
]);

test("dir is independent of SVG and stable across input permutations without mutating entries", () => {
  const expected = "[DIR]  a\n[DIR]  b\n[FILE]  .hidden\n[FILE]  A\n[FILE]  a\n[FILE]  z\n[OTHER]  link";
  for (let offset = 0; offset < entries.length; offset++) {
    const input = Object.freeze([...entries.slice(offset), ...entries.slice(0, offset)]);
    const before = JSON.stringify(input);
    const command = new DirCommand({ read: (path) => {
      assert.equal(path, "/fixture with spaces");
      return input;
    } });
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(command.execute([], queryContext(null, "/fixture with spaces")), expected);
      assert.equal(JSON.stringify(input), before);
    }
  }
});

test("dir handles empty/dot-only directories and validates arguments before reading", () => {
  for (const input of [[], entries.filter((entry) => entry.name === "." || entry.name === "..")]) {
    assert.equal(new DirCommand({ read: () => input }).execute([], queryContext()), "(empty directory)");
  }
  const command = new DirCommand({ read: () => { throw new Error("reader should not be called"); } });
  assert.throws(() => command.execute(["."], queryContext()), /^Error: usage: dir$/);
});

test("dir translates any reader failure without leaking implementation details and can recover", () => {
  let failure = true;
  const command = new DirCommand({ read: () => {
    if (failure) throw { code: "EACCES", details: "private" };
    return [];
  } });
  assert.throws(() => command.execute([], queryContext()), /^Error: cannot read directory: \/fixture$/);
  failure = false;
  assert.equal(command.execute([], queryContext()), "(empty directory)");
});

test("dir and the real adapter handle direct entries, symlinks, empty and unreadable paths", () => {
  const root = mkdtempSync(join(tmpdir(), "svg-dir-adapter-"));
  const cwd = process.cwd();
  const command = new DirCommand(new NodeDirectoryReader());
  try {
    assert.equal(command.execute([], queryContext(null, root)), "(empty directory)");
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "nested.txt"), "not listed");
    writeFileSync(join(root, ".hidden"), "");
    writeFileSync(join(root, "demo.svg"), "");
    symlinkSync("docs", join(root, "dir-link"), "dir");
    symlinkSync("demo.svg", join(root, "file-link"), "file");
    symlinkSync("missing", join(root, "broken-link"), "file");
    const expected = "[DIR]  docs\n[FILE]  .hidden\n[FILE]  demo.svg\n[OTHER]  broken-link\n[OTHER]  dir-link\n[OTHER]  file-link";
    assert.equal(command.execute([], queryContext(null, root)), expected);
    assert.equal(command.execute([], queryContext(null, root)), expected);
    for (const path of [join(root, "missing"), join(root, "demo.svg")]) {
      assert.throws(() => command.execute([], queryContext(null, path)), { message: `cannot read directory: ${path}` });
    }
    assert.equal(process.cwd(), cwd);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
