/**
 * Align two arrays of markdown blocks using headings as anchor points.
 * Returns pairs of [enBlock, zhBlock] where both sides are aligned
 * by matching heading-delimited sections.
 *
 * Uses heading level matching with look-ahead to stay aligned even when
 * one side has extra/missing sections (common with HTML extraction noise
 * or translation variations).
 */
export function alignBlocks(
  enBlocks: string[],
  zhBlocks: string[]
): [string, string][] {
  const enSections = groupByHeading(enBlocks);
  const zhSections = groupByHeading(zhBlocks);

  const result: [string, string][] = [];

  let zi = 0;
  for (let ei = 0; ei < enSections.length; ei++) {
    const enGroup = enSections[ei];
    const enLevel = headingLevel(enGroup[0]);

    // Try to find a matching ZH section by heading level
    const match = findMatchingSection(zhSections, zi, enLevel);

    if (match !== -1) {
      // Emit any unmatched ZH sections before the match as ZH-only
      for (let j = zi; j < match; j++) {
        emitPair(result, [], zhSections[j]);
      }
      emitPair(result, enGroup, zhSections[match]);
      zi = match + 1;
    } else {
      // No matching ZH section — emit EN-only
      emitPair(result, enGroup, []);
    }
  }

  // Remaining unmatched ZH sections
  for (let j = zi; j < zhSections.length; j++) {
    emitPair(result, [], zhSections[j]);
  }

  return result;
}

/** Max number of ZH sections to look ahead when searching for a match. */
const LOOKAHEAD = 3;

/**
 * Find the next ZH section starting from `start` that has a matching
 * heading level. Searches up to LOOKAHEAD positions ahead.
 * Returns the index or -1 if not found.
 */
function findMatchingSection(
  zhSections: string[][],
  start: number,
  targetLevel: number
): number {
  // -1 means no heading (preamble) — match positionally
  if (targetLevel === -1) {
    return start < zhSections.length && headingLevel(zhSections[start][0]) === -1
      ? start
      : -1;
  }

  const end = Math.min(start + LOOKAHEAD, zhSections.length);
  for (let i = start; i < end; i++) {
    if (headingLevel(zhSections[i][0]) === targetLevel) {
      return i;
    }
  }
  return -1;
}

/** Extract heading level (1-6) from a block, or -1 if not a heading. */
export function headingLevel(block: string | undefined): number {
  if (!block || !block.startsWith("#")) return -1;
  const match = block.match(/^(#{1,6})\s/);
  return match ? match[1].length : -1;
}

/** Emit a pair of aligned sections, block by block. */
function emitPair(
  result: [string, string][],
  enGroup: string[],
  zhGroup: string[]
): void {
  const maxLen = Math.max(enGroup.length, zhGroup.length);
  for (let i = 0; i < maxLen; i++) {
    result.push([enGroup[i] || "", zhGroup[i] || ""]);
  }
}

/**
 * Group blocks into sections, where each section starts with a heading.
 */
function groupByHeading(blocks: string[]): string[][] {
  const sections: string[][] = [];
  let current: string[] = [];

  for (const block of blocks) {
    if (block.startsWith("#") && current.length > 0) {
      sections.push(current);
      current = [block];
    } else {
      current.push(block);
    }
  }

  if (current.length > 0) {
    sections.push(current);
  }

  return sections;
}
