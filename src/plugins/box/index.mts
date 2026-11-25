import type { Plugin, PluginManifest } from "../../api/index.js";
import { BoxFillHandler, BoxLabelHandler } from "./BoxAttributeHandlers.js";
import { BoxShapeProvider } from "./BoxShapeProvider.js";

export const manifest: PluginManifest = {
  name: "box-plugin",
  contributes: { shapes: ["box"], attributes: ["box-fill", "box-label"] },
};

const plugin: Plugin = {
  activate(context) {
    context.shapes.register(new BoxShapeProvider());
    context.attributes.register(new BoxFillHandler());
    context.attributes.register(new BoxLabelHandler());
  },
};

export default plugin;
