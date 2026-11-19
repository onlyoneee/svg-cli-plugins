import type { Command } from "../../api/Command.js";
import type { CommandRegistration } from "../../api/CommandRegistration.js";
import { EditorError } from "../../errors/EditorError.js";

export class CommandRegistry implements CommandRegistration {
  private readonly commands = new Map<string, Command>();

  public register(command: Command): void {
    const name = this.normalizedName(command.name);
    if (this.commands.has(name)) {
      throw new EditorError(`duplicate registration: commands/${name}`);
    }
    if (command.helpLines.length === 0 || command.helpLines.some((line) => line.trim() === "")) {
      throw new EditorError(`invalid registration: commands/${name} (help is required)`);
    }
    this.commands.set(name, command);
  }

  public get(name: string): Command | undefined {
    return this.commands.get(name.trim().toLowerCase());
  }

  public list(): readonly Command[] {
    return [...this.commands.values()];
  }

  public names(): readonly string[] {
    return [...this.commands.keys()];
  }

  private normalizedName(name: string): string {
    const normalized = name.trim().toLowerCase();
    if (!normalized) throw new EditorError("invalid registration: commands/<empty>");
    return normalized;
  }
}
