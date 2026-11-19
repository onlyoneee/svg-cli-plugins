import type { Plugin } from "../api/Plugin.js";
import type { PluginContext } from "../api/PluginContext.js";
import {
  CircleShapeProvider,
  EllipseShapeProvider,
  GroupShapeProvider,
  LineShapeProvider,
  RectShapeProvider,
  TextShapeProvider,
} from "./shapes/index.js";

export class BuiltinShapeProvidersPlugin implements Plugin {
  public activate(context: PluginContext): void {
    context.shapes.register(new RectShapeProvider());
    context.shapes.register(new CircleShapeProvider());
    context.shapes.register(new EllipseShapeProvider());
    context.shapes.register(new LineShapeProvider());
    context.shapes.register(new TextShapeProvider());
    context.shapes.register(new GroupShapeProvider());
  }
}
