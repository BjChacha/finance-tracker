// Pure helpers for scripts/release.mjs (kept side-effect free so Jest can cover
// version bumping and argument parsing without touching git or the network).
// Imported by release.mjs and src/features/update/__tests__/release-lib.test.mjs.

export const TAG_PREFIX = "v";

/** Parse CLI arguments: --version x.y.z --notes "..." --prerelease --skip-bump --dry-run */
export function parseArgs(argv) {
  const args = { version: null, notes: null, prerelease: false, skipBump: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version") args.version = argv[++i];
    else if (a === "--notes") args.notes = argv[++i];
    else if (a === "--prerelease") args.prerelease = true;
    else if (a === "--skip-bump") args.skipBump = true;
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.version !== null && !/^\d+\.\d+\.\d+$/.test(args.version)) {
    throw new Error(`--version must be x.y.z, got: ${args.version}`);
  }
  return args;
}

/** "0.0.1" -> "0.0.2" (patch bump); rejects non-x.y.z input */
export function nextPatchVersion(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!parts) throw new Error(`Not a x.y.z version: ${version}`);
  return `${parts[1]}.${parts[2]}.${Number(parts[3]) + 1}`;
}

/**
 * Compute the next release plan from app.json/package.json payloads.
 * versionCode follows the Android rule "monotonic increase per release":
 * absent field is treated as 1 (the value shipped so far), then +1.
 */
export function planBump(appJson, pkgJson, args) {
  const current = appJson.expo.version;
  if (!current) throw new Error("app.json is missing expo.version");
  const nextVersion = args.skipBump ? current : (args.version ?? nextPatchVersion(current));
  if (nextVersion === current && !args.skipBump) {
    throw new Error(`--version ${nextVersion} equals the current version`);
  }
  const currentCode = appJson.expo.android?.versionCode ?? 1;
  return {
    current,
    nextVersion,
    nextVersionCode: args.skipBump ? currentCode : currentCode + 1,
    tagName: `${TAG_PREFIX}${nextVersion}`,
  };
}

/** Mutate the parsed app.json/package.json payloads to the bumped release state. */
export function applyBump(appJson, pkgJson, plan) {
  appJson.expo.version = plan.nextVersion;
  if (!appJson.expo.android) appJson.expo.android = {};
  appJson.expo.android.versionCode = plan.nextVersionCode;
  pkgJson.version = plan.nextVersion;
}

/** APK asset name expected on the release: slug-version.apk (matches copy-apk.mjs). */
export function apkAssetName(appJson) {
  return `${appJson.expo.slug}-${appJson.expo.version}.apk`;
}

/**
 * Release notes: explicit --notes wins; otherwise derive from git log between
 * the previous tag and HEAD (already oneline-formatted by the caller), falling
 * back to a plain "Release vx.y.z".
 */
export function deriveNotes(version, explicitNotes, commitsSinceLastTag) {
  if (explicitNotes && explicitNotes.trim()) return explicitNotes;
  const trimmed = (commitsSinceLastTag ?? "").trim();
  if (trimmed) return trimmed;
  return `Release ${TAG_PREFIX}${version}`;
}
