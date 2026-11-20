import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AttributeChangeRequest,
  AttributeHandler,
  AttributeHandlerContext,
  AttributeHandlerResult,
  Plugin,
  PluginContext,
  ReadonlyShape,
} from "../src/api/index.js";
import { CliApplication } from "../src/cli/CliApplication.js";

class ThemeAttributeHandler implements AttributeHandler {
  public readonly name = "test-theme";

  public handles(target: ReadonlyShape, attribute: string): boolean {
    return target.kind === "g" && attribute === "theme";
  }

  public apply(
    request: AttributeChangeRequest,
    context: AttributeHandlerContext,
  ): AttributeHandlerResult {
    const rectangleId = `${request.shapeId}-rect`;
    const labelId = `${request.shapeId}-label`;
    const oldFill = context.requireShape(rectangleId).getAttribute("fill") ?? "";
    const oldLabel = context.requireShape(labelId).getAttribute("text") ?? "";
    context.setAttribute(rectangleId, "fill", request.value);
    context.setAttribute(labelId, "text", `label:${request.value}`);
    return {
      executeMessage: `g#${request.shapeId} theme updated: "${request.value}"`,
      undoMessage: `g#${request.shapeId} theme restored: "${oldFill}/${oldLabel}"`,
      redoMessage: `g#${request.shapeId} theme updated: "${request.value}"`,
    };
  }
}

class FailingAttributeHandler implements AttributeHandler {
  public readonly name = "test-failing";

  public handles(target: ReadonlyShape, attribute: string): boolean {
    return target.kind === "g" && attribute === "explode";
  }

  public apply(request: AttributeChangeRequest, context: AttributeHandlerContext): void {
    context.setAttribute(`${request.shapeId}-rect`, "fill", "broken");
    context.setAttribute(`${request.shapeId}-label`, "text", "broken");
    throw new Error("simulated handler failure");
  }
}

class ConflictingAttributeHandler implements AttributeHandler {
  public constructor(public readonly name: string) {}

  public handles(target: ReadonlyShape, attribute: string): boolean {
    return target.kind === "g" && attribute === "conflict";
  }

  public apply(_request: AttributeChangeRequest, _context: AttributeHandlerContext): void {
    throw new Error("a conflicting handler must not execute");
  }
}

class NoopAttributeHandler implements AttributeHandler {
  public readonly name = "test-noop";

  public handles(target: ReadonlyShape, attribute: string): boolean {
    return target.kind === "g" && attribute === "noop";
  }

  public apply(_request: AttributeChangeRequest, _context: AttributeHandlerContext): void {}
}

class AttributeTestPlugin implements Plugin {
  public activate(context: PluginContext): void {
    context.attributes.register(new ThemeAttributeHandler());
    context.attributes.register(new FailingAttributeHandler());
    context.attributes.register(new NoopAttributeHandler());
    context.attributes.register(new ConflictingAttributeHandler("conflict-a"));
    context.attributes.register(new ConflictingAttributeHandler("conflict-b"));
  }
}

function createCompositeFixture(cli: CliApplication): void {
  assert.equal(cli.executeLine("init"), "canvas 800x600 created");
  assert.equal(cli.executeLine("create g node"), "g#node created");
  assert.equal(cli.executeLine("create rect node-rect 0 0 100 50 blue in node"), "rect#node-rect created in g#node");
  assert.equal(cli.executeLine('create text node-label 10 20 "old" in node'), "text#node-label created in g#node");
}

test("one attribute handler invocation is one incremental undo unit", () => {
  const cli = new CliApplication([new AttributeTestPlugin()]);
  createCompositeFixture(cli);

  assert.equal(cli.executeLine("set node theme red"), 'g#node theme updated: "red"');
  assert.match(cli.executeLine("tree") ?? "", /rect#node-rect x=0 y=0 w=100 h=50 fill=red/);
  assert.match(cli.executeLine("tree") ?? "", /text#node-label \(10,20\) "label:red"/);

  assert.equal(cli.executeLine("undo"), 'g#node theme restored: "blue/old"');
  assert.match(cli.executeLine("tree") ?? "", /rect#node-rect x=0 y=0 w=100 h=50 fill=blue/);
  assert.match(cli.executeLine("tree") ?? "", /text#node-label \(10,20\) "old"/);

  assert.equal(cli.executeLine("redo"), 'g#node theme updated: "red"');
  assert.match(cli.executeLine("tree") ?? "", /fill=red/);
  assert.match(cli.executeLine("tree") ?? "", /"label:red"/);
});

test("handler failure rolls back incremental changes and does not enter history", () => {
  const cli = new CliApplication([new AttributeTestPlugin()]);
  createCompositeFixture(cli);
  assert.equal(cli.executeLine("set node-rect fill green"), 'rect#node-rect updated: fill="green"');
  const beforeFailure = cli.executeLine("tree");

  assert.equal(cli.executeLine("set node explode now"), "error: simulated handler failure");
  assert.equal(cli.executeLine("tree"), beforeFailure);

  assert.equal(cli.executeLine("undo"), 'rect#node-rect updated: fill="blue"');
  assert.match(cli.executeLine("tree") ?? "", /fill=blue/);
  assert.equal(cli.executeLine("redo"), 'rect#node-rect updated: fill="green"');
});

test("multiple matching handlers are rejected before any handler executes", () => {
  const cli = new CliApplication([new AttributeTestPlugin()]);
  createCompositeFixture(cli);
  const beforeConflict = cli.executeLine("tree");

  assert.equal(
    cli.executeLine("set node conflict value"),
    "error: conflicting attribute handlers: conflict-a, conflict-b",
  );
  assert.equal(cli.executeLine("tree"), beforeConflict);
});

test("a handler that records no attribute changes violates the contract", () => {
  const cli = new CliApplication([new AttributeTestPlugin()]);
  createCompositeFixture(cli);
  const beforeNoop = cli.executeLine("tree");

  assert.equal(
    cli.executeLine("set node noop value"),
    "error: attribute handler made no changes: test-noop",
  );
  assert.equal(cli.executeLine("tree"), beforeNoop);
});
