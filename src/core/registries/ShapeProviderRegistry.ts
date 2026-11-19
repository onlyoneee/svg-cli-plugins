import type { ShapeProvider } from "../../api/ShapeProvider.js";
import type { ShapeProviderRegistration } from "../../api/ShapeProviderRegistration.js";
import { EditorError } from "../../errors/EditorError.js";

export interface ShapeProviderResolver {
  findByShapeType(shapeType: string): ShapeProvider | undefined;
  findForRead(svgTag: string, serializedKind?: string): ShapeProvider | undefined;
}

export class ShapeProviderRegistry implements ShapeProviderRegistration, ShapeProviderResolver {
  private readonly providers = new Map<string, ShapeProvider>();
  private readonly providersByShapeType = new Map<string, ShapeProvider>();
  private readonly defaultProvidersBySvgTag = new Map<string, ShapeProvider>();
  private readonly providersBySerializedKind = new Map<string, ShapeProvider>();

  public register(provider: ShapeProvider): void {
    const name = this.requiredKey(provider.name);
    const shapeType = this.requiredKey(provider.shapeType);
    const svgTag = this.requiredKey(provider.svgTag);
    const serializedKind = provider.serializedKind === undefined
      ? undefined
      : this.requiredKey(provider.serializedKind);

    this.ensureAvailable(this.providers, name, name);
    this.ensureAvailable(this.providersByShapeType, shapeType, shapeType);
    if (serializedKind === undefined) {
      this.ensureAvailable(this.defaultProvidersBySvgTag, svgTag, svgTag);
    } else {
      this.ensureAvailable(this.providersBySerializedKind, serializedKind, serializedKind);
    }

    this.providers.set(name, provider);
    this.providersByShapeType.set(shapeType, provider);
    if (serializedKind === undefined) this.defaultProvidersBySvgTag.set(svgTag, provider);
    else this.providersBySerializedKind.set(serializedKind, provider);
  }

  public findByShapeType(shapeType: string): ShapeProvider | undefined {
    return this.providersByShapeType.get(this.lookupKey(shapeType));
  }

  public findBySvgTag(svgTag: string): ShapeProvider | undefined {
    return this.defaultProvidersBySvgTag.get(this.lookupKey(svgTag));
  }

  public findBySerializedKind(serializedKind: string): ShapeProvider | undefined {
    return this.providersBySerializedKind.get(this.lookupKey(serializedKind));
  }

  public findForRead(svgTag: string, serializedKind?: string): ShapeProvider | undefined {
    if (serializedKind !== undefined) {
      const specialized = this.findBySerializedKind(serializedKind);
      if (specialized) return specialized;
    }
    return this.findBySvgTag(svgTag);
  }

  public list(): readonly ShapeProvider[] {
    return [...this.providers.values()];
  }

  public names(): readonly string[] {
    return [...this.providers.keys()];
  }

  private requiredKey(value: string): string {
    const normalized = this.lookupKey(value);
    if (!normalized) throw new EditorError("invalid registration: shapes/<empty>");
    return normalized;
  }

  private lookupKey(value: string): string {
    return value.trim().toLowerCase();
  }

  private ensureAvailable(
    registrations: ReadonlyMap<string, ShapeProvider>,
    key: string,
    reportedName: string,
  ): void {
    if (registrations.has(key)) {
      throw new EditorError(`duplicate registration: shapes/${reportedName}`);
    }
  }
}
