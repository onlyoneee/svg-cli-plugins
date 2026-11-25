import type { Command, CommandContext } from "../../api/index.js";
import type { DirectoryEntry, DirectoryReader } from "./DirectoryReader.js";

export class DirCommand implements Command {
  public readonly name = "dir";
  public readonly helpLines = ["dir"];
  public readonly requiresDocument = false;

  public constructor(private readonly reader: DirectoryReader) {}

  public execute(arguments_: readonly string[], context: CommandContext): string {
    if (arguments_.length !== 0) throw new Error("usage: dir");
    const path = context.workingDirectory;
    let entries: readonly DirectoryEntry[];
    try {
      entries = this.reader.read(path);
    } catch {
      // The host adds the error: prefix. Keep filesystem details out of output.
      throw new Error(`cannot read directory: ${path}`);
    }
    const rank = { directory: 0, file: 1, other: 2 };
    const markers = { directory: "[DIR]", file: "[FILE]", other: "[OTHER]" };
    const sorted = entries
      .filter((entry) => entry.name !== "." && entry.name !== "..")
      .sort((a, b) => rank[a.kind] - rank[b.kind] ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (sorted.length === 0) return "(empty directory)";
    return sorted.map((entry) => `${markers[entry.kind]}  ${entry.name}`).join("\n");
  }
}
