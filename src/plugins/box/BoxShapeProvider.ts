import {
  RectShape,
  TextShape,
  type ShapeCreateRequest,
  type ShapeProvider,
  type ShapeReadRequest,
} from "../../api/index.js";
import { BoxShape } from "./BoxShape.js";

function numberParameter(raw: string, name: string): number {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value)) throw new Error(`invalid number for ${name}: ${raw}`);
  return value;
}

export class BoxShapeProvider implements ShapeProvider {
  public readonly name = "box";
  public readonly shapeType = "box";
  public readonly svgTag = "g";
  public readonly serializedKind = "box";

  public create({ id, parameters }: ShapeCreateRequest): BoxShape {
    if (parameters.length !== 5) {
      throw new Error('usage: create box <id> <x> <y> <w> <h> "<label>" [in <containerId>]');
    }
    const [rawX = "", rawY = "", rawWidth = "", rawHeight = "", label = ""] = parameters;
    const x = numberParameter(rawX, "x");
    const y = numberParameter(rawY, "y");
    const width = numberParameter(rawWidth, "w");
    const height = numberParameter(rawHeight, "h");
    const rect = new RectShape(`${id}-rect`, x, y, width, height);
    rect.setStyle("fill", "#4a90d9");
    const text = new TextShape(`${id}-label`, x + 20, y + height / 2 + 5, label);
    return new BoxShape(id, [rect, text]);
  }

  public read({ id, element, children }: ShapeReadRequest): BoxShape {
    if (element.tagName !== this.svgTag) throw new Error(`invalid box#${id}: expected <g>`);
    const box = new BoxShape(id, children);
    for (const name of ["fill", "stroke", "stroke-width"]) {
      const value = element.attributes.get(name);
      if (value !== undefined) box.setAttribute(name, value);
    }
    return box;
  }
}
