/** Positive-path configuration contract harness, NOT D's production loader.
 * Runs in a subprocess so cwd and filesystem fixtures cannot affect other tests.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginManifest } from "../../src/api/index.js";
import { CliApplication, type CliPluginInput } from "../../src/cli/CliApplication.js";

async function main(): Promise<void> {
  let requests: CliPluginInput[];
  const configPath = process.argv[2];
  if (configPath) {
    const configRequire = createRequire(resolve(configPath));
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      plugins: { module: string; enabled?: boolean; options?: unknown }[];
    };
    requests = [];
    for (const entry of config.plugins) {
      if (entry.enabled === false) continue;
      const modulePath = configRequire.resolve(entry.module);
      const manifest = configRequire(`${entry.module}/package.json`) as PluginManifest;
      const loaded = await import(pathToFileURL(modulePath).href);
      requests.push({ plugin: loaded.default, manifest, options: entry.options });
    }
  } else {
    const stats = await import("../../src/plugins/command-stats/index.mjs");
    const dir = await import("../../src/plugins/command-dir/index.mjs");
    // __dirname is dist/tests/helpers; manifests live in source packages.
    const root = resolve(__dirname, "../../..");
    const manifest = (name: string): PluginManifest =>
      JSON.parse(readFileSync(resolve(root, `src/plugins/command-${name}/package.json`), "utf8")) as PluginManifest;
    requests = [
      { plugin: stats.default, manifest: manifest("stats") },
      { plugin: dir.default, manifest: manifest("dir") },
    ];
  }
  const cli = new CliApplication(requests);
  for (const error of cli.startupErrors()) console.log(error);
  for (const line of readFileSync(0, "utf8").split(/\r?\n/)) {
    const output = cli.executeLine(line);
    if (output !== null) console.log(output);
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
