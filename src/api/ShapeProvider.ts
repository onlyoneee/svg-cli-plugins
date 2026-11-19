import type { Shape } from "../model/shapes/Shape.js";
import type { ShapeProviderContext } from "./ShapeProviderContext.js";

export interface SvgElementView {
  readonly tagName: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly text: string;
}

export interface ShapeCreateRequest {
  readonly id: string;
  readonly parameters: readonly string[];
  readonly containerId?: string;
}

export interface ShapeReadRequest {
  readonly id: string;
  readonly element: SvgElementView;
  readonly children: readonly Shape[];
}

export interface ShapeProvider {
  readonly name: string;
  readonly shapeType: string;
  readonly svgTag: string;
  readonly serializedKind?: string;

  create(request: ShapeCreateRequest, context: ShapeProviderContext): Shape;
  read(request: ShapeReadRequest, context: ShapeProviderContext): Shape;
}
