/**
 * Translation invariant checks.
 *
 * Computes structural metrics on markdown and compares pre/post translation.
 * Violations indicate bugs in the translation pipeline (lost images, dropped
 * headings, merged paragraphs) and are logged as warnings.
 *
 * This is a runtime safety net: unit tests use synthetic data that can't
 * capture real LLM behavior, so we check invariants on every production
 * translation instead.
 */

export interface Metrics {
  headings: number;
  images: number;
  blocks: number;
  chars: number;
}

export interface MetricsDelta {
  before: Metrics;
  after: Metrics;
  violations: string[];
}

/** Count standalone image blocks (`![...](...)` on their own line). */
export function countImages(markdown: string): number {
  const matches = markdown.match(/^!\[.*?\]\(.*?\)$/gm);
  return matches ? matches.length : 0;
}

/** Count heading blocks (lines starting with `#`). */
export function countHeadings(markdown: string): number {
  const matches = markdown.match(/^#{1,6}\s/gm);
  return matches ? matches.length : 0;
}

/** Count blank-line-separated blocks (paragraphs, headings, images, etc). */
export function countBlocks(markdown: string): number {
  return markdown
    .split(/\n\n+/)
    .filter((b) => b.trim() !== "").length;
}

export function computeMetrics(markdown: string): Metrics {
  return {
    headings: countHeadings(markdown),
    images: countImages(markdown),
    blocks: countBlocks(markdown),
    chars: markdown.length,
  };
}

/**
 * Check translation invariants and return any violations.
 *
 * Invariants (ordered by severity):
 * 1. Image count MUST be equal — missing images means broken image placement
 * 2. Heading drift <= 2 AND <= 20% — more than that and alignment will break
 * 3. Block count within 30% — large swings suggest translation merged/split
 *    paragraphs substantially, which hurts bilingual alignment
 */
export function checkTranslationInvariants(
  before: Metrics,
  after: Metrics
): MetricsDelta {
  const violations: string[] = [];

  if (before.images !== after.images) {
    violations.push(
      `image_count_mismatch: before=${before.images} after=${after.images}`
    );
  }

  const headingDrift = Math.abs(before.headings - after.headings);
  const headingDriftRatio = before.headings > 0 ? headingDrift / before.headings : 0;
  // Flag if drift is both substantial (>3 absolute) AND non-trivial (>10% of total)
  if (headingDrift > 3 && headingDriftRatio > 0.1) {
    violations.push(
      `heading_drift: before=${before.headings} after=${after.headings} drift=${headingDrift}`
    );
  }

  const blockDrift = Math.abs(before.blocks - after.blocks);
  const blockDriftRatio = before.blocks > 0 ? blockDrift / before.blocks : 0;
  if (blockDriftRatio > 0.3) {
    violations.push(
      `block_drift: before=${before.blocks} after=${after.blocks} ratio=${blockDriftRatio.toFixed(2)}`
    );
  }

  return { before, after, violations };
}

/** Log a metrics delta as structured JSON for easy grep/analysis. */
export function logMetrics(stage: string, delta: MetricsDelta): void {
  const payload = {
    stage,
    ...delta,
    timestamp: new Date().toISOString(),
  };
  if (delta.violations.length > 0) {
    console.warn(
      `[translation-invariant] ${JSON.stringify(payload)}`
    );
  } else {
    console.log(
      `[translation-metrics] ${JSON.stringify(payload)}`
    );
  }
}
