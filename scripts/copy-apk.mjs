// Copies the release APK produced by assembleRelease into ./build/release,
// named after the app slug and version from app.json.
// Kept outside android/ because that directory is a prebuild artifact.
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const source = path.join(
  root,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);
const outDir = path.join(root, "build", "release");

let expo;
try {
  ({ expo } = JSON.parse(await readFile(path.join(root, "app.json"), "utf8")));
} catch (err) {
  throw new Error(`Failed to read app.json from ${root}: ${err.message}`, { cause: err });
}
const dest = path.join(outDir, `${expo.slug}-${expo.version}.apk`);

await mkdir(outDir, { recursive: true });
await copyFile(source, dest);
console.log(`APK ready: ${path.relative(root, dest)}`);
