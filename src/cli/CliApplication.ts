import type { Plugin } from "../api/Plugin.js";
import { BuiltinCommandsPlugin } from "../builtins/BuiltinCommandsPlugin.js";
import { BuiltinShapeProvidersPlugin } from "../builtins/BuiltinShapeProvidersPlugin.js";
import { CommandDispatcher } from "../core/commands/CommandDispatcher.js";
import { DefaultCommandContext } from "../core/commands/DefaultCommandContext.js";
import { DefaultPluginContext } from "../core/plugins/DefaultPluginContext.js";
import {
  PluginActivationManager,
  type PluginActivationRequest,
} from "../core/plugins/PluginActivationManager.js";
import { AttributeHandlerRegistry } from "../core/registries/AttributeHandlerRegistry.js";
import { CommandRegistry } from "../core/registries/CommandRegistry.js";
import { ShapeProviderRegistry } from "../core/registries/ShapeProviderRegistry.js";
import { TreeDecoratorRegistry } from "../core/registries/TreeDecoratorRegistry.js";
import { TreeRenderer } from "../core/trees/TreeRenderer.js";
import type { SvgDocument } from "../model/SvgDocument.js";
import { ShapeFactory } from "../model/ShapeFactory.js";
import { CommandTokenizer } from "./CommandTokenizer.js";

export type CliPluginInput = Plugin | PluginActivationRequest;

export class CliApplication {
  private readonly tokenizer = new CommandTokenizer();
  private readonly commandContext = new DefaultCommandContext();
  private readonly commandRegistry = new CommandRegistry();
  private readonly shapeProviderRegistry = new ShapeProviderRegistry();
  private readonly attributeHandlerRegistry = new AttributeHandlerRegistry();
  private readonly treeDecoratorRegistry = new TreeDecoratorRegistry();
  private readonly activationErrors: string[] = [];
  private readonly dispatcher: CommandDispatcher;

  public constructor(plugins: readonly CliPluginInput[] = []) {
    const pluginContext = new DefaultPluginContext(
      this.commandRegistry,
      this.shapeProviderRegistry,
      this.attributeHandlerRegistry,
      this.treeDecoratorRegistry,
    );

    const pluginManager = new PluginActivationManager(pluginContext);

    pluginManager.activateSync(new BuiltinShapeProvidersPlugin());
    const shapeFactory = new ShapeFactory(this.shapeProviderRegistry);
    const treeRenderer = new TreeRenderer(this.treeDecoratorRegistry);
    pluginManager.activateSync(
      new BuiltinCommandsPlugin(
        this.commandContext,
        this.commandRegistry,
        shapeFactory,
        this.attributeHandlerRegistry,
        treeRenderer,
      ),
    );
    const activationResult = pluginManager.activateAllSync(plugins.map((plugin) => this.activationRequest(plugin)));
    this.activationErrors.push(...activationResult.errors);
    this.dispatcher = new CommandDispatcher(this.commandRegistry, this.commandContext);
  }

  public startupErrors(): readonly string[] {
    return [...this.activationErrors];
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

  private activationRequest(input: CliPluginInput): PluginActivationRequest {
    return "activate" in input ? { plugin: input } : input;
  }
}
