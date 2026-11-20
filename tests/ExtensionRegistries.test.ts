import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AttributeChangeRequest,
  AttributeHandler,
  AttributeHandlerContext,
  Command,
  CommandContext,
  ReadonlyShape,
  ShapeCreateRequest,
  ShapeProvider,
  ShapeProviderContext,
  ShapeReadRequest,
  TreeDecorationContext,
  TreeDecorator,
  TreeNodeView,
} from "../src/api/index.js";
import {
  AttributeHandlerRegistry,
  CommandRegistry,
  ShapeProviderRegistry,
  TreeDecoratorRegistry,
} from "../src/core/registries/index.js";
import { GroupShape } from "../src/model/shapes/GroupShape.js";
import type { Shape } from "../src/model/shapes/Shape.js";

class FakeCommand implements Command {
  public readonly helpLines: readonly string[];

  public constructor(
    public readonly name: string,
    public readonly requiresDocument = true,
    helpLine = name,
  ) {
    this.helpLines = [helpLine];
  }

  public execute(_arguments: readonly string[], _context: CommandContext): string {
    return this.name;
  }
}

class FakeShapeProvider implements ShapeProvider {
  public constructor(
    public readonly name: string,
    public readonly shapeType: string,
    public readonly svgTag: string,
    public readonly serializedKind?: string,
  ) {}

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    return new GroupShape(request.id);
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    return new GroupShape(request.id);
  }
}

class FakeAttributeHandler implements AttributeHandler {
  public constructor(
    public readonly name: string,
    private readonly supportedAttribute: string,
  ) {}

  public handles(_target: ReadonlyShape, attribute: string): boolean {
    return attribute === this.supportedAttribute;
  }

  public apply(_request: AttributeChangeRequest, _context: AttributeHandlerContext): void {}
}

class FakeTreeDecorator implements TreeDecorator {
  public constructor(
    public readonly name: string,
    private readonly label: string,
  ) {}

  public decorate(_node: TreeNodeView, _context: TreeDecorationContext): string {
    return this.label;
  }
}

const shapeView: ReadonlyShape = {
  id: "n1",
  type: "g",
  kind: "box",
  parentId: null,
  children: [],
  getAttribute: () => undefined,
  summary: () => "g#n1",
};

test("command registry preserves order and performs case-insensitive lookup", () => {
  const registry = new CommandRegistry();
  const stats = new FakeCommand("stats");
  const directory = new FakeCommand("dir", false);

  registry.register(stats);
  registry.register(directory);

  assert.equal(registry.get("STATS"), stats);
  assert.deepEqual(registry.list(), [stats, directory]);
  assert.deepEqual(registry.names(), ["stats", "dir"]);
  assert.throws(
    () => registry.register(new FakeCommand("stats")),
    /duplicate registration: commands\/stats/,
  );
  assert.deepEqual(registry.names(), ["stats", "dir"]);
});

test("command registry rejects empty names and missing help", () => {
  const registry = new CommandRegistry();
  assert.throws(() => registry.register(new FakeCommand("  ")), /commands\/<empty>/);

  const command = new FakeCommand("silent");
  Object.defineProperty(command, "helpLines", { value: [] });
  assert.throws(() => registry.register(command), /help is required/);
});

test("shape provider registry supports creation, specialized read, and fallback lookup", () => {
  const registry = new ShapeProviderRegistry();
  const group = new FakeShapeProvider("g", "g", "g");
  const box = new FakeShapeProvider("box", "box", "g", "box");

  registry.register(group);
  registry.register(box);

  assert.equal(registry.findByShapeType("BOX"), box);
  assert.equal(registry.findBySvgTag("g"), group);
  assert.equal(registry.findBySerializedKind("box"), box);
  assert.equal(registry.findForRead("g", "box"), box);
  assert.equal(registry.findForRead("g", "missing-plugin"), group);
  assert.deepEqual(registry.names(), ["g", "box"]);
});

test("shape provider registry rejects conflicting lookup keys", () => {
  const registry = new ShapeProviderRegistry();
  registry.register(new FakeShapeProvider("g", "g", "g"));

  assert.throws(
    () => registry.register(new FakeShapeProvider("other-group", "other", "g")),
    /duplicate registration: shapes\/g/,
  );
  assert.deepEqual(registry.names(), ["g"]);

  registry.register(new FakeShapeProvider("box", "box", "g", "box"));
  assert.throws(
    () => registry.register(new FakeShapeProvider("other-box", "other-box", "g", "box")),
    /duplicate registration: shapes\/box/,
  );
  assert.deepEqual(registry.names(), ["g", "box"]);
});

test("attribute handler registry returns every match in registration order", () => {
  const registry = new AttributeHandlerRegistry();
  const first = new FakeAttributeHandler("box-fill-first", "fill");
  const second = new FakeAttributeHandler("box-fill-second", "fill");
  const label = new FakeAttributeHandler("box-label", "label");

  registry.register(first);
  registry.register(second);
  registry.register(label);

  assert.deepEqual(registry.findMatches(shapeView, "fill"), [first, second]);
  assert.deepEqual(registry.findMatches(shapeView, "unknown"), []);
  assert.throws(
    () => registry.register(new FakeAttributeHandler("box-label", "label")),
    /duplicate registration: attributes\/box-label/,
  );
});

test("tree decorator registry preserves deterministic composition order", () => {
  const registry = new TreeDecoratorRegistry();
  const box = new FakeTreeDecorator("box-type-label", "(box)");
  const modified = new FakeTreeDecorator("modified-star", "*");

  registry.register(box);
  registry.register(modified);

  assert.deepEqual(registry.list(), [box, modified]);
  assert.deepEqual(registry.names(), ["box-type-label", "modified-star"]);
  assert.throws(
    () => registry.register(new FakeTreeDecorator("modified-star", "!")),
    /duplicate registration: decorators\/modified-star/,
  );
});
