import type { AttributeHandlerResult } from "../api/AttributeHandler.js";
import { AttributeTransaction } from "../core/attributes/AttributeTransaction.js";
import type { AttributeChange } from "../core/attributes/AttributeTransaction.js";
import type { AttributeHandlerResolver } from "../core/registries/AttributeHandlerRegistry.js";
import { EditorError } from "../errors/EditorError.js";
import type { SvgDocument } from "../model/SvgDocument.js";
import { EditingOperation } from "./EditingOperation.js";

export class SetCommand extends EditingOperation {
  private changes: readonly AttributeChange[] = [];
  private oldValue: string | undefined;
  private usedHandler = false;
  private handlerResult: AttributeHandlerResult | undefined;

  public constructor(
    private readonly handlers: AttributeHandlerResolver,
    private readonly id: string,
    private readonly attribute: string,
    private readonly value: string,
  ) {
    super();
  }

  protected override apply(document: SvgDocument): string {
    const target = document.requireShape(this.id);
    const matches = this.handlers.findMatches(target, this.attribute);
    if (matches.length > 1) {
      throw new EditorError(`conflicting attribute handlers: ${matches.map((handler) => handler.name).join(", ")}`);
    }

    const transaction = new AttributeTransaction(document);
    const handler = matches[0];
    try {
      if (handler) {
        this.usedHandler = true;
        this.handlerResult = handler.apply(
          { shapeId: this.id, attribute: this.attribute, value: this.value },
          transaction,
        ) ?? undefined;
        transaction.requireChanges(handler.name);
      } else {
        transaction.setAttribute(this.id, this.attribute, this.value);
      }
      this.changes = transaction.changes();
    } catch (error) {
      transaction.rollback();
      throw error;
    }

    this.oldValue = this.changes[0]?.before;
    return this.handlerResult?.executeMessage
      ?? `${target.type}#${target.id} updated: ${this.attribute}="${this.value}"`;
  }

  public override undo(document: SvgDocument): string {
    this.ensureExecuted();
    AttributeTransaction.undo(document, this.changes);
    if (this.handlerResult?.undoMessage) return this.handlerResult.undoMessage;
    if (this.usedHandler || this.oldValue === undefined) return this.undoResult();
    const target = document.requireShape(this.id);
    return `${target.type}#${target.id} updated: ${this.attribute}="${this.oldValue}"`;
  }

  public override redo(document: SvgDocument): string {
    this.ensureExecuted();
    AttributeTransaction.redo(document, this.changes);
    return this.handlerResult?.redoMessage ?? this.redoResult();
  }
}
