// Release build driver for the signed-debug APK.
//
// The DeepSeek key is inlined by Metro from EXPO_PUBLIC_DEEPSEEK_API_KEY. Gradle does not track
// environment variables as task inputs, so an unchanged JS tree reuses a stale bundle — the key
// would silently disappear from the APK. This script makes the key an explicit build input:
// it validates the variable, invalidates the generated JS bundle, then verifies the shipped
// bundle actually contains the key.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const android = path.join(root, "android");
const generatedBundle = path.join(
  android,
  "app",
  "build",
  "generated",
  "assets",
  "react",
);
const bundleFile = path.join(generatedBundle, "release", "index.android.bundle");

const key = process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY ?? "";
const allowMissing = process.env.ALLOW_MISSING_DEEPSEEK_KEY === "1";

if (!key.trim() && !allowMissing) {
  console.error(
    "EXPO_PUBLIC_DEEPSEEK_API_KEY is not set. Export it before building, or set\n" +
      "ALLOW_MISSING_DEEPSEEK_KEY=1 to build an APK whose 一句话记账 reports a missing key.",
  );
  process.exit(1);
}

// Force Metro to run: Gradle cannot see the environment variable in its up-to-date check.
rmSync(generatedBundle, { recursive: true, force: true });

const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
execFileSync(gradle, ["assembleRelease"], {
  cwd: android,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

if (!existsSync(bundleFile)) {
  console.error(`Expected the release bundle at ${bundleFile}`);
  process.exit(1);
}
const bundle = readFileSync(bundleFile, "utf8");
if (!key.trim()) {
  console.warn("Built without a DeepSeek key (ALLOW_MISSING_DEEPSEEK_KEY=1).");
} else if (!bundle.includes(key.trim())) {
  console.error(
    "The release bundle does not contain EXPO_PUBLIC_DEEPSEEK_API_KEY. Aborting so the APK\n" +
      "never ships with a broken 一句话记账.",
  );
  process.exit(1);
}

await import("./copy-apk.mjs");
