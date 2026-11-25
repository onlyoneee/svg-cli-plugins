import type {
  AttributeChangeRequest, AttributeHandler, AttributeHandlerContext, AttributeHandlerResult, ReadonlyShape,
} from "../../api/index.js";

export class BoxFillHandler implements AttributeHandler {
  public readonly name = "box-fill";

  public handles(target: ReadonlyShape, attribute: string): boolean {
    return target.kind === "box" && attribute === "fill";
  }

  public apply({ shapeId, value }: AttributeChangeRequest, context: AttributeHandlerContext): AttributeHandlerResult {
    const rectId = `${shapeId}-rect`;
    context.setAttribute(rectId, "fill", value);
    const message = `box#${shapeId} fill propagated to ${rectId}`;
    return { executeMessage: message, redoMessage: message };
  }
}

export class BoxLabelHandler implements AttributeHandler {
  public readonly name = "box-label";

  public handles(target: ReadonlyShape, attribute: string): boolean {
    return target.kind === "box" && attribute === "label";
  }

  public apply({ shapeId, value }: AttributeChangeRequest, context: AttributeHandlerContext): AttributeHandlerResult {
    const labelId = `${shapeId}-label`;
    const previous = context.requireShape(labelId).getAttribute("text");
    context.setAttribute(labelId, "text", value);
    const message = `box#${shapeId} label updated: "${value}"`;
    return {
      executeMessage: message,
      undoMessage: `box#${shapeId} label restored: "${previous}"`,
      redoMessage: message,
    };
  }
}
