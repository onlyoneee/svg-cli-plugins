import type { PluginContext } from "../../api/PluginContext.js";
import type { AttributeHandlerRegistry } from "../registries/AttributeHandlerRegistry.js";
import type { CommandRegistry } from "../registries/CommandRegistry.js";
import type { ShapeProviderRegistry } from "../registries/ShapeProviderRegistry.js";
import type { TreeDecoratorRegistry } from "../registries/TreeDecoratorRegistry.js";

export class DefaultPluginContext implements PluginContext {
  public constructor(
    public readonly commands: CommandRegistry,
    public readonly shapes: ShapeProviderRegistry,
    public readonly attributes: AttributeHandlerRegistry,
    public readonly decorators: TreeDecoratorRegistry,
  ) {}
}
