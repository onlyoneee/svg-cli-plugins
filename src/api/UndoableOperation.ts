import type { SvgDocument } from "../model/SvgDocument.js";

export interface UndoableOperation {
  execute(document: SvgDocument): string;
  undo(document: SvgDocument): string;
  redo(document: SvgDocument): string;
}
