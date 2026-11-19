import type { ReadonlyShape } from "./ReadonlyShape.js";

export interface TreeNodeView {
  readonly kind: "canvas" | "shape";
  readonly shape: ReadonlyShape | null;
  readonly summary: string;
}
