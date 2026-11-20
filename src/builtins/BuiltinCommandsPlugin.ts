import type { Plugin } from "../api/Plugin.js";
import type { PluginContext } from "../api/PluginContext.js";
import type { DefaultCommandContext } from "../core/commands/DefaultCommandContext.js";
import type { CommandRegistry } from "../core/registries/CommandRegistry.js";
import type { AttributeHandlerRegistry } from "../core/registries/AttributeHandlerRegistry.js";
import { ShapeFactory } from "../model/ShapeFactory.js";
import { SvgReader } from "../persistence/SvgReader.js";
import { SvgWriter } from "../persistence/SvgWriter.js";
import {
  AddToCliCommand,
  BackCliCommand,
  CanvasCliCommand,
  CreateCliCommand,
  DeleteCliCommand,
  FrontCliCommand,
  GroupCliCommand,
  HelpCliCommand,
  InitCliCommand,
  MoveCliCommand,
  ReadCliCommand,
  RedoCliCommand,
  SaveCliCommand,
  ScaleCliCommand,
  SetCliCommand,
  ShowCliCommand,
  TreeCliCommand,
  UndoCliCommand,
  UngroupCliCommand,
} from "./commands/index.js";

export class BuiltinCommandsPlugin implements Plugin {
  private readonly reader: SvgReader;
  private readonly writer = new SvgWriter();

  public constructor(
    private readonly session: DefaultCommandContext,
    private readonly commandCatalog: CommandRegistry,
    private readonly factory: ShapeFactory,
    private readonly attributeHandlers: AttributeHandlerRegistry,
  ) {
    this.reader = new SvgReader(factory);
  }

  public activate(context: PluginContext): void {
    context.commands.register(new InitCliCommand(this.session));
    context.commands.register(new ReadCliCommand(this.session, this.reader));
    context.commands.register(new SaveCliCommand(this.session, this.writer));
    context.commands.register(new CanvasCliCommand(this.session));
    context.commands.register(new CreateCliCommand(this.session, this.factory));
    context.commands.register(new DeleteCliCommand(this.session));
    context.commands.register(new MoveCliCommand(this.session));
    context.commands.register(new ScaleCliCommand(this.session));
    context.commands.register(new SetCliCommand(this.session, this.attributeHandlers));
    context.commands.register(new GroupCliCommand(this.session));
    context.commands.register(new UngroupCliCommand(this.session));
    context.commands.register(new AddToCliCommand(this.session));
    context.commands.register(new FrontCliCommand(this.session));
    context.commands.register(new BackCliCommand(this.session));
    context.commands.register(new TreeCliCommand(this.session));
    context.commands.register(new ShowCliCommand(this.session));
    context.commands.register(new HelpCliCommand(this.session, this.commandCatalog));
    context.commands.register(new UndoCliCommand(this.session));
    context.commands.register(new RedoCliCommand(this.session));
  }
}
