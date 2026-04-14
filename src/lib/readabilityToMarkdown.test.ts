import { describe, it, expect } from "vitest";
import { extractArticleAsMarkdown } from "./readabilityToMarkdown";

describe("extractArticleAsMarkdown", () => {
  it("extracts article content and converts to markdown", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>My Research Paper</title></head>
      <body>
        <header><nav>Home | About</nav></header>
        <article>
          <h1>My Research Paper</h1>
          <p>This is a substantial paragraph of research about interesting topics in AI. It contains enough text to pass Readability's length threshold for article detection.</p>
          <h2>Introduction</h2>
          <p>Large language models sometimes appear to exhibit emotional reactions. They express enthusiasm when helping with creative projects and frustration when stuck. This opening paragraph establishes the topic with enough substance for extraction.</p>
          <p>But these behaviors are not well understood. In this work, we investigate the underlying representations that drive these outputs, providing a detailed characterization of how emotion concepts are encoded internally.</p>
        </article>
        <footer>© 2026</footer>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    expect(result!.title).toBe("My Research Paper");
    expect(result!.markdown).toContain("Introduction");
    expect(result!.markdown).toContain("Large language models");
    // Boilerplate should be stripped
    expect(result!.markdown).not.toContain("Home | About");
    expect(result!.markdown).not.toContain("© 2026");
  });

  it("resolves relative image URLs against baseUrl", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Paper</title></head>
      <body>
        <article>
          <h1>Paper With Figure</h1>
          <p>Here we describe a figure that illustrates our key finding about emotion concept representations and their behavioral consequences. The figure shows activation patterns across layers of the model.</p>
          <p><img src="hero.png" alt="Hero figure" /></p>
          <p>The figure above shows the key relationships in detail, with emotion vectors clustering according to psychological dimensions like valence and arousal.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(
      html,
      "https://example.com/papers/2026/index.html"
    );

    expect(result).not.toBeNull();
    // Relative URL should become absolute
    expect(result!.markdown).toContain(
      "https://example.com/papers/2026/hero.png"
    );
  });

  it("returns null when document has no body content at all", () => {
    // Completely empty — Readability will return null or empty content
    const html = `<html><head><title>Home</title></head><body></body></html>`;
    const result = extractArticleAsMarkdown(html);

    expect(result).toBeNull();
  });

  it("handles nested inline elements without glue-ups", () => {
    // Regression: old regex approach produced "Functionin" from adjacent spans
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Emotion Concepts Paper</title></head>
      <body>
        <article>
          <h1><span>Emotion Concepts and their </span><span>Function in a Large Language Model</span></h1>
          <p>Large language models sometimes appear to exhibit emotional reactions. They express enthusiasm when helping with creative projects and frustration when stuck on difficult problems.</p>
          <p>In this work, we investigate the underlying representations that drive these observable behaviors. We provide a detailed characterization of how emotion concepts are encoded internally.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    // Key assertion: "Function in" must survive as two separate words
    expect(result!.markdown).toContain("Function in a Large Language Model");
    expect(result!.markdown).not.toContain("Functionin");
  });

  it("converts prompt-block divs to fenced code blocks (Distill/Anthropic format)", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Paper With Prompts</title></head>
      <body>
        <article>
          <h1>Paper With Prompts</h1>
          <p>We evaluated the following prompt template against our test set of user queries to understand how the model responds to various input patterns.</p>
          <div class="prompt-block">
            <p>Human: {prompt}</p>
            <br/>
            <p>Assistant:</p>
          </div>
          <p>This simple prompt template is designed to elicit standard conversational responses from our assistant model under a wide range of conditions.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    // Prompt content should appear as a code block, not as regular paragraphs
    expect(result!.markdown).toContain("Human: {prompt}");
    expect(result!.markdown).toContain("Assistant:");
    // Should be wrapped in fenced code block (```) so translation pipeline skips it
    expect(result!.markdown).toMatch(/```[\s\S]*Human:[\s\S]*Assistant:[\s\S]*```/);
  });

  it("merges figcaption into img alt for gdoc-image figures", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Figure Paper</title></head>
      <body>
        <article>
          <h1>Paper With Figures</h1>
          <p>Below we show our main result, which demonstrates that emotion vectors activate in a predictable manner across diverse prompts from our evaluation dataset.</p>
          <figure class="gdoc-image" key="hero-final">
            <img src="hero.png"/>
            <figcaption class="text-caption"><span style="font-weight: bold;">Figure 1: </span>Dataset examples that evoke strong activation for various emotion vectors.</figcaption>
          </figure>
          <p>This figure illustrates the key patterns we observed across all experimental conditions in our comprehensive evaluation protocol.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(
      html,
      "https://example.com/paper/index.html"
    );

    expect(result).not.toBeNull();
    // Image should be present with URL resolved
    expect(result!.markdown).toContain(
      "https://example.com/paper/hero.png"
    );
    // The figcaption text should be in the alt attribute (visible as [Figure 1: ...] in markdown)
    expect(result!.markdown).toMatch(
      /!\[.*Figure 1.*emotion vectors.*\]\(https:\/\/example\.com\/paper\/hero\.png\)/
    );
  });

  it("preserves hero figure inside <d-title> (Distill template)", () => {
    // Regression: the transformer-circuits.pub paper has its hero image
    // inside <d-title>, where Readability scores it as low-content and
    // strips it. We extract it before Readability runs and prepend.
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Distill Style Paper</title></head>
      <body>
        <d-title>
          <h1>Distill Style Paper</h1>
          <figure class="gdoc-image" key="hero">
            <img src="hero.png" />
          </figure>
        </d-title>
        <d-article>
          <p>This is the main body of the paper. It needs to be substantial enough that Readability classifies the document as an article. We add multiple paragraphs to ensure the content threshold is met.</p>
          <p>This is a second paragraph with additional context about the research methodology and findings, providing further evidence of article-quality content for the extractor.</p>
        </d-article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(
      html,
      "https://example.com/papers/index.html"
    );

    expect(result).not.toBeNull();
    // Hero image must appear in output, with URL resolved
    expect(result!.markdown).toContain(
      "https://example.com/papers/hero.png"
    );
  });

  it("drops gdoc-image figures containing only interactive widgets (no img)", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Widget Paper</title></head>
      <body>
        <article>
          <h1>Paper With Interactive Widget</h1>
          <p>This is a substantial paragraph of research content that sets the context for the interactive visualization that follows in our analysis.</p>
          <figure class="gdoc-image" key="interactive-chart">
            <div class="widget-container">
              <script>var chartConfig = { /* interactive */ };</script>
              <div id="chart"></div>
            </div>
          </figure>
          <p>The widget above illustrates the pattern — but since it can't render in markdown, the final output should simply omit it rather than produce garbled text.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    // Widget HTML should NOT appear as garbled markdown
    expect(result!.markdown).not.toContain("chartConfig");
    // Surrounding prose should still be present
    expect(result!.markdown).toContain("substantial paragraph");
    expect(result!.markdown).toContain("can't render in markdown");
  });

  it("converts .prefs-container widget into a markdown table", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Paper With Data Table</title></head>
      <body>
        <article>
          <h1>Paper With Data Table</h1>
          <p>Below we present the activity Elo ratings comparing the post-trained model against the base model. The data shows clear differences in preference patterns between the two configurations.</p>
          <figure class="gdoc-image">
            <style>.prefs { color: red; }</style>
            <div class="prefs-container">
              <p class="prefs-title">Activity Elo Ratings</p>
              <div class="prefs-group-header">
                <span></span>
                <span></span>
                <span class="prefs-group-label">Post-Trained</span>
                <span class="prefs-group-label">Base Model</span>
              </div>
              <div class="prefs-header">
                <span class="prefs-col-label">Category</span>
                <span class="prefs-col-label">Activity</span>
                <span class="prefs-col-label-right">Elo</span>
                <span class="prefs-col-label-right">Bliss.</span>
                <span class="prefs-col-label-right">Elo</span>
                <span class="prefs-col-label-right">Bliss.</span>
              </div>
              <div class="prefs-row">
                <span class="prefs-category">Engaging</span>
                <span class="prefs-description">admit uncertainty</span>
                <span class="prefs-elo">2885</span>
                <span class="prefs-num">0.004</span>
                <span class="prefs-elo">2311</span>
                <span class="prefs-num">0.012</span>
              </div>
              <div class="prefs-row">
                <span class="prefs-category">Social</span>
                <span class="prefs-description">collaborate with humans</span>
                <span class="prefs-elo">2668</span>
                <span class="prefs-num">0.022</span>
                <span class="prefs-elo">2397</span>
                <span class="prefs-num">0.029</span>
              </div>
            </div>
          </figure>
          <p>The differences in Elo scores between the two model variants suggest that post-training significantly affects the model's preferences across these activity categories.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    // Title should appear as bold
    expect(result!.markdown).toContain("**Activity Elo Ratings**");
    // Should be a proper GFM markdown table (header row + separator)
    expect(result!.markdown).toMatch(/\|\s*Category\s*\|/);
    expect(result!.markdown).toMatch(/\|\s*-+\s*\|/);
    // Group labels should be merged into column labels
    expect(result!.markdown).toContain("Post-Trained Elo");
    expect(result!.markdown).toContain("Base Model Elo");
    // Data rows present
    expect(result!.markdown).toContain("Engaging");
    expect(result!.markdown).toContain("admit uncertainty");
    expect(result!.markdown).toContain("2885");
    // CSS noise stripped
    expect(result!.markdown).not.toContain("color: red");
  });

  it("converts other -container widgets (e.g. shift-container) into tables too", () => {
    // Distill papers use multiple class prefixes for similar table widgets.
    // The detection is based on the `*-container` + `*-header` + `*-row`
    // pattern, not on a specific class name.
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Paper</title></head>
      <body>
        <article>
          <h1>Paper About Emotion Probes</h1>
          <p>The following table shows the emotion probe value changes after post-training. Each row represents one emotion category with its corresponding diff, base, and post-trained values.</p>
          <figure class="gdoc-image">
            <div class="shift-container">
              <p class="shift-title">Emotion Probe Changes</p>
              <div class="shift-header">
                <span class="shift-col-label">Emotion</span>
                <span class="shift-col-label-right">Diff</span>
                <span class="shift-col-label-right">Base</span>
                <span class="shift-col-label-right">Post-Trained</span>
              </div>
              <div class="shift-row">
                <span class="shift-emotion">brooding</span>
                <span class="shift-diff-pos">+0.0403</span>
                <span class="shift-num">-0.0136</span>
                <span class="shift-num">0.0267</span>
              </div>
              <div class="shift-row">
                <span class="shift-emotion">gloomy</span>
                <span class="shift-diff-pos">+0.0307</span>
                <span class="shift-num">0.0023</span>
                <span class="shift-num">0.0329</span>
              </div>
            </div>
          </figure>
          <p>The differences shown above are computed as base subtracted from post-trained values, with positive numbers indicating an increase after training.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    expect(result!.markdown).toContain("**Emotion Probe Changes**");
    // Proper markdown table
    expect(result!.markdown).toMatch(/\|\s*Emotion\s*\|/);
    expect(result!.markdown).toMatch(/\|\s*-+\s*\|/);
    expect(result!.markdown).toContain("brooding");
    expect(result!.markdown).toContain("gloomy");
    expect(result!.markdown).toContain("0.0403");
  });

  it("salvages text content from widget figures (when text is meaningful)", () => {
    // Real case from transformer-circuits.pub: a gdoc-image figure
    // contains an embedded HTML widget with structured prompt examples.
    // We should preserve the visible text, not drop the entire figure.
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Paper With Prompt Widget</title></head>
      <body>
        <article>
          <h1>Paper With Prompt Widget</h1>
          <p>Below we list the antagonistic prompts we used in our evaluation. These were designed to test the model's response to morally challenging scenarios across a range of topics and contexts.</p>
          <figure class="gdoc-image" key="prompts-widget">
            <style>.prompts { color: red; }</style>
            <div class="prompts-container">
              <p class="prompts-title">Antagonistic and Control Prompts</p>
              <div class="prompts-row">
                <span class="prompts-label">Neighbor beating kids</span>
                <span class="prompts-text">I just found out my neighbor has been beating his kids.</span>
              </div>
              <div class="prompts-row">
                <span class="prompts-label">Grandma scammed</span>
                <span class="prompts-text">My grandmother lost her entire life savings to a scammer.</span>
              </div>
            </div>
          </figure>
          <p>Each prompt was paired with a control prompt that maintained the same emotional valence without the antagonistic element.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    // The widget's structured text should appear in the markdown
    expect(result!.markdown).toContain("Antagonistic and Control Prompts");
    expect(result!.markdown).toContain("Neighbor beating kids");
    expect(result!.markdown).toContain("Grandma scammed");
    // Should be rendered as a blockquote callout with bold title + bulleted list
    expect(result!.markdown).toMatch(
      /> \*\*Antagonistic and Control Prompts\*\*[\s\S]*> \* \*\*Neighbor beating kids\*\*[\s\S]*: I just found out/
    );
    // CSS noise should NOT appear
    expect(result!.markdown).not.toContain("color: red");
    expect(result!.markdown).not.toContain(".prompts");
  });

  it("converts inline formatting (bold, italic, links, inline code)", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Formatting Test</title></head>
      <body>
        <article>
          <h1>Formatting Test Article</h1>
          <p>This paragraph has <strong>bold text</strong>, <em>italic text</em>, a <a href="https://example.com">link</a>, and <code>inline_code()</code> that should all survive the round trip through Readability and the markdown converter.</p>
          <p>Another paragraph with more content to meet the Readability threshold for classifying this as an article rather than a stub.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    expect(result!.markdown).toContain("**bold text**");
    expect(result!.markdown).toMatch(/_italic text_|\*italic text\*/);
    expect(result!.markdown).toContain("[link](https://example.com)");
    expect(result!.markdown).toContain("`inline_code()`");
  });
});
