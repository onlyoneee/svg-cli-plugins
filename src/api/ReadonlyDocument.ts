import type { ReadonlyShape } from "./ReadonlyShape.js";

export interface ReadonlyDocument {
  readonly width: number;
  readonly height: number;
  readonly roots: readonly ReadonlyShape[];

  findShape(id: string): ReadonlyShape | undefined;
  requireShape(id: string): ReadonlyShape;
  countElements(): number;
}
