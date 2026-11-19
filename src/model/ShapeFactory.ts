import type { ShapeProviderContext } from "../api/ShapeProviderContext.js";
import type { ShapeProviderResolver } from "../core/registries/ShapeProviderRegistry.js";
import { EditorError } from "../errors/EditorError.js";
import type { Shape } from "./shapes/Shape.js";
import type { SvgDocument } from "./SvgDocument.js";

export class ShapeFactory {
  public constructor(private readonly providers: ShapeProviderResolver) {}

  public create(
    type: string,
    id: string,
    parameters: readonly string[],
    document: SvgDocument,
    containerId?: string,
  ): Shape {
    const provider = this.providers.findByShapeType(type);
    if (!provider) throw new EditorError(`unknown shape type: ${type} (is the plugin loaded?)`);
    return provider.create({ id, parameters, containerId }, this.context(document));
  }

  public createFromSvg(
    tagName: string,
    id: string,
    attributes: ReadonlyMap<string, string>,
    text: string,
    children: readonly Shape[],
    document: SvgDocument,
  ): Shape {
    const provider = this.providers.findForRead(tagName, attributes.get("data-kind"));
    if (!provider) throw new EditorError(`unknown shape type: ${tagName} (is the plugin loaded?)`);
    return provider.read(
      {
        id,
        element: { tagName, attributes, text },
        children,
      },
      this.context(document),
    );
  }

  private context(document: SvgDocument): ShapeProviderContext {
    return { document };
  }
}
