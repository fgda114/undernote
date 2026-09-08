#!/usr/bin/env node
/**
 * Pure decision of what a single `issues` webhook event means for the
 * publish desk. Kept out of publish.yml's `if:` conditions on purpose
 * (per the team lead's directive: judgment logic belongs in a tested
 * function, not workflow YAML) — every branch here has a unit test against
 * a realistic event shape instead of only ever being exercised by a real
 * GitHub push.
 *
 * The job-level `if:` in publish.yml already filters out the bulk of
 * irrelevant traffic (wrong author, not one of our two templates, an
 * `opened`/`edited`/`labeled` action we don't care about at all) BEFORE
 * this step ever runs, purely to avoid spending Actions minutes on a
 * private repo (docs/publishing.md §"비용"). What THIS function resolves is
 * the finer question that filter cannot: given the event got this far,
 * which of the three pipelines does it mean?
 */

export const TAKEDOWN_LABEL = '내림';
export const PUBLISHED_LABEL = 'published';

const OUR_TEMPLATE_LABELS = ['publish:review', 'publish:story'];

/**
 * @param {{
 *   eventName: string,      // github.event_name — expected to always be "issues" here
 *   action: string,         // github.event.action — "opened" | "edited" | "labeled" | ...
 *   labelName?: string,     // github.event.label.name — only set for "labeled"
 *   issueLabels: string[],  // every label currently on the issue, post-event
 * }} input
 * @returns {'publish' | 'update' | 'takedown' | 'skip'}
 */
export function determineMode({ eventName, action, labelName, issueLabels }) {
  if (eventName !== 'issues') return 'skip';
  if (!OUR_TEMPLATE_LABELS.some((l) => issueLabels.includes(l))) return 'skip';

  if (action === 'labeled') {
    // Only OUR marker label means anything here — a repo can carry any
    // number of other labels (bug, question, …) and adding one of those
    // must pass through completely unnoticed.
    return labelName === TAKEDOWN_LABEL ? 'takedown' : 'skip';
  }

  if (action === 'edited') return issueLabels.includes(PUBLISHED_LABEL) ? 'update' : 'publish';
  // A brand-new issue can never already carry `published` (that label is
  // only ever added AFTER a successful publish of THIS SAME issue), so
  // 'opened' is unconditionally the publish path.
  if (action === 'opened') return 'publish';
  return 'skip';
}

// ── CLI glue — reads the event shape from env vars the workflow step sets,
// writes `mode=<value>` to GITHUB_OUTPUT. No package dependency (pure
// node:fs), so this can run before `npm ci` even happens. ──
import { appendFileSync } from 'node:fs';

function main() {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error('GITHUB_OUTPUT is not set — this script must run as a GitHub Actions step.');
  const mode = determineMode({
    eventName: process.env.GH_EVENT_NAME ?? '',
    action: process.env.GH_EVENT_ACTION ?? '',
    labelName: process.env.GH_EVENT_LABEL_NAME || undefined,
    issueLabels: (process.env.GH_ISSUE_LABELS ?? '').split(',').filter(Boolean),
  });
  appendFileSync(outputPath, `mode=${mode}\n`, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
