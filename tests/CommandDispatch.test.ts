import assert from "node:assert/strict";
import { test } from "node:test";
import type { Command, CommandContext, Plugin, PluginContext } from "../src/api/index.js";
import { CliApplication } from "../src/cli/CliApplication.js";

class StatsCommand implements Command {
  public readonly name = "stats";
  public readonly helpLines = ["stats"];
  public readonly requiresDocument = true;

  public execute(arguments_: readonly string[], context: CommandContext): string {
    if (arguments_.length !== 0) throw new Error("usage: stats");
    return `${context.requireDocument().countElements()} elements`;
  }
}

class StatsPlugin implements Plugin {
  public activate(context: PluginContext): void {
    context.commands.register(new StatsCommand());
  }
}

test("CLI dispatches a plugin command without changing its core", () => {
  const cli = new CliApplication([new StatsPlugin()]);

  assert.equal(cli.executeLine("stats"), "error: no document. use 'init' or 'read' first");
  assert.equal(cli.executeLine("init"), "canvas 800x600 created");
  assert.equal(cli.executeLine("create rect r1 0 0 10 20"), "rect#r1 created");
  assert.equal(cli.executeLine("STATS"), "1 elements");
});

test("help is assembled from registered command metadata", () => {
  const cli = new CliApplication([new StatsPlugin()]);
  const help = cli.executeLine("help");

  assert.ok(help?.includes("create rect <id> <x> <y> <w> <h> [fill] [in <containerId>]"));
  assert.equal(help?.split("\n").at(-1), "stats");
});
