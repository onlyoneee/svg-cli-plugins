import type { CommandContext, ReadonlyDocument, ReadonlyShape } from "../../src/api/index.js";

const forbidden = (): never => { throw new Error("query touched a forbidden API"); };

/** Frozen public views ensure tests do not rely on the concrete SVG model. */
export function shape(type: string, children: readonly ReadonlyShape[] = [], kind = type): ReadonlyShape {
  return Object.freeze({
    id: `${kind}-fixture`, type, kind, parentId: null,
    children: Object.freeze([...children]),
    getAttribute: forbidden, summary: forbidden,
  });
}

export function document(roots: readonly ReadonlyShape[]): ReadonlyDocument {
  return Object.freeze({
    width: 800, height: 600, roots: Object.freeze([...roots]),
    findShape: forbidden, requireShape: forbidden, countElements: forbidden,
  });
}

export function queryContext(view: ReadonlyDocument | null = null, workingDirectory = "/fixture"): CommandContext {
  return Object.freeze({
    get document(): ReadonlyDocument | null { return forbidden(); },
    workingDirectory,
    requireDocument: () => {
      if (!view) return forbidden();
      return view;
    },
    execute: forbidden, replaceDocument: forbidden, markIoBoundary: forbidden,
  });
}
