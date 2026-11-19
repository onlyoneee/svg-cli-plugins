import type { AttributeHandler } from "./AttributeHandler.js";

export interface AttributeHandlerRegistration {
  register(handler: AttributeHandler): void;
}
