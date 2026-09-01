import type { ApplyResult } from "./apply.ts";

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

/**
 * The human-readable outcome: what landed where, what needs a person, and
 * the applied / needs-input / skipped ratio — the one hard number saying
 * whether heuristic mapping works at all, tracked from the first session.
 */
export function renderAppliedMarkdown(result: ApplyResult, reviewPath: string): string {
  const lines: string[] = ["# Aplikace review", "", `review: \`${reviewPath}\``, ""];

  lines.push("## Změny", "");
  if (result.changes.length === 0) {
    lines.push("Žádné přímé editace.", "");
  } else {
    lines.push("| změna | soubor:řádek | stav | poznámka |", "| --- | --- | --- | --- |");
    for (const change of result.changes) {
      lines.push(
        `| ${change.id} | ${change.location === undefined ? "—" : `\`${change.location}\``} | ${change.status} | ${cell(change.note)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Komentáře", "");
  if (result.comments.length === 0) {
    lines.push("Žádné komentáře.", "");
  } else {
    lines.push(
      "| komentář | kategorie | priorita | cíl | akce | text |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const comment of result.comments) {
      lines.push(
        `| ${comment.id} | ${comment.category ?? "—"} | ${comment.priority ?? "—"} | ${comment.location === undefined ? "—" : `\`${comment.location}\``} | ${comment.action} | ${cell(comment.text)} |`,
      );
    }
    lines.push("");
  }

  const { applied, needsInput, skipped } = result.ratio;
  const total = applied + needsInput + skipped;
  const percentage = total === 0 ? "—" : `${Math.round((applied / total) * 100)} % applied`;
  lines.push(
    "## Poměr",
    "",
    `applied ${applied} / needs-input ${needsInput} / skipped ${skipped} (${percentage})`,
    "",
  );

  return lines.join("\n");
}
