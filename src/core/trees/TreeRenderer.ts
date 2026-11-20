import type { ReadonlyDocument } from "../../api/ReadonlyDocument.js";
import type { ReadonlyShape } from "../../api/ReadonlyShape.js";
import type { TreeDecorationContext } from "../../api/TreeDecorationContext.js";
import type { TreeNodeView } from "../../api/TreeNodeView.js";
import { EditorError } from "../../errors/EditorError.js";
import type { TreeDecoratorResolver } from "../registries/TreeDecoratorRegistry.js";

export class TreeRenderer {
  public constructor(private readonly decorators: TreeDecoratorResolver) {}

  public render(document: ReadonlyDocument, id?: string): string {
    const context: TreeDecorationContext = { document };
    if (id !== undefined) {
      const shape = document.requireShape(id);
      const lines = [this.shapeLine(shape, context)];
      this.appendChildren(lines, shape.children, "", context);
      return lines.join("\n");
    }

    const summary = `svg (${this.formatNumber(document.width)}x${this.formatNumber(document.height)})`;
    const lines = [this.decorate({ kind: "canvas", shape: null, summary }, context)];
    this.appendChildren(lines, document.roots, "", context);
    return lines.join("\n");
  }

  private appendChildren(
    lines: string[],
    children: readonly ReadonlyShape[],
    prefix: string,
    context: TreeDecorationContext,
  ): void {
    children.forEach((child, index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${this.shapeLine(child, context)}`);
      this.appendChildren(lines, child.children, `${prefix}${last ? "    " : "│   "}`, context);
    });
  }

  private shapeLine(shape: ReadonlyShape, context: TreeDecorationContext): string {
    const summary = shape.summary();
    return this.decorate({ kind: "shape", shape, summary }, context);
  }

  private decorate(node: TreeNodeView, context: TreeDecorationContext): string {
    const labels: string[] = [];
    for (const decorator of this.decorators.list()) {
      const rawLabel = decorator.decorate(node, context);
      if (rawLabel === undefined || rawLabel.trim() === "") continue;
      const label = rawLabel.trim();
      if (/[\r\n]/.test(label)) {
        throw new EditorError(`invalid tree decoration: ${decorator.name}`);
      }
      labels.push(label);
    }
    return labels.length === 0 ? node.summary : `${node.summary} ${labels.join(" ")}`;
  }

  private formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  }
}
