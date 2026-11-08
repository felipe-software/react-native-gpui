import { existsSync, lstatSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const link = join(exampleRoot, "node_modules");
const target = join("..", "..", "ts", "node_modules");

if (!existsSync(join(exampleRoot, target))) {
    console.error("ts/node_modules is missing; run `bun install` in ts/ first");
    process.exit(1);
}
const isLinked = existsSync(link) && lstatSync(link).isSymbolicLink();
if (!isLinked && !existsSync(link)) symlinkSync(target, link, "dir");
