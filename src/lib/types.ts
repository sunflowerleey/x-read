/** Source platform of the fetched content */
export type ContentSource = "twitter" | "webpage";

/** Shared data shape for all fetched content */
export interface ContentData {
  source: ContentSource;
  title: string;
  url: string;
  language: string;
  /** Author/site name */
  authorName: string;
  /** Handle or domain */
  authorHandle: string;
  authorAvatar: string;
  createdAt: string;

  // Twitter-specific (optional)
  likes?: number;
  retweets?: number;
  replies?: number;
  media?: { type: string; url: string }[];
  quotedTweet?: {
    text: string;
    authorName: string;
    authorHandle: string;
  };
  isArticle?: boolean;
  articleTitle?: string;
  articleSubtitle?: string;
}
