export interface ReadonlyShape {
  readonly id: string;
  readonly type: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly children: readonly ReadonlyShape[];

  getAttribute(name: string): string | undefined;
  summary(): string;
}
