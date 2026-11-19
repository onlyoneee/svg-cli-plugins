import type { Plugin } from "../api/Plugin.js";
import { BuiltinCommandsPlugin } from "../builtins/BuiltinCommandsPlugin.js";
import { CommandDispatcher } from "../core/commands/CommandDispatcher.js";
import { DefaultCommandContext } from "../core/commands/DefaultCommandContext.js";
import { DefaultPluginContext } from "../core/plugins/DefaultPluginContext.js";
import { AttributeHandlerRegistry } from "../core/registries/AttributeHandlerRegistry.js";
import { CommandRegistry } from "../core/registries/CommandRegistry.js";
import { ShapeProviderRegistry } from "../core/registries/ShapeProviderRegistry.js";
import { TreeDecoratorRegistry } from "../core/registries/TreeDecoratorRegistry.js";
import { EditorError } from "../errors/EditorError.js";
import type { SvgDocument } from "../model/SvgDocument.js";
import { CommandTokenizer } from "./CommandTokenizer.js";

export class CliApplication {
  private readonly tokenizer = new CommandTokenizer();
  private readonly commandContext = new DefaultCommandContext();
  private readonly commandRegistry = new CommandRegistry();
  private readonly dispatcher: CommandDispatcher;

  public constructor(plugins: readonly Plugin[] = []) {
    const pluginContext = new DefaultPluginContext(
      this.commandRegistry,
      new ShapeProviderRegistry(),
      new AttributeHandlerRegistry(),
      new TreeDecoratorRegistry(),
    );

    new BuiltinCommandsPlugin(this.commandContext, this.commandRegistry).activate(pluginContext);
    for (const plugin of plugins) {
      const activation = plugin.activate(pluginContext);
      if (activation instanceof Promise) {
        throw new EditorError("asynchronous plugin activation requires the plugin loader");
      }
    }
    this.dispatcher = new CommandDispatcher(this.commandRegistry, this.commandContext);
  }

  public executeLine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return null;
    try {
      const [name, ...arguments_] = this.tokenizer.tokenize(trimmed);
      if (!name) return null;
      return this.dispatcher.dispatch(name, arguments_);
    } catch (error) {
      return `error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  public currentDocument(): SvgDocument | null {
    return this.commandContext.currentDocument();
  }
}
