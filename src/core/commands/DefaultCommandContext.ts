import type { CommandContext } from "../../api/CommandContext.js";
import type { UndoableOperation } from "../../api/UndoableOperation.js";
import { CommandHistory } from "../../commands/CommandHistory.js";
import { EditorError } from "../../errors/EditorError.js";
import type { SvgDocument } from "../../model/SvgDocument.js";

export class DefaultCommandContext implements CommandContext {
  private documentValue: SvgDocument | null = null;

  public constructor(
    private readonly history = new CommandHistory(),
    public readonly workingDirectory = process.cwd(),
  ) {}

  public get document(): SvgDocument | null {
    return this.documentValue;
  }

  public currentDocument(): SvgDocument | null {
    return this.documentValue;
  }

  public requireDocument(): SvgDocument {
    if (!this.documentValue) throw new EditorError("no document. use 'init' or 'read' first");
    return this.documentValue;
  }

  public execute(operation: UndoableOperation): string {
    return this.history.execute(operation, this.requireDocument());
  }

  public replaceDocument(document: SvgDocument): void {
    this.documentValue = document;
  }

  public markIoBoundary(): void {
    this.history.ioBarrier();
  }

  public undo(): string {
    return this.history.undo(this.requireDocument());
  }

  public redo(): string {
    return this.history.redo(this.requireDocument());
  }
}
