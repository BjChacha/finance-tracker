import patterns from "./validation-patterns.json";
import type { NaturalLanguageContext } from "./context";

type AccountField = "account" | "to_account";
type Decision = {
  type: string | null;
  account: string | null;
  to_account: string | null;
};
export type AccountMention = {
  start: number;
  end: number;
  text: string;
  candidate_ids: string[];
};
const FIELDS = ["account", "to_account"] as const;
const bridgePattern = new RegExp(`^(?:${patterns.transferBridge})$`, "u");
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function accountMentions(
  text: string,
  context: NaturalLanguageContext,
): AccountMention[] {
  const surfaces = new Map<string, Set<string>>();
  for (const row of context.accounts) {
    if (row.active === false) continue;
    for (const alias of [row.name, ...(row.aliases ?? [])]) {
      if (!alias) continue;
      const ids = surfaces.get(alias) ?? new Set<string>();
      ids.add(row.id);
      surfaces.set(alias, ids);
    }
  }
  const spans = new Map<
    string,
    { start: number; end: number; ids: Set<string> }
  >();
  for (const [alias, ids] of surfaces) {
    for (const match of text.matchAll(new RegExp(escapeRegex(alias), "giu"))) {
      const start = Array.from(text.slice(0, match.index)).length;
      const end = start + Array.from(match[0]).length;
      const key = `${start}:${end}`;
      const span = spans.get(key) ?? { start, end, ids: new Set<string>() };
      for (const id of ids) span.ids.add(id);
      spans.set(key, span);
    }
  }
  const all = [...spans.values()];
  const characters = Array.from(text);
  return all
    .filter(
      (span) =>
        !all.some(
          (other) =>
            other !== span &&
            other.start <= span.start &&
            span.end <= other.end,
        ),
    )
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((span) => ({
      start: span.start,
      end: span.end,
      text: characters.slice(span.start, span.end).join(""),
      candidate_ids: [...span.ids].sort(),
    }));
}

/** Confirmation requirements never replace the model's chosen accounts. */
export function auditAccountEvidence(
  text: string,
  context: NaturalLanguageContext,
  decision: Decision,
) {
  const mentions = accountMentions(text, context);
  const fields = new Set<AccountField>();
  const uncertainty = new RegExp(patterns.uncertainAccount, "u").test(text);
  const identityConflict = new RegExp(patterns.identityConflict, "u").test(
    text,
  );
  for (const field of FIELDS) {
    if (decision[field] === null) continue;
    const unique = mentions.some(
      (mention) =>
        mention.candidate_ids.length === 1 &&
        mention.candidate_ids[0] === decision[field],
    );
    if (!unique || uncertainty || identityConflict) fields.add(field);
  }
  const characters = Array.from(text);
  if (decision.type === "transfer") {
    for (let index = 0; index < mentions.length - 1; index += 1) {
      const source = mentions[index];
      const destination = mentions[index + 1];
      if (
        source.candidate_ids.length !== 1 ||
        destination.candidate_ids.length !== 1 ||
        source.end > destination.start
      )
        continue;
      if (
        !bridgePattern.test(
          characters.slice(source.end, destination.start).join(""),
        )
      )
        continue;
      if (
        decision.account !== null &&
        decision.account !== source.candidate_ids[0]
      )
        fields.add("account");
      if (
        decision.to_account !== null &&
        decision.to_account !== destination.candidate_ids[0]
      )
        fields.add("to_account");
    }
  }
  const directionVerified =
    mentions.length === 2 &&
    mentions.every((mention) => mention.candidate_ids.length === 1) &&
    mentions[0].candidate_ids[0] !== mentions[1].candidate_ids[0] &&
    bridgePattern.test(
      characters.slice(mentions[0].end, mentions[1].start).join(""),
    ) &&
    decision.account === mentions[0].candidate_ids[0] &&
    decision.to_account === mentions[1].candidate_ids[0] &&
    fields.size === 0;
  return {
    mentions,
    confirmationFields: [...fields].sort(),
    directionVerified,
  };
}
