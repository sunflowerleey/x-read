/**
 * Post-processing pipeline for Jina Reader markdown output.
 * Fixes formatting quirks specific to how Jina extracts content from Twitter/X articles.
 *
 * These are Transform-layer functions (Layer 3) — pure text transformations, no I/O.
 */

const JUNK_LINE_PATTERNS = [
  /^!\[.*\]\(https:\/\/pbs\.twimg\.com\/amplify_video_thumb\/.+\)$/, // video thumbnails
  /^\d{1,2}:\d{2}$/, // orphaned video timestamps
];

/** Run all Jina post-processing steps in order. */
export function cleanJinaMarkdown(md: string): string {
  let content = fixCodeBlocks(md);
  content = filterJunkLines(content);
  content = injectSectionBreaksBeforeFileLists(content);
  content = restoreMissingSectionHeadings(content);
  return content;
}

/**
 * Fix code blocks where Jina puts the language identifier on a separate line
 * before the opening ```.
 */
export function fixCodeBlocks(md: string): string {
  return md.replace(
    /^(typescript|javascript|python|rust|go|java|bash|shell|json|yaml|html|css|markdown|sql|tsx|jsx|ts|js|rb|c|cpp|csharp|swift|kotlin|toml|xml|graphql)\s*\n\s*\n?```\s*$/gm,
    "```$1"
  );
}

/** Single-pass filter for lines that should be removed. */
export function filterJunkLines(md: string): string {
  return md
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !JUNK_LINE_PATTERNS.some((p) => p.test(trimmed));
    })
    .join("\n");
}

/**
 * Detect "* File: <path>" + "* Cost:" + "* When:" patterns that indicate
 * a new major section, and inject a heading derived from the file path.
 */
export function injectSectionBreaksBeforeFileLists(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fileMatch = trimmed.match(/^\*\s+Files?:\s+(.+)/);

    if (fileMatch) {
      let hasCost = false;
      let hasWhen = false;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const next = lines[j].trim();
        if (/^\*\s+Cost:/i.test(next)) hasCost = true;
        if (/^\*\s+When:/i.test(next)) hasWhen = true;
      }

      if (hasCost || hasWhen) {
        const filePath = fileMatch[1].trim();
        const sectionTitle = deriveSectionTitle(filePath);
        if (sectionTitle) {
          result.push("");
          result.push(`## ${sectionTitle}`);
          result.push("");
        }
      }
    }

    const standaloneFileMatch = trimmed.match(/^Files?:\s+(src\/.+)/);
    if (standaloneFileMatch && !trimmed.startsWith("*")) {
      const filePath = standaloneFileMatch[1].trim();
      const sectionTitle = deriveSectionTitle(filePath);
      if (sectionTitle) {
        result.push("");
        result.push(`## ${sectionTitle}`);
        result.push("");
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * Derive a human-readable section title from a source file path.
 */
export function deriveSectionTitle(filePath: string): string | null {
  // Known mappings — article-specific, will be removed when model can handle this
  const mappings: [RegExp, string][] = [
    [/toolResultStorage/i, "Layer 1: Tool Result Storage"],
    [/microCompact/i, "Layer 2: Microcompaction"],
    [/SessionMemory/i, "Layer 3: Session Memory"],
    [/compact\/compact/i, "Layer 4: Full Compaction"],
    [/extractMemories/i, "Layer 5: Auto Memory Extraction"],
    [/autoDream/i, "Layer 6: Dreaming"],
    [/forkedAgent|AgentTool|SendMessage/i, "Layer 7: Forked Agents & Communication"],
  ];

  for (const [pattern, title] of mappings) {
    if (pattern.test(filePath)) return title;
  }

  // Fallback: extract the last meaningful segment from the path
  const segments = filePath.replace(/\.(ts|js|tsx|jsx)$/, "").split("/");
  const last = segments[segments.length - 1];
  if (last) {
    const title = last
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());
    return title;
  }

  return null;
}

/**
 * Heuristically restore section headings that Jina may have stripped.
 */
export function restoreMissingSectionHeadings(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const prev = i > 0 ? lines[i - 1].trim() : "";
    const next = i < lines.length - 1 ? lines[i + 1].trim() : "";

    if (
      trimmed.length === 0 ||
      trimmed.length > 80 ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("!") ||
      (trimmed.startsWith("[") && trimmed.includes("](")) ||
      trimmed.startsWith("`") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("---") ||
      trimmed.startsWith("**") ||
      trimmed.startsWith("http") ||
      /^\d+\.?\s/.test(trimmed)
    ) {
      result.push(line);
      continue;
    }

    const prevBlank = i === 0 || prev === "";
    const nextBlank = next === "";
    if (!prevBlank || !nextBlank) {
      result.push(line);
      continue;
    }

    if (i + 2 >= lines.length || lines[i + 2].trim().length === 0) {
      result.push(line);
      continue;
    }

    const wordCount = trimmed.split(/\s+/).length;
    const looksLikeTitle =
      /^[A-Z]/.test(trimmed) &&
      !trimmed.endsWith(".") &&
      !trimmed.endsWith(",") &&
      !trimmed.endsWith(":") &&
      !trimmed.includes(", ") &&
      wordCount <= 8 &&
      !/\b(is|are|was|were|has|have|can|will|do|does|the .+ is)\b/i.test(trimmed);

    if (looksLikeTitle) {
      result.push(`## ${trimmed}`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}
