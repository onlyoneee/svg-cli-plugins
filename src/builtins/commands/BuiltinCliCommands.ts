import type { Command } from "../../api/Command.js";
import type { CommandContext } from "../../api/CommandContext.js";
import { AddToCommand } from "../../commands/AddToCommand.js";
import { BackCommand } from "../../commands/BackCommand.js";
import { CreateCommand } from "../../commands/CreateCommand.js";
import { DeleteCommand } from "../../commands/DeleteCommand.js";
import { FrontCommand } from "../../commands/FrontCommand.js";
import { GroupCommand } from "../../commands/GroupCommand.js";
import { MoveCommand } from "../../commands/MoveCommand.js";
import { ScaleCommand } from "../../commands/ScaleCommand.js";
import { SetCommand } from "../../commands/SetCommand.js";
import { UngroupCommand } from "../../commands/UngroupCommand.js";
import type { DefaultCommandContext } from "../../core/commands/DefaultCommandContext.js";
import type { CommandRegistry } from "../../core/registries/CommandRegistry.js";
import { EditorError } from "../../errors/EditorError.js";
import type { ShapeFactory } from "../../model/ShapeFactory.js";
import { SvgDocument } from "../../model/SvgDocument.js";
import type { SvgReader } from "../../persistence/SvgReader.js";
import type { SvgWriter } from "../../persistence/SvgWriter.js";

abstract class BuiltinCliCommand implements Command {
  public abstract readonly name: string;
  public abstract readonly helpLines: readonly string[];
  public abstract readonly requiresDocument: boolean;

  public constructor(protected readonly session: DefaultCommandContext) {}

  public abstract execute(arguments_: readonly string[], context: CommandContext): string;

  protected exactArgs(arguments_: readonly string[], count: number, usage: string): void {
    if (arguments_.length !== count) throw new EditorError(`usage: ${usage}`);
  }

  protected number(value: string | undefined, name: string): number {
    const parsed = Number(value);
    if (value === undefined || value.trim() === "" || !Number.isFinite(parsed)) {
      throw new EditorError(`invalid number for ${name}: ${value ?? ""}`);
    }
    return parsed;
  }
}

export class InitCliCommand extends BuiltinCliCommand {
  public readonly name = "init";
  public readonly helpLines = ["init [w] [h]"];
  public readonly requiresDocument = false;

  public override execute(arguments_: readonly string[]): string {
    if (arguments_.length !== 0 && arguments_.length !== 2) throw new EditorError("usage: init [w] [h]");
    const width = arguments_.length === 0 ? 800 : this.number(arguments_[0], "w");
    const height = arguments_.length === 0 ? 600 : this.number(arguments_[1], "h");
    this.session.replaceDocument(new SvgDocument(width, height));
    this.session.markIoBoundary();
    return `canvas ${width}x${height} created`;
  }
}

export class ReadCliCommand extends BuiltinCliCommand {
  public readonly name = "read";
  public readonly helpLines = ["read <file.svg>"];
  public readonly requiresDocument = false;

  public constructor(session: DefaultCommandContext, private readonly reader: SvgReader) {
    super(session);
  }

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 1, "read <file.svg>");
    const path = arguments_[0] ?? "";
    const result = this.reader.read(path);
    this.session.replaceDocument(result.document);
    this.session.markIoBoundary();
    return [...result.warnings, `read ${path} (${result.document.countElements()} elements)`].join("\n");
  }
}

export class SaveCliCommand extends BuiltinCliCommand {
  public readonly name = "save";
  public readonly helpLines = ["save [file.svg]"];
  public readonly requiresDocument = true;

  public constructor(session: DefaultCommandContext, private readonly writer: SvgWriter) {
    super(session);
  }

  public override execute(arguments_: readonly string[]): string {
    if (arguments_.length > 1) throw new EditorError("usage: save [file.svg]");
    const document = this.session.requireDocument();
    const path = this.writer.write(document, arguments_[0]);
    this.session.markIoBoundary();
    return `saved to ${path} (${document.countElements()} elements)`;
  }
}

export class CanvasCliCommand extends BuiltinCliCommand {
  public readonly name = "canvas";
  public readonly helpLines = ["canvas [w] [h]"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    const document = this.session.requireDocument();
    if (arguments_.length === 0) return `canvas ${document.width}x${document.height}`;
    this.exactArgs(arguments_, 2, "canvas [w] [h]");
    const width = this.number(arguments_[0], "w");
    const height = this.number(arguments_[1], "h");
    document.setCanvas(width, height);
    this.session.markIoBoundary();
    return `canvas resized to ${width}x${height}`;
  }
}

export class CreateCliCommand extends BuiltinCliCommand {
  public readonly name = "create";
  public readonly helpLines = [
    "create rect <id> <x> <y> <w> <h> [fill] [in <containerId>]",
    "create circle <id> <cx> <cy> <r> [fill] [in <containerId>]",
    "create ellipse <id> <cx> <cy> <rx> <ry> [fill] [in <containerId>]",
    "create line <id> <x1> <y1> <x2> <y2> [stroke] [in <containerId>]",
    'create text <id> <x> <y> "content" [in <containerId>]',
    "create g <id> [in <containerId>]",
  ];
  public readonly requiresDocument = true;

