import type { ReadonlyShape } from "./ReadonlyShape.js";

export interface AttributeHandlerContext {
  requireShape(id: string): ReadonlyShape;
  setAttribute(shapeId: string, attribute: string, value: string): void;
}
