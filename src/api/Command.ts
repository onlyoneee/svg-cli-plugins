import type { CommandContext } from "./CommandContext.js";

export interface Command {
  readonly name: string;
  readonly helpLines: readonly string[];
  readonly requiresDocument: boolean;

  execute(arguments_: readonly string[], context: CommandContext): string;
}
