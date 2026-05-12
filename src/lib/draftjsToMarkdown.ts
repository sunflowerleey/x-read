import type {
  ArticleMediaEntity,
  DraftJsBlock,
  DraftJsEntity,
  DraftJsEntityMapEntry,
} from "./types";

const INLINE_MARK: Record<string, string> = {
  bold: "**",
  italic: "*",
  code: "`",
  strikethrough: "~~",
};

const HEADER_PREFIX: Record<string, string> = {
  "header-one": "# ",
  "header-two": "## ",
  "header-three": "### ",
  "header-four": "#### ",
  "header-five": "##### ",
  "header-six": "###### ",
};

function readUrl(entity: DraftJsEntity): string | null {
  const url = entity.data?.url;
  return typeof url === "string" ? url : null;
}

function renderInline(
  block: DraftJsBlock,
  entities: Map<string, DraftJsEntity>,
): string {
  const text = block.text;
  if (text.length === 0) return "";

  const links = new Map<number, { end: number; url: string }>();
  for (const r of block.entityRanges ?? []) {
    const e = entities.get(String(r.key));
    if (!e || e.type !== "LINK") continue;
    const url = readUrl(e);
    if (url) links.set(r.offset, { end: r.offset + r.length, url });
  }

  const stylesAt = (i: number): string[] => {
    const set = new Set<string>();
    for (const s of block.inlineStyleRanges ?? []) {
      if (i >= s.offset && i < s.offset + s.length) {
        const k = s.style.toLowerCase();
        if (INLINE_MARK[k]) set.add(k);
      }
    }
    return [...set].sort();
  };

  let out = "";
  const openStyles: string[] = [];
  let activeLink: { end: number; url: string } | null = null;
  let linkBuf = "";

  const append = (s: string) => {
    if (activeLink) linkBuf += s;
    else out += s;
  };
  const closeAllStyles = () => {
    while (openStyles.length > 0) {
      append(INLINE_MARK[openStyles.pop()!]);
    }
  };
  const flushLink = () => {
    if (!activeLink) return;
    closeAllStyles();
    out += `[${linkBuf}](${activeLink.url})`;
    linkBuf = "";
    activeLink = null;
  };

  for (let i = 0; i < text.length; i++) {
    if (activeLink && i === activeLink.end) flushLink();
    const newLink = links.get(i);
    if (newLink && !activeLink) {
      closeAllStyles();
      activeLink = newLink;
    }

    const want = stylesAt(i);
    if (want.join(",") !== openStyles.join(",")) {
      closeAllStyles();
      for (const k of want) {
        openStyles.push(k);
        append(INLINE_MARK[k]);
      }
    }

    append(text[i]);
  }
  flushLink();
  closeAllStyles();
  return out;
}

function renderAtomic(
  block: DraftJsBlock,
  entities: Map<string, DraftJsEntity>,
  media: Map<string, ArticleMediaEntity>,
): string {
  const range = block.entityRanges?.[0];
  if (!range) return "";
  const entity = entities.get(String(range.key));
  if (!entity) return "";

  if (entity.type === "MARKDOWN") {
    const md = entity.data?.markdown;
    return typeof md === "string" ? md : "";
  }
  if (entity.type === "MEDIA") {
    const items = entity.data?.mediaItems;
    if (!Array.isArray(items)) return "";
    const urls: string[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const mediaId = (item as { mediaId?: unknown }).mediaId;
      if (typeof mediaId !== "string") continue;
      const m = media.get(mediaId);
      const url = m?.media_info?.original_img_url;
      if (typeof url === "string") urls.push(url);
    }
    return urls.map((u) => `![](${u})`).join("\n\n");
  }
  return "";
}

function renderBlockquote(inline: string): string {
  return inline
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/** Convert a FxTwitter article (DraftJS blocks + entity map + media entities)
 *  into Markdown.
 *
 *  Supported block types: unstyled, header-one..six, unordered-list-item,
 *  ordered-list-item, blockquote, code-block, atomic.
 *
 *  Supported inline styles: bold, italic, code, strikethrough (matched
 *  case-insensitively because FxTwitter uses TitleCase while spec uses
 *  UPPERCASE).
 *
 *  Supported entity types: LINK (wraps inline text), MEDIA (atomic block —
 *  resolved via mediaEntities), MARKDOWN (atomic block — emit verbatim, used
 *  for embedded code blocks). */
export function draftjsToMarkdown(
  blocks: DraftJsBlock[],
  entityMap: DraftJsEntityMapEntry[],
  mediaEntities: ArticleMediaEntity[],
): string {
  const entities = new Map<string, DraftJsEntity>();
  for (const e of entityMap) entities.set(e.key, e.value);
  const media = new Map<string, ArticleMediaEntity>();
  for (const m of mediaEntities) media.set(m.media_id, m);

  const parts: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];

    if (b.type === "unordered-list-item" || b.type === "ordered-list-item") {
      const listType = b.type;
      const items: string[] = [];
      let n = 1;
      while (i < blocks.length && blocks[i].type === listType) {
        const cur = blocks[i];
        const indent = "  ".repeat(cur.depth ?? 0);
        const marker = listType === "ordered-list-item" ? `${n}.` : "-";
        items.push(`${indent}${marker} ${renderInline(cur, entities)}`);
        n++;
        i++;
      }
      parts.push(items.join("\n"));
      continue;
    }

    if (b.type === "atomic") {
      const out = renderAtomic(b, entities, media);
      if (out.length > 0) parts.push(out);
      i++;
      continue;
    }

    if (b.type === "code-block") {
      parts.push("```\n" + b.text + "\n```");
      i++;
      continue;
    }

    if (b.type === "blockquote") {
      parts.push(renderBlockquote(renderInline(b, entities)));
      i++;
      continue;
    }

    const prefix = HEADER_PREFIX[b.type] ?? "";
    parts.push(prefix + renderInline(b, entities));
    i++;
  }

  return parts.filter((p) => p.length > 0).join("\n\n");
}
