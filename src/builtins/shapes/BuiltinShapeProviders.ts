import type {
  ShapeCreateRequest,
  ShapeProvider,
  ShapeReadRequest,
} from "../../api/ShapeProvider.js";
import type { ShapeProviderContext } from "../../api/ShapeProviderContext.js";
import { EditorError } from "../../errors/EditorError.js";
import { CircleShape } from "../../model/shapes/CircleShape.js";
import { EllipseShape } from "../../model/shapes/EllipseShape.js";
import { GroupShape } from "../../model/shapes/GroupShape.js";
import { LineShape } from "../../model/shapes/LineShape.js";
import { RectShape } from "../../model/shapes/RectShape.js";
import type { Shape } from "../../model/shapes/Shape.js";
import { TextShape } from "../../model/shapes/TextShape.js";

abstract class BuiltinShapeProvider implements ShapeProvider {
  public abstract readonly name: string;
  public abstract readonly shapeType: string;
  public abstract readonly svgTag: string;

  public abstract create(request: ShapeCreateRequest, context: ShapeProviderContext): Shape;
  public abstract read(request: ShapeReadRequest, context: ShapeProviderContext): Shape;

  protected requireCount(
    parameters: readonly string[],
    minimum: number,
    maximum: number,
    usage: string,
  ): void {
    if (parameters.length < minimum || parameters.length > maximum) {
      throw new EditorError(`usage: ${usage}`);
    }
  }

  protected number(value: string | undefined, label: string): number {
    if (value === undefined || value.trim() === "") throw new EditorError(`missing parameter: ${label}`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new EditorError(`invalid number for ${label}: ${value}`);
    return parsed;
  }

  protected value(request: ShapeReadRequest, name: string): string {
    const found = request.element.attributes.get(name);
    if (found === undefined) {
      throw new EditorError(`missing SVG attribute ${name} on ${request.element.tagName}#${request.id}`);
    }
    return found;
  }

  protected ensureLeaf(request: ShapeReadRequest): void {
    if (request.children.length > 0) {
      throw new EditorError(`invalid SVG: <${request.element.tagName}> cannot contain shapes`);
    }
  }

  protected applyStyles(shape: Shape, request: ShapeReadRequest): Shape {
    for (const styleName of ["fill", "stroke", "stroke-width"]) {
      const value = request.element.attributes.get(styleName);
      if (value !== undefined) shape.setStyle(styleName, value);
    }
    return shape;
  }
}

export class RectShapeProvider extends BuiltinShapeProvider {
  public readonly name = "rect";
  public readonly shapeType = "rect";
  public readonly svgTag = "rect";

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    const p = request.parameters;
    this.requireCount(p, 4, 5, "create rect <id> <x> <y> <w> <h> [fill]");
    const shape = new RectShape(
      request.id,
      this.number(p[0], "x"),
      this.number(p[1], "y"),
      this.number(p[2], "w"),
      this.number(p[3], "h"),
    );
    if (p[4] !== undefined) shape.setStyle("fill", p[4]);
    return shape;
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    this.ensureLeaf(request);
    return this.applyStyles(
      new RectShape(
        request.id,
        this.number(this.value(request, "x"), "x"),
        this.number(this.value(request, "y"), "y"),
        this.number(this.value(request, "width"), "w"),
        this.number(this.value(request, "height"), "h"),
      ),
      request,
    );
  }
}

export class CircleShapeProvider extends BuiltinShapeProvider {
  public readonly name = "circle";
  public readonly shapeType = "circle";
  public readonly svgTag = "circle";

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    const p = request.parameters;
    this.requireCount(p, 3, 4, "create circle <id> <cx> <cy> <r> [fill]");
    const shape = new CircleShape(
      request.id,
      this.number(p[0], "cx"),
      this.number(p[1], "cy"),
      this.number(p[2], "r"),
    );
    if (p[3] !== undefined) shape.setStyle("fill", p[3]);
    return shape;
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    this.ensureLeaf(request);
    return this.applyStyles(
      new CircleShape(
        request.id,
        this.number(this.value(request, "cx"), "cx"),
        this.number(this.value(request, "cy"), "cy"),
        this.number(this.value(request, "r"), "r"),
      ),
      request,
    );
  }
}

export class EllipseShapeProvider extends BuiltinShapeProvider {
  public readonly name = "ellipse";
  public readonly shapeType = "ellipse";
  public readonly svgTag = "ellipse";

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    const p = request.parameters;
    this.requireCount(p, 4, 5, "create ellipse <id> <cx> <cy> <rx> <ry> [fill]");
    const shape = new EllipseShape(
      request.id,
      this.number(p[0], "cx"),
      this.number(p[1], "cy"),
      this.number(p[2], "rx"),
      this.number(p[3], "ry"),
    );
    if (p[4] !== undefined) shape.setStyle("fill", p[4]);
    return shape;
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    this.ensureLeaf(request);
    return this.applyStyles(
      new EllipseShape(
        request.id,
        this.number(this.value(request, "cx"), "cx"),
        this.number(this.value(request, "cy"), "cy"),
        this.number(this.value(request, "rx"), "rx"),
        this.number(this.value(request, "ry"), "ry"),
      ),
      request,
    );
  }
}

export class LineShapeProvider extends BuiltinShapeProvider {
  public readonly name = "line";
  public readonly shapeType = "line";
  public readonly svgTag = "line";

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    const p = request.parameters;
    this.requireCount(p, 4, 5, "create line <id> <x1> <y1> <x2> <y2> [stroke]");
    const shape = new LineShape(
      request.id,
      this.number(p[0], "x1"),
      this.number(p[1], "y1"),
      this.number(p[2], "x2"),
      this.number(p[3], "y2"),
    );
    if (p[4] !== undefined) shape.setStyle("stroke", p[4]);
    return shape;
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    this.ensureLeaf(request);
    return this.applyStyles(
      new LineShape(
        request.id,
        this.number(this.value(request, "x1"), "x1"),
        this.number(this.value(request, "y1"), "y1"),
        this.number(this.value(request, "x2"), "x2"),
        this.number(this.value(request, "y2"), "y2"),
      ),
      request,
    );
  }
}

export class TextShapeProvider extends BuiltinShapeProvider {
  public readonly name = "text";
  public readonly shapeType = "text";
  public readonly svgTag = "text";

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    const p = request.parameters;
    this.requireCount(p, 3, 3, 'create text <id> <x> <y> "content"');
    return new TextShape(request.id, this.number(p[0], "x"), this.number(p[1], "y"), p[2] ?? "");
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    this.ensureLeaf(request);
    return this.applyStyles(
      new TextShape(
        request.id,
        this.number(this.value(request, "x"), "x"),
        this.number(this.value(request, "y"), "y"),
        request.element.text,
      ),
      request,
    );
  }
}

export class GroupShapeProvider extends BuiltinShapeProvider {
  public readonly name = "g";
  public readonly shapeType = "g";
  public readonly svgTag = "g";

  public create(request: ShapeCreateRequest, _context: ShapeProviderContext): Shape {
    this.requireCount(request.parameters, 0, 0, "create g <id>");
    return new GroupShape(request.id);
  }

  public read(request: ShapeReadRequest, _context: ShapeProviderContext): Shape {
    const group = this.applyStyles(new GroupShape(request.id), request) as GroupShape;
    for (const child of request.children) group.addChild(child);
    return group;
  }
}
