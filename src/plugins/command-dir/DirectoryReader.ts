/** Target interface: independent of Node.js fs and suitable for test doubles. */
export interface DirectoryReader {
  read(path: string): readonly DirectoryEntry[];
}

export interface DirectoryEntry {
  readonly name: string;
  readonly kind: "directory" | "file" | "other";
}
