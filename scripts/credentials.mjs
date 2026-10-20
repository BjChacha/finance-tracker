// Local credentials for the release/build scripts.
//
// Deliberately outside the repository (~/.finance-tracker/credentials.json): the repo path is
// covered by a *.env.* deny rule in the agent policy, and storing a token inside a git worktree
// risks committing it. Env vars always win, so CI or one-off `GH_TOKEN=... npm run release`
// still behaves exactly as before.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const CREDENTIALS_FILE = path.join(
  os.homedir(),
  ".finance-tracker",
  "credentials.json",
);

/**
 * Credentials from the local file: `{ ghToken?, deepseekApiKey? }`.
 *
 * A missing file means "nothing saved yet" and yields `{}` so callers fall back to env vars and
 * their own error message. A malformed file throws instead: silently ignoring a typo would turn
 * into a confusing "token missing" error later.
 */
export function readCredentials() {
  let raw;
  try {
    raw = readFileSync(CREDENTIALS_FILE, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Failed to read ${CREDENTIALS_FILE}: ${error.message}`, {
      cause: error,
    });
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `${CREDENTIALS_FILE} is not valid JSON (${error.message}). ` +
        'Expected {"ghToken": "...", "deepseekApiKey": "..."}.',
      { cause: error },
    );
  }
}

/** GitHub token: explicit env wins, then the saved file. */
export function resolveGithubToken() {
  return (
    process.env.GH_TOKEN ??
    process.env.GH_ENTERPRISE_TOKEN ??
    readCredentials().ghToken ??
    ""
  );
}

/** DeepSeek key that gets inlined into the JS bundle at build time. */
export function resolveDeepseekKey() {
  return (
    process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY ??
    readCredentials().deepseekApiKey ??
    ""
  );
}
