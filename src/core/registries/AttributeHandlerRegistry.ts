import type { AttributeHandler } from "../../api/AttributeHandler.js";
import type { AttributeHandlerRegistration } from "../../api/AttributeHandlerRegistration.js";
import type { ReadonlyShape } from "../../api/ReadonlyShape.js";
import { EditorError } from "../../errors/EditorError.js";

export interface AttributeHandlerResolver {
  findMatches(target: ReadonlyShape, attribute: string): readonly AttributeHandler[];
}

export interface AttributeHandlerRegistryCheckpoint {
  readonly handlers: ReadonlyMap<string, AttributeHandler>;
}

export class AttributeHandlerRegistry implements AttributeHandlerRegistration, AttributeHandlerResolver {
  private readonly handlers = new Map<string, AttributeHandler>();

  public register(handler: AttributeHandler): void {
    const name = this.normalizedName(handler.name);
    if (this.handlers.has(name)) {
      throw new EditorError(`duplicate registration: attributes/${name}`);
    }
    this.handlers.set(name, handler);
  }

  public findMatches(target: ReadonlyShape, attribute: string): readonly AttributeHandler[] {
    return this.list().filter((handler) => handler.handles(target, attribute));
  }

  public list(): readonly AttributeHandler[] {
    return [...this.handlers.values()];
  }

  public names(): readonly string[] {
    return [...this.handlers.keys()];
  }

  public checkpoint(): AttributeHandlerRegistryCheckpoint {
    return { handlers: new Map(this.handlers) };
  }

  public restore(checkpoint: AttributeHandlerRegistryCheckpoint): void {
    this.handlers.clear();
    for (const [name, handler] of checkpoint.handlers) this.handlers.set(name, handler);
  }

  private normalizedName(name: string): string {
    const normalized = name.trim().toLowerCase();
    if (!normalized) throw new EditorError("invalid registration: attributes/<empty>");
    return normalized;
  }
}
