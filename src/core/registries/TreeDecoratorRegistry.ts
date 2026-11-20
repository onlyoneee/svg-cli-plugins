import type { TreeDecorator } from "../../api/TreeDecorator.js";
import type { TreeDecoratorRegistration } from "../../api/TreeDecoratorRegistration.js";
import { EditorError } from "../../errors/EditorError.js";

export interface TreeDecoratorResolver {
  list(): readonly TreeDecorator[];
}

export interface TreeDecoratorRegistryCheckpoint {
  readonly decorators: ReadonlyMap<string, TreeDecorator>;
}

export class TreeDecoratorRegistry implements TreeDecoratorRegistration, TreeDecoratorResolver {
  private readonly decorators = new Map<string, TreeDecorator>();

  public register(decorator: TreeDecorator): void {
    const name = this.normalizedName(decorator.name);
    if (this.decorators.has(name)) {
      throw new EditorError(`duplicate registration: decorators/${name}`);
    }
    this.decorators.set(name, decorator);
  }

  public list(): readonly TreeDecorator[] {
    return [...this.decorators.values()];
  }

  public names(): readonly string[] {
    return [...this.decorators.keys()];
  }

  public checkpoint(): TreeDecoratorRegistryCheckpoint {
    return { decorators: new Map(this.decorators) };
  }

  public restore(checkpoint: TreeDecoratorRegistryCheckpoint): void {
    this.decorators.clear();
    for (const [name, decorator] of checkpoint.decorators) this.decorators.set(name, decorator);
  }

  private normalizedName(name: string): string {
    const normalized = name.trim().toLowerCase();
    if (!normalized) throw new EditorError("invalid registration: decorators/<empty>");
    return normalized;
  }
}
