import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  Plugin,
  PluginContext,
  TreeDecorationContext,
  TreeDecorator,
  TreeNodeView,
} from "../src/api/index.js";
import { CliApplication } from "../src/cli/CliApplication.js";

class ShapeKindDecorator implements TreeDecorator {
  public readonly name = "test-shape-kind";

  public decorate(node: TreeNodeView, _context: TreeDecorationContext): string | undefined {
    return node.shape ? `(${node.shape.kind})` : undefined;
  }
}

class MarkerDecorator implements TreeDecorator {
  public readonly name = "test-marker";

  public decorate(node: TreeNodeView, _context: TreeDecorationContext): string | undefined {
    if (node.kind === "canvas" || node.shape?.id === "r1") return "*";
    return undefined;
  }
}

class EmptyDecorator implements TreeDecorator {
  public readonly name = "test-empty";

  public decorate(_node: TreeNodeView, _context: TreeDecorationContext): string {
    return "   ";
  }
}

class TreeLabelsPlugin implements Plugin {
  public activate(context: PluginContext): void {
    context.decorators.register(new ShapeKindDecorator());
    context.decorators.register(new MarkerDecorator());
    context.decorators.register(new EmptyDecorator());
  }
}

class ThrowingDecorator implements TreeDecorator {
  public readonly name = "test-throwing";

  public decorate(_node: TreeNodeView, _context: TreeDecorationContext): string {
    throw new Error("simulated decorator failure");
  }
}

class ThrowingTreePlugin implements Plugin {
  public activate(context: PluginContext): void {
    context.decorators.register(new ThrowingDecorator());
  }
}

test("tree appends decorator labels in registration order and ignores empty labels", () => {
  const cli = new CliApplication([new TreeLabelsPlugin()]);
  cli.executeLine("init 100 80");
  cli.executeLine("create g group");
  cli.executeLine("create rect r1 0 0 10 20 red in group");
  cli.executeLine("create circle c1 30 30 5 blue");

  assert.equal(
    cli.executeLine("tree"),
    `svg (100x80) *
├── g#group (g)
│   └── rect#r1 x=0 y=0 w=10 h=20 fill=red (rect) *
└── circle#c1 cx=30 cy=30 r=5 fill=blue (circle)`,
  );

  assert.equal(
    cli.executeLine("tree group"),
    `g#group (g)
└── rect#r1 x=0 y=0 w=10 h=20 fill=red (rect) *`,
  );
});

test("a decorator failure does not change the document or undo history", () => {
  const cli = new CliApplication([new ThrowingTreePlugin()]);
  cli.executeLine("init");
  cli.executeLine("create rect r1 0 0 10 20");
  cli.executeLine("move r1 5 6");

  assert.equal(cli.executeLine("tree"), "error: simulated decorator failure");
  assert.equal(cli.executeLine("undo"), "rect#r1 moved back to (0,0)");
  assert.match(cli.executeLine("show r1") ?? "", /x=0 y=0/);
});
