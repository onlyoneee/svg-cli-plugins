import type { Plugin } from "../../api/Plugin.js";
import type { PluginContributions, PluginManifest } from "../../api/PluginManifest.js";
import { EditorError } from "../../errors/EditorError.js";
import { AttributeHandlerRegistry } from "../registries/AttributeHandlerRegistry.js";
import { CommandRegistry } from "../registries/CommandRegistry.js";
import { ShapeProviderRegistry } from "../registries/ShapeProviderRegistry.js";
import { TreeDecoratorRegistry } from "../registries/TreeDecoratorRegistry.js";
import { DefaultPluginContext } from "./DefaultPluginContext.js";

export interface RegisteredContributions {
  readonly shapes: readonly string[];
  readonly commands: readonly string[];
  readonly decorators: readonly string[];
  readonly attributes: readonly string[];
}

export interface PluginActivationReceipt {
  readonly pluginName: string;
  readonly registered: RegisteredContributions;
}

export interface PluginActivationRequest {
  readonly plugin: Plugin;
  readonly manifest?: PluginManifest;
  readonly options?: unknown;
}

export interface PluginActivationBatchResult {
  readonly activated: readonly PluginActivationReceipt[];
  readonly errors: readonly string[];
}

interface StagedActivation {
  readonly context: DefaultPluginContext;
  readonly commands: CommandRegistry;
  readonly shapes: ShapeProviderRegistry;
  readonly attributes: AttributeHandlerRegistry;
  readonly decorators: TreeDecoratorRegistry;
}

const contributionCategories = ["shapes", "commands", "decorators", "attributes"] as const;
type ContributionCategory = typeof contributionCategories[number];

export class PluginActivationManager {
  public constructor(private readonly live: DefaultPluginContext) {}

  public activateSync<Options>(
    plugin: Plugin<Options>,
    manifest?: PluginManifest,
    options?: Options,
  ): PluginActivationReceipt {
    const pluginName = this.pluginName(plugin, manifest);
    const staged = this.createStagingContext();
    try {
      const activation = plugin.activate(staged.context, options);
      if (this.isPromiseLike(activation)) {
        void Promise.resolve(activation).catch(() => undefined);
        throw new EditorError("asynchronous activation requires activate()");
      }
    } catch (error) {
      throw this.activationError(pluginName, error);
    }
    return this.validateAndCommit(pluginName, staged, manifest);
  }

  public async activate<Options>(
    plugin: Plugin<Options>,
    manifest?: PluginManifest,
    options?: Options,
  ): Promise<PluginActivationReceipt> {
    const pluginName = this.pluginName(plugin, manifest);
    const staged = this.createStagingContext();
    try {
      await plugin.activate(staged.context, options);
    } catch (error) {
      throw this.activationError(pluginName, error);
    }
    return this.validateAndCommit(pluginName, staged, manifest);
  }

  public activateAllSync(requests: readonly PluginActivationRequest[]): PluginActivationBatchResult {
    const activated: PluginActivationReceipt[] = [];
    const errors: string[] = [];
    for (const request of requests) {
      try {
        activated.push(this.activateSync(request.plugin, request.manifest, request.options));
      } catch (error) {
        errors.push(`error: ${this.errorMessage(error)}`);
      }
    }
    return { activated, errors };
  }

  public async activateAll(requests: readonly PluginActivationRequest[]): Promise<PluginActivationBatchResult> {
    const activated: PluginActivationReceipt[] = [];
    const errors: string[] = [];
    for (const request of requests) {
      try {
        activated.push(await this.activate(request.plugin, request.manifest, request.options));
      } catch (error) {
        errors.push(`error: ${this.errorMessage(error)}`);
      }
    }
    return { activated, errors };
  }

  private validateAndCommit(
    pluginName: string,
    staged: StagedActivation,
    manifest?: PluginManifest,
  ): PluginActivationReceipt {
    const registered = this.registeredContributions(staged);
    if (manifest) this.validateManifest(manifest, registered);
    this.commit(staged);
    return { pluginName, registered };
  }

  private createStagingContext(): StagedActivation {
    const commands = new CommandRegistry();
    const shapes = new ShapeProviderRegistry();
    const attributes = new AttributeHandlerRegistry();
    const decorators = new TreeDecoratorRegistry();
    return {
      context: new DefaultPluginContext(commands, shapes, attributes, decorators),
      commands,
      shapes,
      attributes,
      decorators,
    };
  }

  private commit(staged: StagedActivation): void {
    const checkpoints = {
      commands: this.live.commands.checkpoint(),
      shapes: this.live.shapes.checkpoint(),
      attributes: this.live.attributes.checkpoint(),
      decorators: this.live.decorators.checkpoint(),
    };
    try {
      for (const provider of staged.shapes.list()) this.live.shapes.register(provider);
      for (const command of staged.commands.list()) this.live.commands.register(command);
      for (const decorator of staged.decorators.list()) this.live.decorators.register(decorator);
      for (const handler of staged.attributes.list()) this.live.attributes.register(handler);
    } catch (error) {
      this.live.commands.restore(checkpoints.commands);
      this.live.shapes.restore(checkpoints.shapes);
      this.live.attributes.restore(checkpoints.attributes);
      this.live.decorators.restore(checkpoints.decorators);
      throw error;
    }
  }

  private validateManifest(manifest: PluginManifest, registered: RegisteredContributions): void {
    const declared = this.normalizedContributions(manifest.contributes);
    const actual = this.normalizedContributions(registered);
    const matches = contributionCategories.every(
      (category) => this.sameNames(declared[category], actual[category]),
    );
    if (!matches) {
      throw new EditorError(
        `plugin manifest mismatch: ${manifest.name} (declared: ${this.formatContributions(declared)}; registered: ${this.formatContributions(actual)})`,
      );
    }
  }

  private registeredContributions(staged: StagedActivation): RegisteredContributions {
    return {
      shapes: staged.shapes.names(),
      commands: staged.commands.names(),
      decorators: staged.decorators.names(),
      attributes: staged.attributes.names(),
    };
  }

  private normalizedContributions(contributions?: PluginContributions): RegisteredContributions {
    return {
      shapes: this.normalizedNames(contributions?.shapes),
      commands: this.normalizedNames(contributions?.commands),
      decorators: this.normalizedNames(contributions?.decorators),
      attributes: this.normalizedNames(contributions?.attributes),
    };
  }

  private normalizedNames(names: readonly string[] | undefined): readonly string[] {
    return [...new Set((names ?? []).map((name) => name.trim().toLowerCase()))].sort();
  }

  private sameNames(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((name, index) => name === right[index]);
  }

  private formatContributions(contributions: RegisteredContributions): string {
    return contributionCategories
      .map((category) => `${category}=[${contributions[category].join(",")}]`)
      .join(", ");
  }

  private pluginName<Options>(plugin: Plugin<Options>, manifest?: PluginManifest): string {
    if (manifest?.name.trim()) return manifest.name.trim();
    const constructorName = plugin.constructor?.name;
    return constructorName && constructorName !== "Object" ? constructorName : "anonymous";
  }

  private activationError(pluginName: string, error: unknown): EditorError {
    const message = this.errorMessage(error);
    if (message.startsWith("duplicate registration:")) return new EditorError(message);
    return new EditorError(`plugin failed to activate: ${pluginName} (${message})`);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isPromiseLike(value: void | Promise<void>): value is Promise<void> {
    return value !== undefined && typeof value.then === "function";
  }
}
