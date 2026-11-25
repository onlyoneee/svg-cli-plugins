import { readdirSync } from "node:fs";
import type { DirectoryEntry, DirectoryReader } from "./DirectoryReader.js";

/** Adapter: Dirent metadata is translated without following symbolic links. */
export class NodeDirectoryReader implements DirectoryReader {
  public read(path: string): readonly DirectoryEntry[] {
    return readdirSync(path, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
    }));
  }
}
