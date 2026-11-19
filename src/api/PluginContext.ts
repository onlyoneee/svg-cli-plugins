import type { AttributeHandlerRegistration } from "./AttributeHandlerRegistration.js";
import type { CommandRegistration } from "./CommandRegistration.js";
import type { ShapeProviderRegistration } from "./ShapeProviderRegistration.js";
import type { TreeDecoratorRegistration } from "./TreeDecoratorRegistration.js";

export interface PluginContext {
  readonly commands: CommandRegistration;
  readonly shapes: ShapeProviderRegistration;
  readonly attributes: AttributeHandlerRegistration;
  readonly decorators: TreeDecoratorRegistration;
}
