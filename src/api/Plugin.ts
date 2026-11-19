import type { PluginContext } from "./PluginContext.js";

export interface Plugin<Options = unknown> {
  activate(context: PluginContext, options?: Options): void | Promise<void>;
}
