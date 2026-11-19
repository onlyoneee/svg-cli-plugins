import type { TreeDecorator } from "./TreeDecorator.js";

export interface TreeDecoratorRegistration {
  register(decorator: TreeDecorator): void;
}
