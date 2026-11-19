import type { TreeDecorationContext } from "./TreeDecorationContext.js";
import type { TreeNodeView } from "./TreeNodeView.js";

export interface TreeDecorator {
  readonly name: string;

  decorate(node: TreeNodeView, context: TreeDecorationContext): string | undefined;
}
