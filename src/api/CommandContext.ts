import type { SvgDocument } from "../model/SvgDocument.js";
import type { ReadonlyDocument } from "./ReadonlyDocument.js";
import type { UndoableOperation } from "./UndoableOperation.js";

export interface CommandContext {
  readonly document: ReadonlyDocument | null;
  readonly workingDirectory: string;

  requireDocument(): ReadonlyDocument;
  execute(operation: UndoableOperation): string;
  replaceDocument(document: SvgDocument): void;
  markIoBoundary(): void;
}
