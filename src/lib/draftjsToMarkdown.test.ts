import { describe, expect, it } from "vitest";
import { draftjsToMarkdown } from "./draftjsToMarkdown";
import type {
  ArticleMediaEntity,
  DraftJsBlock,
  DraftJsEntityMapEntry,
} from "./types";

function block(b: Partial<DraftJsBlock> & { type: string; text: string }): DraftJsBlock {
  return {
    key: "x",
    inlineStyleRanges: [],
    entityRanges: [],
    ...b,
  };
}

describe("draftjsToMarkdown", () => {
  it("renders an unstyled paragraph", () => {
    const md = draftjsToMarkdown(
      [block({ type: "unstyled", text: "Hello world." })],
      [],
      [],
    );
    expect(md).toBe("Hello world.");
  });

  it("renders headers up to h6", () => {
    const md = draftjsToMarkdown(
      [
        block({ type: "header-one", text: "H1" }),
        block({ type: "header-two", text: "H2" }),
        block({ type: "header-three", text: "H3" }),
        block({ type: "header-four", text: "H4" }),
        block({ type: "header-five", text: "H5" }),
        block({ type: "header-six", text: "H6" }),
      ],
      [],
      [],
    );
    expect(md).toBe("# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6");
  });

  it("renders bold and italic inline styles (TitleCase)", () => {
    const md = draftjsToMarkdown(
      [
        block({
          type: "unstyled",
          text: "Hello bold and italic world.",
          inlineStyleRanges: [
            { offset: 6, length: 4, style: "Bold" },
            { offset: 15, length: 6, style: "Italic" },
          ],
        }),
      ],
      [],
      [],
    );
    expect(md).toBe("Hello **bold** and *italic* world.");
  });

  it("treats inline styles case-insensitively (UPPERCASE)", () => {
    const md = draftjsToMarkdown(
      [
        block({
          type: "unstyled",
          text: "x",
          inlineStyleRanges: [{ offset: 0, length: 1, style: "BOLD" }],
        }),
      ],
      [],
      [],
    );
    expect(md).toBe("**x**");
  });

  it("wraps LINK entity ranges as markdown links", () => {
    const md = draftjsToMarkdown(
      [
        block({
          type: "unstyled",
          text: "Visit Telegram now",
          entityRanges: [{ offset: 6, length: 8, key: 0 }],
        }),
      ],
      [{ key: "0", value: { type: "LINK", data: { url: "https://t.me/x" } } }],
      [],
    );
    expect(md).toBe("Visit [Telegram](https://t.me/x) now");
  });

  it("groups consecutive unordered-list-items", () => {
    const md = draftjsToMarkdown(
      [
        block({ type: "unordered-list-item", text: "one" }),
        block({ type: "unordered-list-item", text: "two" }),
        block({ type: "unstyled", text: "after" }),
      ],
      [],
      [],
    );
    expect(md).toBe("- one\n- two\n\nafter");
  });

  it("groups consecutive ordered-list-items with incrementing numbers", () => {
    const md = draftjsToMarkdown(
      [
        block({ type: "ordered-list-item", text: "first" }),
        block({ type: "ordered-list-item", text: "second" }),
      ],
      [],
      [],
    );
    expect(md).toBe("1. first\n2. second");
  });

  it("indents nested list items by depth", () => {
    const md = draftjsToMarkdown(
      [
        block({ type: "unordered-list-item", text: "top", depth: 0 }),
        block({ type: "unordered-list-item", text: "nested", depth: 1 }),
      ],
      [],
      [],
    );
    expect(md).toBe("- top\n  - nested");
  });

  it("renders blockquotes with leading > on each line", () => {
    const md = draftjsToMarkdown(
      [block({ type: "blockquote", text: "quoted" })],
      [],
      [],
    );
    expect(md).toBe("> quoted");
  });

  it("renders code-block as a fenced code block", () => {
    const md = draftjsToMarkdown(
      [block({ type: "code-block", text: "const x = 1" })],
      [],
      [],
    );
    expect(md).toBe("```\nconst x = 1\n```");
  });

  it("resolves atomic MEDIA entities via media_entities", () => {
    const entityMap: DraftJsEntityMapEntry[] = [
      {
        key: "0",
        value: {
          type: "MEDIA",
          data: { mediaItems: [{ mediaId: "999" }] },
        },
      },
    ];
    const media: ArticleMediaEntity[] = [
      {
        media_id: "999",
        media_info: { original_img_url: "https://pbs.twimg.com/media/x.jpg" },
      },
    ];
    const md = draftjsToMarkdown(
      [
        block({
          type: "atomic",
          text: " ",
          entityRanges: [{ offset: 0, length: 1, key: 0 }],
        }),
      ],
      entityMap,
      media,
    );
    expect(md).toBe("![](https://pbs.twimg.com/media/x.jpg)");
  });

  it("emits atomic MARKDOWN entity content verbatim", () => {
    const md = draftjsToMarkdown(
      [
        block({
          type: "atomic",
          text: " ",
          entityRanges: [{ offset: 0, length: 1, key: 0 }],
        }),
      ],
      [
        {
          key: "0",
          value: {
            type: "MARKDOWN",
            data: { markdown: "```\nfoo\n```" },
          },
        },
      ],
      [],
    );
    expect(md).toBe("```\nfoo\n```");
  });

  it("skips atomic blocks whose entity cannot be resolved", () => {
    const md = draftjsToMarkdown(
      [
        block({
          type: "atomic",
          text: " ",
          entityRanges: [{ offset: 0, length: 1, key: 99 }],
        }),
        block({ type: "unstyled", text: "after" }),
      ],
      [],
      [],
    );
    expect(md).toBe("after");
  });

  it("renders an empty input as an empty string", () => {
    expect(draftjsToMarkdown([], [], [])).toBe("");
  });

  it("handles a bold range that overlaps a link", () => {
    const md = draftjsToMarkdown(
      [
        block({
          type: "unstyled",
          text: "click here please",
          inlineStyleRanges: [{ offset: 6, length: 4, style: "Bold" }],
          entityRanges: [{ offset: 6, length: 4, key: 0 }],
        }),
      ],
      [{ key: "0", value: { type: "LINK", data: { url: "https://e.com" } } }],
      [],
    );
    expect(md).toBe("click [**here**](https://e.com) please");
  });
});
