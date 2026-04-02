import { TweetData } from "./types";

function appendFooter(lines: string[], tweet: TweetData): void {
  lines.push("---");
  lines.push("");
  lines.push(`**Author:** ${tweet.authorName} (@${tweet.authorHandle})`);
  lines.push("");
  lines.push(`**Date:** ${tweet.createdAt}`);
  lines.push("");
  lines.push(
    `**Likes:** ${tweet.likes.toLocaleString("en-US")} | **Retweets:** ${tweet.retweets.toLocaleString("en-US")} | **Replies:** ${tweet.replies.toLocaleString("en-US")}`
  );
  lines.push("");
  lines.push(
    `[View Original](https://x.com/${tweet.authorHandle}/status/${tweet.id})`
  );
}

export function tweetToMarkdown(tweet: TweetData): string {
  const lines: string[] = [];

  lines.push(`# Tweet by @${tweet.authorHandle}`);
  lines.push("");
  lines.push(tweet.text);
  lines.push("");

  if (tweet.quotedTweet) {
    lines.push(
      `> **@${tweet.quotedTweet.authorHandle}** (${tweet.quotedTweet.authorName}):`
    );
    for (const line of tweet.quotedTweet.text.split("\n")) {
      lines.push(`> ${line}`);
    }
    lines.push("");
  }

  if (tweet.media.length > 0) {
    lines.push("## Media");
    lines.push("");
    for (const m of tweet.media) {
      if (m.type === "photo") {
        lines.push(`![image](${m.url})`);
      } else {
        lines.push(`[${m.type}](${m.url})`);
      }
    }
    lines.push("");
  }

  appendFooter(lines, tweet);
  return lines.join("\n");
}

export function articleToMarkdown(
  articleContent: string,
  tweet: TweetData
): string {
  const lines: string[] = [];

  if (tweet.articleTitle) {
    const firstLine = articleContent.split("\n")[0].trim();
    const titleAlreadyPresent =
      firstLine.startsWith("# ") ||
      firstLine.toLowerCase().includes(tweet.articleTitle.toLowerCase().slice(0, 30));
    if (!titleAlreadyPresent) {
      lines.push(`# ${tweet.articleTitle}`);
      lines.push("");
    }
  }

  if (tweet.articleSubtitle) {
    const contentStart = articleContent.slice(0, 300).toLowerCase();
    if (!contentStart.includes(tweet.articleSubtitle.toLowerCase().slice(0, 30))) {
      lines.push(`### ${tweet.articleSubtitle}`);
      lines.push("");
    }
  }

  lines.push(articleContent);
  lines.push("");
  appendFooter(lines, tweet);
  return lines.join("\n");
}
