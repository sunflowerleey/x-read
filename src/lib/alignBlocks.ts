/**
 * Align two arrays of markdown blocks using headings as anchor points.
 * Returns pairs of [enBlock, zhBlock] where both sides are aligned
 * by matching heading patterns (## xxx).
 *
 * Between headings, non-heading blocks are paired by index offset.
 * If one side has more blocks than the other in a section, the extra
 * blocks are paired with empty strings.
 */
export function alignBlocks(
  enBlocks: string[],
  zhBlocks: string[]
): [string, string][] {
  const enSections = groupByHeading(enBlocks);
  const zhSections = groupByHeading(zhBlocks);

  const result: [string, string][] = [];

  const enKeys = Array.from(enSections.keys());
  const zhUsed = new Set<number>();

  for (let si = 0; si < enKeys.length; si++) {
    const enKey = enKeys[si];
    const enGroup = enSections.get(enKey)!;

    // Find matching zh section — try exact heading index first, then fuzzy
    let zhKey: string | undefined;
    let zhGroup: string[] | undefined;

    // Strategy 1: match by section index (same position)
    const zhKeys = Array.from(zhSections.keys());
    if (si < zhKeys.length && !zhUsed.has(si)) {
      zhKey = zhKeys[si];
      zhGroup = zhSections.get(zhKey);
      zhUsed.add(si);
    }

    if (!zhGroup) zhGroup = [];

    // Pair blocks within the section
    const maxLen = Math.max(enGroup.length, zhGroup.length);
    for (let i = 0; i < maxLen; i++) {
      result.push([enGroup[i] || "", zhGroup[i] || ""]);
    }
  }

  // Any remaining zh sections not matched
  const zhKeys = Array.from(zhSections.keys());
  for (let si = 0; si < zhKeys.length; si++) {
    if (!zhUsed.has(si)) {
      const zhGroup = zhSections.get(zhKeys[si])!;
      for (const block of zhGroup) {
        result.push(["", block]);
      }
    }
  }

  return result;
}

/**
 * Group blocks into sections, where each section starts with a heading.
 * The first group may have no heading (preamble blocks).
 * Key is section index as string.
 */
function groupByHeading(blocks: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let sectionIdx = 0;
  let current: string[] = [];

  for (const block of blocks) {
    if (block.startsWith("#")) {
      // Save previous section
      if (current.length > 0) {
        sections.set(String(sectionIdx), current);
        sectionIdx++;
      }
      current = [block];
    } else {
      current.push(block);
    }
  }

  // Save last section
  if (current.length > 0) {
    sections.set(String(sectionIdx), current);
  }

  return sections;
}
