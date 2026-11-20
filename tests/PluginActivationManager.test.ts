import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AttributeChangeRequest,
  AttributeHandler,
  AttributeHandlerContext,
  Command,
  CommandContext,
  Plugin,
  PluginContext,
  PluginManifest,
  ReadonlyShape,
  ShapeCreateRequest,
  ShapeProvider,
  ShapeProviderContext,
  ShapeReadRequest,
  TreeDecorationContext,
  TreeDecorator,
  TreeNodeView,
} from "../src/api/index.js";
import { GroupShape } from "../src/api/index.js";
import { CliApplication } from "../src/cli/CliApplication.js";
import { DefaultPluginContext, PluginActivationManager } from "../src/core/plugins/index.js";
import {
  AttributeHandlerRegistry,
  CommandRegistry,
  ShapeProviderRegistry,
  TreeDecoratorRegistry,
} from "../src/core/registries/index.js";
import type { Shape } from "../src/api/index.js";

class TestCommand implements Command {
  public readonly helpLines: readonly string[];
  public readonly requiresDocument = false;

  public constructor(public readonly name: string) {
    this.helpLines = [name];
  }

  public execute(_arguments: readonly string[], _context: CommandContext): string {
    return `${this.name} executed`;
  }
}

class TestShapeProvider implements ShapeProvider {
  public readonly shapeType: string;
  public readonly serializedKind: string;

  public constructor(
    public readonly name: string,
    public readonly svgTag = "g",
  ) {
    this.shapeType = name;
    this.serializedKind = name;
  }

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    return new GroupShape(request.id);
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    return new GroupShape(request.id);
  }
}

class TestAttributeHandler implements AttributeHandler {
  public constructor(public readonly name: string) {}

  public handles(_target: ReadonlyShape, _attribute: string): boolean {
    return false;
  }

  public apply(_request: AttributeChangeRequest, _context: AttributeHandlerContext): void {}
}

class TestTreeDecorator implements TreeDecorator {
  public constructor(public readonly name: string) {}

  public decorate(_node: TreeNodeView, _context: TreeDecorationContext): string | undefined {
    return undefined;
  }
}

class CompletePlugin implements Plugin {
  public activate(context: PluginContext): void {
    context.shapes.register(new TestShapeProvider("diamond"));
    context.commands.register(new TestCommand("stats"));
    context.decorators.register(new TestTreeDecorator("diamond-label"));
    context.attributes.register(new TestAttributeHandler("diamond-fill"));
  }
}

function createHarness(): {
  manager: PluginActivationManager;
  commands: CommandRegistry;
  shapes: ShapeProviderRegistry;
  attributes: AttributeHandlerRegistry;
  decorators: TreeDecoratorRegistry;
} {
  const commands = new CommandRegistry();
  const shapes = new ShapeProviderRegistry();
  const attributes = new AttributeHandlerRegistry();
  const decorators = new TreeDecoratorRegistry();
  const context = new DefaultPluginContext(commands, shapes, attributes, decorators);
  return {
    manager: new PluginActivationManager(context),
    commands,
    shapes,
    attributes,
    decorators,
  };
}

const completeManifest: PluginManifest = {
  name: "complete-plugin",
  contributes: {
    shapes: ["diamond"],
    commands: ["stats"],
    decorators: ["diamond-label"],
    attributes: ["diamond-fill"],
  },
};

test("successful activation validates and commits all four contribution types", () => {
  const harness = createHarness();
  const receipt = harness.manager.activateSync(new CompletePlugin(), completeManifest);

  assert.equal(receipt.pluginName, "complete-plugin");
  assert.deepEqual(receipt.registered, {
    shapes: ["diamond"],
    commands: ["stats"],
    decorators: ["diamond-label"],
    attributes: ["diamond-fill"],
  });
  assert.deepEqual(harness.shapes.names(), ["diamond"]);
  assert.deepEqual(harness.commands.names(), ["stats"]);
  assert.deepEqual(harness.decorators.names(), ["diamond-label"]);
  assert.deepEqual(harness.attributes.names(), ["diamond-fill"]);
});

