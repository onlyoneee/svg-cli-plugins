import type { TreeDecorator } from "../../api/TreeDecorator.js";
import type { TreeDecoratorRegistration } from "../../api/TreeDecoratorRegistration.js";
import { EditorError } from "../../errors/EditorError.js";

export interface TreeDecoratorResolver {
  list(): readonly TreeDecorator[];
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

  private normalizedName(name: string): string {
    const normalized = name.trim().toLowerCase();
    if (!normalized) throw new EditorError("invalid registration: decorators/<empty>");
    return normalized;
  }
}
