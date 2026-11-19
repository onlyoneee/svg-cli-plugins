import type { CommandContext } from "../../api/CommandContext.js";
import { EditorError } from "../../errors/EditorError.js";
import type { CommandRegistry } from "../registries/CommandRegistry.js";

export class CommandDispatcher {
  public constructor(
    private readonly commands: CommandRegistry,
    private readonly context: CommandContext,
  ) {}

  public dispatch(name: string, arguments_: readonly string[]): string {
    const command = this.commands.get(name);
    if (!command) throw new EditorError(`unknown command: ${name}`);
    if (command.requiresDocument) this.context.requireDocument();
    return command.execute(arguments_, this.context);
  }
}
