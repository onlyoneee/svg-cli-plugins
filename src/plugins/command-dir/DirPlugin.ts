import type { Plugin, PluginContext } from "../../api/index.js";
import type { DirectoryReader } from "./DirectoryReader.js";
import { DirCommand } from "./DirCommand.js";
import { NodeDirectoryReader } from "./NodeDirectoryReader.js";

export class DirPlugin implements Plugin {
  public constructor(private readonly reader: DirectoryReader = new NodeDirectoryReader()) {}

  public activate(context: PluginContext): void {
    context.commands.register(new DirCommand(this.reader));
  }
}
