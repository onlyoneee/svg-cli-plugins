import { GroupShape, type Shape } from "../../api/index.js";

export class BoxShape extends GroupShape {
  public constructor(id: string, children: readonly Shape[]) {
    super(id, "box");
    for (const [suffix, kind] of [["rect", "rect"], ["label", "text"]] as const) {
      const childId = `${id}-${suffix}`;
      if (!children.some((child) => child.id === childId && child.kind === kind)) {
        throw new Error(`invalid box#${id}: expected direct child ${kind}#${childId}`);
      }
    }
    for (const child of children) this.addChild(child);
  }

  public override get canUngroup(): boolean {
    return false;
  }

  public override isRequiredChild(child: Shape): boolean {
    return child.id === `${this.id}-rect` || child.id === `${this.id}-label`;
  }

  public override creationSummary(): string {
    return `box#${this.id} created (g#${this.id} + rect#${this.id}-rect + text#${this.id}-label)`;
  }

  protected override commonSvgAttributes(): string {
    return `${super.commonSvgAttributes()} data-kind="box"`;
  }
}
