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
  /** Tweet text body (Twitter only) */
  text?: string;
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
  /** Raw article body from FxTwitter (DraftJS blocks). When present, prefer
   *  this over scraping x.com because x.com requires login. */
  articleBlocks?: DraftJsBlock[];
  articleEntityMap?: DraftJsEntityMapEntry[];
  articleMediaEntities?: ArticleMediaEntity[];
}

/** DraftJS inline style range — applies a style (Bold, Italic, …) to a
 *  contiguous run of characters in a block's text. */
export interface DraftJsInlineStyleRange {
  offset: number;
  length: number;
  style: string;
}

/** DraftJS entity range — binds a contiguous run of characters to an entity
 *  in the entity map (link target, media id, etc.). */
export interface DraftJsEntityRange {
  offset: number;
  length: number;
  key: number;
}

export interface DraftJsBlock {
  key: string;
  text: string;
  type: string;
  depth?: number;
  inlineStyleRanges: DraftJsInlineStyleRange[];
  entityRanges: DraftJsEntityRange[];
  data?: Record<string, unknown>;
}

export interface DraftJsEntity {
  type: string;
  mutability?: string;
  data: Record<string, unknown>;
}

export interface DraftJsEntityMapEntry {
  key: string;
  value: DraftJsEntity;
}

export interface ArticleMediaEntity {
  media_id: string;
  media_key?: string;
  media_info?: {
    original_img_url?: string;
    original_img_height?: number;
    original_img_width?: number;
  };
}
