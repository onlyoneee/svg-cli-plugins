import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  RectShape,
  type Plugin,
  type PluginContext,
  type Shape,
  type ShapeCreateRequest,
  type ShapeProvider,
  type ShapeProviderContext,
  type ShapeReadRequest,
} from "../src/api/index.js";
import { CliApplication } from "../src/cli/CliApplication.js";

class SquareShapeProvider implements ShapeProvider {
  public readonly name = "square";
  public readonly shapeType = "square";
  public readonly svgTag = "rect";
  public readonly serializedKind = "square";
  public createCalls = 0;
  public readCalls = 0;

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    this.createCalls += 1;
    const [x = "", y = "", size = ""] = request.parameters;
    return new RectShape(request.id, Number(x), Number(y), Number(size), Number(size));
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    this.readCalls += 1;
    const value = (name: string): number => Number(request.element.attributes.get(name));
    return new RectShape(request.id, value("x"), value("y"), value("width"), value("height"));
  }
}

class SquarePlugin implements Plugin {
  public constructor(public readonly provider = new SquareShapeProvider()) {}

  public activate(context: PluginContext): void {
    context.shapes.register(this.provider);
  }
}

test("create resolves a new shape type through the provider registry", () => {
  const plugin = new SquarePlugin();
  const cli = new CliApplication([plugin]);

  assert.equal(cli.executeLine("init"), "canvas 800x600 created");
  assert.equal(cli.executeLine("create square s1 10 20 30"), "rect#s1 created");
  assert.equal(plugin.provider.createCalls, 1);
  assert.match(cli.executeLine("tree") ?? "", /rect#s1 x=10 y=20 w=30 h=30/);
});

test("read uses data-kind for specialized providers and falls back to the SVG tag", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-shape-provider-"));
  const path = join(directory, "square.svg");
  writeFileSync(
    path,
    '<svg width="100" height="100"><rect id="s1" data-kind="square" x="1" y="2" width="30" height="30"/></svg>',
    "utf8",
  );

  try {
    const plugin = new SquarePlugin();
    const specializedCli = new CliApplication([plugin]);
    assert.equal(specializedCli.executeLine(`read "${path}"`), `read ${path} (1 elements)`);
    assert.equal(plugin.provider.readCalls, 1);

    const fallbackCli = new CliApplication();
    assert.equal(fallbackCli.executeLine(`read "${path}"`), `read ${path} (1 elements)`);
    assert.match(fallbackCli.executeLine("tree") ?? "", /rect#s1 x=1 y=2 w=30 h=30/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
