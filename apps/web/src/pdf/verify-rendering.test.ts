/**
 * End-to-end verification tests for PDF rendering flow
 *
 * Verifies:
 * 1. markdownToHtml() output contains @font-face rules with data:font/woff2;base64 src URIs
 * 2. markdownToHtml() output contains all print CSS rules
 * 3. font-family names are exactly 'Source Serif 4 Variable' and 'DM Sans Variable'
 * 4. weight ranges are preserved (200-900 for Source Serif 4, 100-900 for DM Sans)
 * 5. RenderPdfButton is importable and the component tree compiles
 */

import { describe, it, expect } from "vite-plus/test";
import { markdownToHtml } from "./markdownToHtml.ts";

describe("PDF Rendering Flow - End-to-End Verification", () => {
  const sampleMarkdown = `# Test Document

This is a **test** document with various elements:

## Features

- Lists
- Tables
- Code blocks

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

\`\`\`javascript
const test = "code block";
\`\`\`
`;

  const html = markdownToHtml(sampleMarkdown);

  describe("Font Embedding", () => {
    it("contains @font-face rules", () => {
      expect(html).toContain("@font-face");
    });

    it("contains data:font/woff2;base64 src URIs for DM Sans", () => {
      expect(html).toMatch(/url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)\s+format\('woff2'\)/);
      expect(html).toContain("DM Sans Variable");
    });

    it("contains data:font/woff2;base64 src URIs for Source Serif 4", () => {
      expect(html).toMatch(/url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)\s+format\('woff2'\)/);
      expect(html).toContain("Source Serif 4 Variable");
    });

    it("has exactly 'DM Sans Variable' as font-family name", () => {
      const dmSansFontFace = html.match(/@font-face\s*{[^}]*font-family:\s*'DM Sans Variable'[^}]*}/s);
      expect(dmSansFontFace).toBeTruthy();
    });

    it("has exactly 'Source Serif 4 Variable' as font-family name", () => {
      const sourceSerifFontFace = html.match(/@font-face\s*{[^}]*font-family:\s*'Source Serif 4 Variable'[^}]*}/s);
      expect(sourceSerifFontFace).toBeTruthy();
    });

    it("preserves weight range 100-900 for DM Sans", () => {
      const dmSansFontFace = html.match(/@font-face\s*{[^}]*font-family:\s*'DM Sans Variable'[^}]*}/s);
      expect(dmSansFontFace?.[0]).toContain("font-weight: 100 900");
    });

    it("preserves weight range 200-900 for Source Serif 4", () => {
      const sourceSerifFontFace = html.match(/@font-face\s*{[^}]*font-family:\s*'Source Serif 4 Variable'[^}]*}/s);
      expect(sourceSerifFontFace?.[0]).toContain("font-weight: 200 900");
    });

    it("includes system font fallbacks after base64 URI", () => {
      // DM Sans should have fallbacks like Inter, Roboto, system-ui
      expect(html).toMatch(/url\(data:font\/woff2;base64,[^)]+\)\s+format\('woff2'\),\s*local\(/);
    });
  });

  describe("Print CSS Rules", () => {
    it("contains A4 page size setup", () => {
      expect(html).toContain("@page");
      expect(html).toContain("size: A4");
    });

    it("contains page margins (2cm/2.5cm)", () => {
      expect(html).toMatch(/margin:\s*2cm\s+2\.5cm/);
    });

    it("sets Source Serif 4 Variable as body font-family", () => {
      expect(html).toMatch(/body\s*{[^}]*font-family:\s*'Source Serif 4 Variable'/s);
    });

    it("sets DM Sans Variable for headings font-family", () => {
      expect(html).toMatch(/h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*{[^}]*font-family:\s*'DM Sans Variable'/s);
    });

    it("includes table styling rules", () => {
      expect(html).toContain("table");
      expect(html).toMatch(/border-collapse/i);
    });

    it("includes typography rules for paragraphs", () => {
      expect(html).toMatch(/p\s*{/);
    });

    it("includes code block styling", () => {
      expect(html).toMatch(/code|pre/);
    });

    it("includes page break controls", () => {
      expect(html).toMatch(/page-break|break-/);
    });
  });

  describe("HTML Structure", () => {
    it("generates complete HTML5 document", () => {
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html lang=\"en\">");
      expect(html).toContain("</html>");
    });

    it("includes charset and viewport meta tags", () => {
      expect(html).toContain("<meta charset=\"UTF-8\">");
      expect(html).toContain("<meta name=\"viewport\"");
    });

    it("embeds styles in <style> tag", () => {
      expect(html).toContain("<style>");
      expect(html).toContain("</style>");
    });

    it("includes body content", () => {
      expect(html).toContain("<body>");
      expect(html).toContain("</body>");
      expect(html).toContain("Test Document");
    });

    it("converts markdown to HTML", () => {
      expect(html).toContain("<h1>");
      expect(html).toContain("<h2>");
      expect(html).toContain("Test Document");
      expect(html).toContain("Features");
    });
  });

  describe("Component Importability", () => {
    it("can import RenderPdfButton", async () => {
      const module = await import("~/components/pdf/RenderPdfButton");
      expect(module.RenderPdfButton).toBeDefined();
      expect(typeof module.RenderPdfButton).toBe("function");
    });

    it("can import markdownToHtml", () => {
      expect(markdownToHtml).toBeDefined();
      expect(typeof markdownToHtml).toBe("function");
    });

    it("can import getFontFaces from fonts module", async () => {
      const module = await import("./fonts.ts");
      expect(module.getFontFaces).toBeDefined();
      expect(typeof module.getFontFaces).toBe("function");
    });
  });

  describe("Data URI Embedding", () => {
    it("embeds large base64 data (fonts add ~150KB+)", () => {
      // Base64 encoded woff2 fonts should be substantial
      // Each font is roughly 70-80KB, so we expect > 100KB total in base64
      const base64Matches = html.match(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g);
      expect(base64Matches).toBeTruthy();
      expect(base64Matches!.length).toBeGreaterThanOrEqual(2); // At least 2 fonts

      // Check that each base64 string is substantial (> 50000 chars for ~37.5KB binary)
      base64Matches!.forEach((match) => {
        const base64Data = match.split(",")[1];
        expect(base64Data).toBeDefined();
        expect(base64Data!.length).toBeGreaterThan(50000);
      });
    });

    it("produces HTML suitable for data: URI loading", () => {
      // Should not contain external file references
      expect(html).not.toMatch(/src=["'][^"']*\.woff2["']/);
      expect(html).not.toMatch(/href=["'][^"']*\.css["']/);

      // All resources should be inlined
      expect(html).not.toContain("<link");
      expect(html).not.toMatch(/<script[^>]*src=/);
    });
  });
});
