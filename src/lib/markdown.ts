import { ContentData } from "./types";

function appendFooter(lines: string[], content: ContentData): void {
  lines.push("---");
  lines.push("");
  if (content.source === "twitter") {
    lines.push(`**Author:** ${content.authorName} (@${content.authorHandle})`);
    lines.push("");
    lines.push(`**Date:** ${content.createdAt}`);
    lines.push("");
    lines.push(
      `**Likes:** ${(content.likes ?? 0).toLocaleString("en-US")} | **Retweets:** ${(content.retweets ?? 0).toLocaleString("en-US")} | **Replies:** ${(content.replies ?? 0).toLocaleString("en-US")}`
    );
  } else {
    lines.push(`**Source:** ${content.authorName}`);
    if (content.createdAt) {
      lines.push("");
      lines.push(`**Date:** ${content.createdAt}`);
    }
  }
  lines.push("");
  lines.push(`[View Original](${content.url})`);
}

export function tweetToMarkdown(content: ContentData): string {
  const lines: string[] = [];

  lines.push(`# Tweet by @${content.authorHandle}`);
  lines.push("");
  // For regular tweets, content.title may be "Tweet by @handle", use articleTitle if available
  lines.push("");

  if (content.quotedTweet) {
    lines.push(
      `> **@${content.quotedTweet.authorHandle}** (${content.quotedTweet.authorName}):`
    );
    for (const line of content.quotedTweet.text.split("\n")) {
      lines.push(`> ${line}`);
    }
    lines.push("");
  }

  if (content.media && content.media.length > 0) {
    lines.push("## Media");
    lines.push("");
    for (const m of content.media) {
      if (m.type === "photo") {
        lines.push(`![image](${m.url})`);
      } else {
        lines.push(`[${m.type}](${m.url})`);
      }
    }
    lines.push("");
  }

  appendFooter(lines, content);
  return lines.join("\n");
}

export function articleToMarkdown(
  articleContent: string,
  content: ContentData
): string {
  const lines: string[] = [];

  if (content.articleTitle) {
    const firstLine = articleContent.split("\n")[0].trim();
    const titleAlreadyPresent =
      firstLine.startsWith("# ") ||
      firstLine.toLowerCase().includes(content.articleTitle.toLowerCase().slice(0, 30));
    if (!titleAlreadyPresent) {
      lines.push(`# ${content.articleTitle}`);
      lines.push("");
    }
  }

  if (content.articleSubtitle) {
    const contentStart = articleContent.slice(0, 300).toLowerCase();
    if (!contentStart.includes(content.articleSubtitle.toLowerCase().slice(0, 30))) {
      lines.push(`### ${content.articleSubtitle}`);
      lines.push("");
    }
  }

  lines.push(articleContent);
  lines.push("");
  appendFooter(lines, content);
  return lines.join("\n");
}

export function webpageToMarkdown(
  rawMarkdown: string,
  content: ContentData
): string {
  const lines: string[] = [];

  // Add title if not already present in content
  const firstLine = rawMarkdown.split("\n")[0]?.trim() || "";
  if (!firstLine.startsWith("# ") && content.title) {
    lines.push(`# ${content.title}`);
    lines.push("");
  }

  lines.push(rawMarkdown);
  lines.push("");
  appendFooter(lines, content);
  return lines.join("\n");
}