  public constructor(session: DefaultCommandContext, private readonly factory: ShapeFactory) {
    super(session);
  }

  public override execute(arguments_: readonly string[]): string {
    if (arguments_.length < 2) {
      throw new EditorError("usage: create <type> <id> [params…] [in <containerId>]");
    }
    const [type = "", id = "", ...rawParameters] = arguments_;
    let parameters = rawParameters;
    let containerId: string | undefined;
    if (rawParameters.length >= 2 && rawParameters.at(-2) === "in") {
      containerId = rawParameters.at(-1);
      parameters = rawParameters.slice(0, -2);
    }
    return this.session.execute(new CreateCommand(this.factory, type, id, parameters, containerId));
  }
}

export class DeleteCliCommand extends BuiltinCliCommand {
  public readonly name = "delete";
  public readonly helpLines = ["delete <id>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 1, "delete <id>");
    return this.session.execute(new DeleteCommand(arguments_[0] ?? ""));
  }
}

export class MoveCliCommand extends BuiltinCliCommand {
  public readonly name = "move";
  public readonly helpLines = ["move <id> <dx> <dy>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 3, "move <id> <dx> <dy>");
    return this.session.execute(
      new MoveCommand(arguments_[0] ?? "", this.number(arguments_[1], "dx"), this.number(arguments_[2], "dy")),
    );
  }
}

export class ScaleCliCommand extends BuiltinCliCommand {
  public readonly name = "scale";
  public readonly helpLines = ["scale <id> <factor>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 2, "scale <id> <factor>");
    return this.session.execute(new ScaleCommand(arguments_[0] ?? "", this.number(arguments_[1], "factor")));
  }
}

export class SetCliCommand extends BuiltinCliCommand {
  public readonly name = "set";
  public readonly helpLines = ["set <id> <attr> <value>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 3, "set <id> <attr> <value>");
    return this.session.execute(new SetCommand(arguments_[0] ?? "", arguments_[1] ?? "", arguments_[2] ?? ""));
  }
}

export class GroupCliCommand extends BuiltinCliCommand {
  public readonly name = "group";
  public readonly helpLines = ["group <newGid> <id1> <id2>…"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    if (arguments_.length < 2) throw new EditorError("usage: group <newGid> <id1> <id2>…");
    return this.session.execute(new GroupCommand(arguments_[0] ?? "", arguments_.slice(1)));
  }
}

export class UngroupCliCommand extends BuiltinCliCommand {
  public readonly name = "ungroup";
  public readonly helpLines = ["ungroup <gid>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 1, "ungroup <gid>");
    return this.session.execute(new UngroupCommand(arguments_[0] ?? ""));
  }
}

export class AddToCliCommand extends BuiltinCliCommand {
  public readonly name = "addto";
  public readonly helpLines = ["addto <gid> <id>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 2, "addto <gid> <id>");
    return this.session.execute(new AddToCommand(arguments_[0] ?? "", arguments_[1] ?? ""));
  }
}

export class FrontCliCommand extends BuiltinCliCommand {
  public readonly name = "front";
  public readonly helpLines = ["front <id>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 1, "front <id>");
    return this.session.execute(new FrontCommand(arguments_[0] ?? ""));
  }
}

export class BackCliCommand extends BuiltinCliCommand {
  public readonly name = "back";
  public readonly helpLines = ["back <id>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 1, "back <id>");
    return this.session.execute(new BackCommand(arguments_[0] ?? ""));
  }
}

export class TreeCliCommand extends BuiltinCliCommand {
  public readonly name = "tree";
  public readonly helpLines = ["tree [id]"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    if (arguments_.length > 1) throw new EditorError("usage: tree [id]");
    return this.session.requireDocument().tree(arguments_[0]);
  }
}

export class ShowCliCommand extends BuiltinCliCommand {
  public readonly name = "show";
  public readonly helpLines = ["show <id>"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 1, "show <id>");
    return this.session.requireDocument().show(arguments_[0] ?? "");
  }
}

export class HelpCliCommand extends BuiltinCliCommand {
  public readonly name = "help";
  public readonly helpLines = ["help"];
  public readonly requiresDocument = false;

  public constructor(session: DefaultCommandContext, private readonly commands: CommandRegistry) {
    super(session);
  }

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 0, "help");
    return this.commands.list().flatMap((command) => command.helpLines).join("\n");
  }
}

export class UndoCliCommand extends BuiltinCliCommand {
  public readonly name = "undo";
  public readonly helpLines = ["undo"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 0, "undo");
    return this.session.undo();
  }
}

export class RedoCliCommand extends BuiltinCliCommand {
  public readonly name = "redo";
  public readonly helpLines = ["redo"];
  public readonly requiresDocument = true;

  public override execute(arguments_: readonly string[]): string {
    this.exactArgs(arguments_, 0, "redo");
    return this.session.redo();
  }
}
