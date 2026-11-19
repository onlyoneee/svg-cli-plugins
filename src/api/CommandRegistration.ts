import type { Command } from "./Command.js";

export interface CommandRegistration {
  register(command: Command): void;
}
