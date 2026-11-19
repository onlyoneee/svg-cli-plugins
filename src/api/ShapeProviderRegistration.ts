import type { ShapeProvider } from "./ShapeProvider.js";

export interface ShapeProviderRegistration {
  register(provider: ShapeProvider): void;
}
