/**
 * Align two arrays of markdown blocks using headings as anchor points.
 * Returns pairs of [enBlock, zhBlock] where both sides are aligned
 * by matching heading-delimited sections.
 */
export function alignBlocks(
  enBlocks: string[],
  zhBlocks: string[]
): [string, string][] {
  const enSections = groupByHeading(enBlocks);
  const zhSections = groupByHeading(zhBlocks);

  const result: [string, string][] = [];

  const maxSections = Math.max(enSections.length, zhSections.length);
  for (let si = 0; si < maxSections; si++) {
    const enGroup = enSections[si] || [];
    const zhGroup = zhSections[si] || [];
    const maxLen = Math.max(enGroup.length, zhGroup.length);
    for (let i = 0; i < maxLen; i++) {
      result.push([enGroup[i] || "", zhGroup[i] || ""]);
    }
  }

  return result;
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
