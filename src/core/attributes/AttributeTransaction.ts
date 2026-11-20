import type { AttributeHandlerContext } from "../../api/AttributeHandlerContext.js";
import type { ReadonlyShape } from "../../api/ReadonlyShape.js";
import { EditorError } from "../../errors/EditorError.js";
import type { SvgDocument } from "../../model/SvgDocument.js";

export interface AttributeChange {
  readonly shapeId: string;
  readonly attribute: string;
  readonly before: string | undefined;
  readonly after: string | undefined;
}

export class AttributeTransaction implements AttributeHandlerContext {
  private readonly changeLog: AttributeChange[] = [];

  public constructor(private readonly document: SvgDocument) {}

  public requireShape(id: string): ReadonlyShape {
    return this.document.requireShape(id);
  }

  public setAttribute(shapeId: string, attribute: string, value: string): void {
    const shape = this.document.requireShape(shapeId);
    const before = shape.getAttribute(attribute);
    try {
      shape.setAttribute(attribute, value);
    } catch (error) {
      shape.restoreAttribute(attribute, before);
      throw error;
    }
    this.changeLog.push({
      shapeId,
      attribute,
      before,
      after: shape.getAttribute(attribute),
    });
  }

  public changes(): readonly AttributeChange[] {
    return [...this.changeLog];
  }

  public requireChanges(handlerName: string): void {
    if (this.changeLog.length === 0) {
      throw new EditorError(`attribute handler made no changes: ${handlerName}`);
    }
  }

  public rollback(): void {
    AttributeTransaction.restoreBefore(this.document, this.changeLog);
    this.changeLog.length = 0;
  }

  public static undo(document: SvgDocument, changes: readonly AttributeChange[]): void {
    const restored: AttributeChange[] = [];
    try {
      for (let index = changes.length - 1; index >= 0; index -= 1) {
        const change = changes[index];
        if (!change) continue;
        this.restore(document, change, change.before);
        restored.push(change);
      }
    } catch (error) {
      for (let index = restored.length - 1; index >= 0; index -= 1) {
        const change = restored[index];
        if (change) this.restore(document, change, change.after);
      }
      throw error;
    }
  }

  public static redo(document: SvgDocument, changes: readonly AttributeChange[]): void {
    const replayed: AttributeChange[] = [];
    try {
      for (const change of changes) {
        this.restore(document, change, change.after);
        replayed.push(change);
      }
    } catch (error) {
      for (let index = replayed.length - 1; index >= 0; index -= 1) {
        const change = replayed[index];
        if (change) this.restore(document, change, change.before);
      }
      throw error;
    }
  }

  private static restoreBefore(document: SvgDocument, changes: readonly AttributeChange[]): void {
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const change = changes[index];
      if (change) this.restore(document, change, change.before);
    }
  }

  private static restore(
    document: SvgDocument,
    change: AttributeChange,
    value: string | undefined,
  ): void {
    document.requireShape(change.shapeId).restoreAttribute(change.attribute, value);
  }
}
