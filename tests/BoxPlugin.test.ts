import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Plugin } from "../src/api/index.js";
import { CliApplication } from "../src/cli/CliApplication.js";
import { BoxShapeProvider } from "../src/plugins/box/BoxShapeProvider.js";
import plugin, { manifest } from "../src/plugins/box/index.mjs";

function session(...others: Plugin[]): CliApplication {
  const cli = new CliApplication([{ plugin, manifest }, ...others]);
  assert.deepEqual(cli.startupErrors(), []);
  assert.equal(cli.executeLine("init"), "canvas 800x600 created");
  return cli;
}

const createBox = 'create box n1 120 100 160 60 "开始"';
const created = "box#n1 created (g#n1 + rect#n1-rect + text#n1-label)";

test("the box provider builds the Phase 1 template independently", () => {
  const provider = new BoxShapeProvider();
  const shape = provider.create({ id: "n1", parameters: ["120", "100", "160", "60", "开始"] });
  assert.deepEqual(shape.children.map((child) => [child.kind, child.id, child.parentId]), [
    ["rect", "n1-rect", "n1"], ["text", "n1-label", "n1"],
  ]);
  assert.equal(shape.children[0]?.summary(), "rect#n1-rect x=120 y=100 w=160 h=60 fill=#4a90d9");
  assert.equal(shape.children[1]?.summary(), 'text#n1-label (140,135) "开始"');
  assert.equal(shape.kind, "box");
  assert.equal(shape.summary(), "g#n1");
});