test("activation failure discards every staged registration", () => {
  const harness = createHarness();
  const plugin: Plugin = {
    activate(context): void {
      context.commands.register(new TestCommand("partial"));
      context.shapes.register(new TestShapeProvider("partial-shape"));
      throw new Error("boom");
    },
  };

  assert.throws(
    () => harness.manager.activateSync(plugin, { name: "broken-plugin" }),
    /plugin failed to activate: broken-plugin \(boom\)/,
  );
  assert.deepEqual(harness.commands.names(), []);
  assert.deepEqual(harness.shapes.names(), []);
});

test("a duplicate inside one plugin rejects its entire staging area", () => {
  const harness = createHarness();
  const plugin: Plugin = {
    activate(context): void {
      context.shapes.register(new TestShapeProvider("temporary-shape"));
      context.commands.register(new TestCommand("duplicate"));
      context.commands.register(new TestCommand("duplicate"));
    },
  };

  assert.throws(
    () => harness.manager.activateSync(plugin),
    /duplicate registration: commands\/duplicate/,
  );
  assert.deepEqual(harness.commands.names(), []);
  assert.deepEqual(harness.shapes.names(), []);
});

test("a duplicate during commit restores every live registry checkpoint", () => {
  const harness = createHarness();
  harness.manager.activateSync({
    activate(context): void {
      context.commands.register(new TestCommand("existing"));
    },
  });

  const conflicting: Plugin = {
    activate(context): void {
      context.shapes.register(new TestShapeProvider("temporary-shape"));
      context.commands.register(new TestCommand("temporary-command"));
      context.commands.register(new TestCommand("existing"));
    },
  };

  assert.throws(
    () => harness.manager.activateSync(conflicting),
    /duplicate registration: commands\/existing/,
  );
  assert.deepEqual(harness.commands.names(), ["existing"]);
  assert.deepEqual(harness.shapes.names(), []);
});

test("manifest mismatch rejects the plugin before live registries change", () => {
  const harness = createHarness();
  const mismatched: Plugin = {
    activate(context): void {
      context.commands.register(new TestCommand("stats"));
    },
  };

  assert.throws(
    () => harness.manager.activateSync(mismatched, {
      name: "mismatched-plugin",
      contributes: { commands: ["dir"] },
    }),
    /plugin manifest mismatch: mismatched-plugin/,
  );
  assert.deepEqual(harness.commands.names(), []);
});

test("batch activation reports a failure and continues with later plugins", () => {
  const harness = createHarness();
  const broken: Plugin = {
    activate(context): void {
      context.commands.register(new TestCommand("ghost"));
      throw new Error("broken on purpose");
    },
  };
  const working: Plugin = {
    activate(context): void {
      context.commands.register(new TestCommand("alive"));
    },
  };

  const result = harness.manager.activateAllSync([
    { plugin: broken, manifest: { name: "broken" } },
    { plugin: working, manifest: { name: "working", contributes: { commands: ["alive"] } } },
  ]);

  assert.deepEqual(result.errors, ["error: plugin failed to activate: broken (broken on purpose)"]);
  assert.deepEqual(result.activated.map((receipt) => receipt.pluginName), ["working"]);
  assert.deepEqual(harness.commands.names(), ["alive"]);
});

test("CLI uses the same staged path and exposes startup errors without aborting", () => {
  const broken: Plugin = {
    activate(context): void {
      context.commands.register(new TestCommand("ghost"));
      throw new Error("broken on purpose");
    },
  };
  const cli = new CliApplication([broken, {
    plugin: {
      activate(context): void {
        context.commands.register(new TestCommand("alive"));
      },
    },
    manifest: { name: "working", contributes: { commands: ["alive"] } },
  }]);

  assert.deepEqual(cli.startupErrors(), [
    "error: plugin failed to activate: anonymous (broken on purpose)",
  ]);
  assert.equal(cli.executeLine("ghost"), "error: unknown command: ghost");
  assert.equal(cli.executeLine("alive"), "alive executed");
});

test("async activation uses the same staging and manifest validation path", async () => {
  const harness = createHarness();
  const plugin: Plugin<{ commandName: string }> = {
    async activate(context, options): Promise<void> {
      await Promise.resolve();
      context.commands.register(new TestCommand(options?.commandName ?? "missing"));
    },
  };

  await harness.manager.activate(
    plugin,
    { name: "async-plugin", contributes: { commands: ["async-command"] } },
    { commandName: "async-command" },
  );
  assert.deepEqual(harness.commands.names(), ["async-command"]);
});
