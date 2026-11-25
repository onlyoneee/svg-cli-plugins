import type { Plugin, PluginContext } from "../../api/index.js";
import { StatsCommand } from "./StatsCommand.js";

export class StatsPlugin implements Plugin {
  public activate(context: PluginContext): void {
    context.commands.register(new StatsCommand());
  }
}