test("nested boxes move, scale, group and delete as complete subtrees", () => {
  const cli = session();
  assert.equal(cli.executeLine("create g outer"), "g#outer created");
  assert.equal(cli.executeLine(createBox + " in outer"), created + " in g#outer");
  assert.match(cli.executeLine('create box n2 20 10 40 20 "inner" in n1')!, /created .* in g#n1$/);
  const tree = cli.executeLine("tree");
  assert.equal(cli.executeLine("move n1 5 10"), "box#n1 moved by (5,10)");
  assert.equal(cli.executeLine("scale n1 2"), "box#n1 scaled by 2");
  const doc = cli.currentDocument()!;
  assert.equal(doc.requireShape("n1-rect").summary(), "rect#n1-rect x=250 y=220 w=320 h=120 fill=#4a90d9");
  assert.equal(doc.requireShape("n2-label").summary(), 'text#n2-label (90,70) "inner"');
  cli.executeLine("undo");
  assert.equal(cli.executeLine("undo"), "box#n1 moved back by (-5,-10)");
  assert.equal(cli.executeLine("tree"), tree);
  assert.equal(cli.executeLine("group cluster n1"), "g#cluster created with 1 children");
  cli.executeLine("undo");
  assert.equal(cli.executeLine("tree"), tree);
  assert.equal(cli.executeLine("delete n1"), "box#n1 deleted");
  assert.equal(doc.countElements(), 1);
  cli.executeLine("undo");
  assert.equal(cli.executeLine("tree"), tree);
  cli.executeLine("redo");
  assert.equal(doc.countElements(), 1);
});

test("each semantic set has one undo unit and redo restores both edits in order", () => {
  const cli = session();
  assert.equal(cli.executeLine(createBox), created);
  const before = cli.executeLine("tree");
  assert.equal(cli.executeLine("set n1 fill red"), "box#n1 fill propagated to n1-rect");
  const filled = cli.executeLine("tree");
  assert.match(filled!, /fill=red/);
  assert.equal(cli.currentDocument()!.requireShape("n1").getStyle("fill"), undefined);
  assert.equal(cli.executeLine('set n1 label "处理数据 v2"'), 'box#n1 label updated: "处理数据 v2"');
  const edited = cli.executeLine("tree");
  assert.match(edited!, /"处理数据 v2"/);
  assert.equal(cli.executeLine("undo"), 'box#n1 label restored: "开始"');
  assert.equal(cli.executeLine("tree"), filled);
  cli.executeLine("undo");
  assert.equal(cli.executeLine("tree"), before);
  cli.executeLine("redo");
  assert.equal(cli.executeLine("tree"), filled);
  cli.executeLine("redo");
  assert.equal(cli.executeLine("tree"), edited);
});

test("creation rejects conflicting root or derived IDs, invalid geometry and invalid destinations atomically", () => {
  for (const id of ["n1", "n1-rect", "n1-label"]) {
    const cli = session();
    cli.executeLine(`create g ${id}`);
    const before = cli.executeLine("tree");
    assert.equal(cli.executeLine(createBox), `error: id already exists: ${id}`);
    assert.equal(cli.executeLine("tree"), before);
    cli.executeLine("undo");
    assert.equal(cli.currentDocument()!.countElements(), 0);
  }
  const cli = session();
  for (const command of ['create box n1 0 0 10 20', 'create box n1 NaN 0 10 20 "x"',
    'create box n1 0 0 -1 5 "x"', createBox + " in missing"]) {
    assert.match(cli.executeLine(command)!, /^error:/);
    assert.equal(cli.currentDocument()!.countElements(), 0);
  }
});

test("structural errors leave the tree and redo intact, including a mixed group operation", () => {
  const cli = session();
  cli.executeLine("create g free");
  cli.executeLine("create g outer");
  cli.executeLine(createBox + " in outer");
  cli.executeLine("set n1 label next");
  cli.executeLine("undo");
  const before = cli.executeLine("tree");
  assert.equal(cli.executeLine("ungroup n1"), "error: cannot ungroup composite shape: n1");
  assert.match(cli.executeLine("delete n1-rect")!, /^error: cannot remove required child/);
  assert.match(cli.executeLine("addto outer n1-label")!, /^error: cannot remove required child/);
  assert.match(cli.executeLine("group mixed free n1-label")!, /^error: cannot remove required child/);
  assert.equal(cli.executeLine("tree"), before);
  assert.equal(cli.executeLine("redo"), 'box#n1 label updated: "next"');
});

test("an attribute handler that throws after writing rolls back and preserves earlier history", () => {
  const failure: Plugin = {
    activate(context) {
      context.attributes.register({
        name: "test-partial-write",
        handles: (target, attribute) => target.kind === "box" && attribute === "broken",
        apply({ shapeId }, transaction) {
          transaction.setAttribute(`${shapeId}-rect`, "fill", "green");
          transaction.setAttribute(`${shapeId}-label`, "text", "wrong");
          throw new Error("partial failure");
        },
      });
    },
  };
  const cli = session(failure);
  cli.executeLine(createBox);
  cli.executeLine("set n1 label next");
  cli.executeLine("undo");
  const before = cli.executeLine("tree");
  assert.equal(cli.executeLine("set n1 broken value"), "error: partial failure");
  assert.equal(cli.executeLine("tree"), before);
  assert.equal(cli.executeLine("redo"), 'box#n1 label updated: "next"');
  cli.executeLine("undo");
  cli.executeLine("undo");
  assert.equal(cli.currentDocument()!.countElements(), 0);
});

test("saved boxes round-trip with custom geometry, styles and child order, or open as ordinary groups", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "box-roundtrip-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "drawing.svg");
  const cli = session();
  cli.executeLine(createBox);
  cli.executeLine("create g extra in n1");
  cli.executeLine("set n1 fill red");
  cli.executeLine('set n1 label "A & <B>"');
  cli.executeLine("set n1 stroke black");
  cli.executeLine("move n1-label 7 3");
  cli.executeLine("back n1-label");
  const tree = cli.executeLine("tree");
  assert.equal(cli.executeLine(`save "${path}"`), `saved to ${path} (4 elements)`);
  const svg = readFileSync(path, "utf8");
  assert.match(svg, /data-kind="box"/);
  assert.match(svg, /A &amp; &lt;B&gt;/);
  const loaded = session();
  assert.equal(loaded.executeLine(`read "${path}"`), `read ${path} (4 elements)`);
  assert.equal(loaded.executeLine("tree"), tree);
  assert.equal(loaded.currentDocument()!.toSvg(), svg);
  assert.equal(loaded.executeLine("set n1 label loaded"), 'box#n1 label updated: "loaded"');

  const plain = new CliApplication();
  assert.equal(plain.executeLine(`read "${path}"`), `read ${path} (4 elements)`);
  assert.equal(plain.currentDocument()!.requireShape("n1").kind, "g");
  assert.equal(plain.executeLine("delete n1-label"), "text#n1-label deleted");
});

test("malformed box input rejects the entire read and preserves the old document and history", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "box-invalid-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "bad.svg");
  const cli = session();
  cli.executeLine(createBox);
  const before = cli.executeLine("tree");
  const rect = '<rect id="b-rect" x="0" y="0" width="10" height="10"/>';
  const label = '<text id="b-label" x="1" y="1">text</text>';
  const malformed = [
    rect, label,
    rect + '<g id="b-label"/>',
    rect + '<g id="other">' + label + '</g>',
    rect + rect + label,
  ];
  for (const children of malformed) {
    writeFileSync(path, `<svg width="40" height="40"><g id="b" data-kind="box">${children}</g></svg>`);
    assert.match(cli.executeLine(`read "${path}"`)!, /^error: (invalid box#b|id already exists)/);
    assert.equal(cli.executeLine("tree"), before);
  }
  cli.executeLine("undo");
  assert.equal(cli.currentDocument()!.countElements(), 0);
});
