/**
 * Split markdown into logical blocks for side-by-side alignment.
 * Lists with blank lines between items are kept as a single block.
 */
export function splitMarkdownIntoBlocks(md: string): string[] {
  const lines = md.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inCodeBlock = false;
  let inList = false;

  function flush() {
    const block = current.join("\n").trim();
    if (block) blocks.push(block);
    current = [];
    inList = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code blocks
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        flush();
        inCodeBlock = true;
        current.push(line);
        continue;
      } else {
        current.push(line);
        inCodeBlock = false;
        flush();
        continue;
      }
    }

    if (inCodeBlock) {
      current.push(line);
      continue;
    }

    // Heading — always its own block
    if (trimmed.startsWith("#")) {
      flush();
      blocks.push(trimmed);
      continue;
    }

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      flush();
      blocks.push(trimmed);
      continue;
    }

    // Blank line
    if (trimmed === "") {
      if (inList) {
        // Inside a list: look ahead to see if next content is also a list item
        const nextContent = findNextNonBlank(lines, i + 1);
        if (nextContent !== null && isListLine(nextContent)) {
          // Continue the list — keep the blank line
          current.push(line);
          continue;
        }
      }
      flush();
      continue;
    }

    // Check if this line starts or continues a list
    if (isListLine(trimmed)) {
      if (!inList && current.length > 0) {
        // Transitioning from non-list to list — flush the non-list part
        flush();
      }
      inList = true;
      current.push(line);
      continue;
    }

    // Non-list content
    if (inList) {
      // Leaving a list — flush it first
      flush();
    }
    current.push(line);
  }

  flush();
  return blocks;
}

function isListLine(line: string): boolean {
  return /^(\d+\.?\s+|\*\s+|-\s+)/.test(line);
}

function findNextNonBlank(lines: string[], start: number): string | null {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() !== "") return lines[i].trim();
  }
  return null;
}
