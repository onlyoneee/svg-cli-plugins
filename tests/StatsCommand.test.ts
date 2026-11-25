import assert from "node:assert/strict";
import { test } from "node:test";
import { StatsCommand } from "../src/plugins/command-stats/StatsCommand.js";
import { document, queryContext, shape } from "./helpers/commandDoubles.js";

const run = (roots: Parameters<typeof document>[0]): string =>
  new StatsCommand().execute([], queryContext(document(roots)));

test("stats independently handles an empty canvas and empty containers", () => {
  assert.equal(run([]), "(total 0, containers 0)");
  assert.equal(run([shape("g"), shape("g", [], "box")]), "(total 0, containers 2)");
});

test("stats visits nested groups and box children depth first in current order", () => {
  const roots = [
    shape("text"),
    shape("g", [shape("circle"), shape("g", [shape("rect"), shape("text")], "box"), shape("g")]),
    shape("rect"), shape("diamond"),
  ];
  assert.equal(run(roots), "text: 2  circle: 1  rect: 2  diamond: 1  (total 6, containers 3)");
  assert.equal(run([...roots].reverse()), "diamond: 1  rect: 2  circle: 1  text: 2  (total 6, containers 3)");
});

test("stats counts all six builtin types correctly and keeps no cross-call state", () => {
  const command = new StatsCommand();
  const context = queryContext(document([shape("g", [
    shape("ellipse"), shape("line"), shape("circle"), shape("rect"), shape("text"),
  ])]));
  const expected = "ellipse: 1  line: 1  circle: 1  rect: 1  text: 1  (total 5, containers 1)";
  assert.equal(command.execute([], context), expected);
  assert.equal(command.execute([], context), expected);
  assert.equal(command.execute([], queryContext(document([]))), "(total 0, containers 0)");
});

test("stats rejects arguments before accessing the document", () => {
  assert.throws(() => new StatsCommand().execute(["extra"], queryContext()), /^Error: usage: stats$/);
});
