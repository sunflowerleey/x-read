export interface TweetData {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  createdAt: string;
  language: string;
  likes: number;
  retweets: number;
  replies: number;
  media: { type: string; url: string }[];
  quotedTweet?: {
    text: string;
    authorName: string;
    authorHandle: string;
  };
  isArticle: boolean;
  articleTitle?: string;
  articleSubtitle?: string;
}

export interface FetchTweetResponse {
  tweet: TweetData;
  markdown: string;
}
