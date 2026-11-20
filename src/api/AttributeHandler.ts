import type { AttributeHandlerContext } from "./AttributeHandlerContext.js";
import type { ReadonlyShape } from "./ReadonlyShape.js";

export interface AttributeChangeRequest {
  readonly shapeId: string;
  readonly attribute: string;
  readonly value: string;
}

export interface AttributeHandlerResult {
  readonly executeMessage?: string;
  readonly undoMessage?: string;
  readonly redoMessage?: string;
}

export interface AttributeHandler {
  readonly name: string;

  handles(target: ReadonlyShape, attribute: string): boolean;
  apply(
    request: AttributeChangeRequest,
    context: AttributeHandlerContext,
  ): AttributeHandlerResult | void;
}
