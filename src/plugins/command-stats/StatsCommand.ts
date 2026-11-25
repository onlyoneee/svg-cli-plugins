import type { Command, CommandContext, ReadonlyShape } from "../../api/index.js";

/** Read-only depth-first statistics; insertion order determines type order. */
export class StatsCommand implements Command {
  public readonly name = "stats";
  public readonly helpLines = ["stats"];
  public readonly requiresDocument = true;

  public execute(arguments_: readonly string[], context: CommandContext): string {
    if (arguments_.length !== 0) throw new Error("usage: stats");
    const counts = new Map<string, number>();
    let total = 0;
    let containers = 0;
    const visit = (shape: ReadonlyShape): void => {
      // Empty groups are containers too; box is identified by public metadata.
      if (shape.type === "g" || shape.kind === "box") {
        containers += 1;
        for (const child of shape.children) visit(child);
      } else {
        counts.set(shape.type, (counts.get(shape.type) ?? 0) + 1);
        total += 1;
      }
    };
    for (const root of context.requireDocument().roots) visit(root);
    const parts = [...counts].map(([type, count]) => `${type}: ${count}`);
    parts.push(`(total ${total}, containers ${containers})`);
    return parts.join("  ");
  }
}
