// One-command release: bump version -> build APK -> git commit/tag/push ->
// create GitHub Release -> upload APK asset.
//
// Usage:
//   GH_TOKEN=<token> npm run release [-- --version 0.1.0 --notes "..." --prerelease]
//
//   --skip-bump  reuse current app.json version (e.g. retry after a failed upload;
//                build is skipped when the APK for this version already exists)
//   --dry-run    print the plan only; no git/GitHub side effects
//
// Idempotency: if the release (or the APK asset) already exists on GitHub it is
// reused/replaced instead of failing, so a crashed run can simply be re-run.
// Note: prerelease releases never match /releases/latest, so the in-app updater
// ignores them — use --prerelease to stage test builds safely.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  apkAssetName,
  applyBump,
  deriveNotes,
  parseArgs,
  planBump,
} from "./release-lib.mjs";

const GITHUB_REPO = "BjChacha/finance-tracker";
const API = "https://api.github.com";
const UPLOADS = "https://uploads.github.com";

const root = path.resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
const isWin = process.platform === "win32";

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8" }).trim();
}

/** git 命令失败属预期（如仓库还没有上一个 tag）：stderr 静默，返回 null。 */
function tryGit(...gitArgs) {
  try {
    return execFileSync("git", gitArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function run(cmd, cmdArgs, opts = {}) {
  execFileSync(cmd, cmdArgs, {
    cwd: root,
    stdio: opts.inherit ? "inherit" : "pipe",
    shell: isWin && cmd === "npm",
  });
}

async function github(pathname, { method = "GET", body, token, raw = false } = {}) {
  const url = pathname.startsWith("http") ? pathname : `${API}${pathname}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: raw ? "application/octet-stream" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const init = { method, headers };
  if (body !== undefined) {
    if (raw) {
      init.body = body;
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API ${method} ${pathname} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return raw ? res : res.json();
}

function readJson(relPath) {
  try {
    return JSON.parse(readFileSync(path.join(root, relPath), "utf8"));
  } catch (err) {
    throw new Error(`Failed to read ${relPath}: ${err.message}`, { cause: err });
  }
}

// ---- 1. Pre-flight -----------------------------------------------------------

const token = process.env.GH_TOKEN ?? process.env.GH_ENTERPRISE_TOKEN;
if (!token && !args.dryRun) {
  console.error("GH_TOKEN is not set. Create one at github.com/settings/tokens (repo scope).");
  process.exit(1);
}

const gitStatus = git("status", "--porcelain");
if (gitStatus && !args.dryRun) {
  console.error("Git working tree is dirty. Commit or stash first so the release commit stays clean:");
  console.error(gitStatus);
  process.exit(1);
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const appJson = readJson("app.json");
const pkgJson = readJson("package.json");
const plan = planBump(appJson, pkgJson, args);
const apkPath = path.join(root, "build", "release", apkAssetName({ expo: { ...appJson.expo, version: plan.nextVersion } }));
const notes = deriveNotes(
  plan.nextVersion,
  args.notes,
  (() => {
    // 仓库还没有上一个 tag 时 git describe 失败，属预期：notes 退化为默认文案
    const prevTag = tryGit("describe", "--tags", "--abbrev=0", "HEAD^", "HEAD");
    return prevTag ? tryGit("log", `${prevTag}..HEAD`, "--oneline", "--no-decorate") : "";
  })(),
);

console.log(`Release plan (${args.dryRun ? "dry run" : "live"}):`);
console.log(`  version    ${plan.current} -> ${plan.nextVersion} (versionCode ${plan.nextVersionCode})`);
console.log(`  tag        ${plan.tagName} on branch ${branch}`);
console.log(`  apk        ${path.relative(root, apkPath)}${existsSync(apkPath) ? " (exists)" : " (will build)"}`);
console.log(`  prerelease ${args.prerelease}`);
console.log(`  notes:\n${notes.split("\n").map((l) => `    ${l}`).join("\n")}`);
if (args.dryRun) process.exit(0);

// ---- 2. Bump + build (git untouched until the APK is verified) ---------------

if (!args.skipBump) {
  applyBump(appJson, pkgJson, plan);
  writeFileSync(path.join(root, "app.json"), JSON.stringify(appJson, null, 2) + "\n");
  writeFileSync(path.join(root, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n");
  console.log(`Bumped app.json/package.json to ${plan.nextVersion}.`);
}

if (!existsSync(apkPath)) {
  console.log("Building APK via npm run build:apk ...");
  run("npm", ["run", "build:apk"], { inherit: true });
  if (!existsSync(apkPath)) {
    console.error(`Build finished but ${path.relative(root, apkPath)} is missing.`);
    process.exit(1);
  }
} else {
  console.log(`Reusing existing ${path.relative(root, apkPath)} (use --skip-bump to force a rebuild by hand).`);
}

// ---- 3. Publish git commit + tag, then push ----------------------------------

run("git", ["add", "app.json", "package.json"]);
run("git", ["commit", "-m", `chore(release): ${plan.tagName}`]);
run("git", ["tag", "-a", plan.tagName, "-m", `Release ${plan.tagName}`]);
run("git", ["push", "origin", `HEAD:${branch}`]);
run("git", ["push", "origin", plan.tagName]);
console.log(`Pushed commit + tag ${plan.tagName}.`);

// ---- 4. GitHub Release + APK asset -------------------------------------------

let release;
try {
  release = await github(`/repos/${GITHUB_REPO}/releases`, {
    method: "POST",
    token,
    body: {
      tag_name: plan.tagName,
      name: plan.tagName,
      body: notes,
      prerelease: args.prerelease,
    },
  });
  console.log(`Created release ${release.html_url}`);
} catch (err) {
  // 422 already_exists means a previous run crashed after creating the release -> reuse it.
  // Anything else (bad token, network) must abort instead of silently retrying.
  if (!(err instanceof Error) || !err.message.includes("-> 422")) throw err;
  release = await github(`/repos/${GITHUB_REPO}/releases/tags/${plan.tagName}`, { token });
  console.log(`Release already exists, reusing ${release.html_url}`);
}

const asset = (release.assets ?? []).find((a) => a.name === path.basename(apkPath));
if (asset) {
  await github(`/repos/${GITHUB_REPO}/releases/assets/${asset.id}`, { method: "DELETE", token });
  console.log(`Deleted stale asset ${asset.name}.`);
}

await github(
  `${UPLOADS}/repos/${GITHUB_REPO}/releases/${release.id}/assets?name=${encodeURIComponent(path.basename(apkPath))}`,
  {
    method: "POST",
    token,
    raw: true,
    body: readFileSync(apkPath),
  },
);
console.log(`Uploaded ${path.basename(apkPath)} (${(readFileSync(apkPath).length / 1e6).toFixed(1)} MB).`);
console.log(`\nDone: ${release.html_url}`);
