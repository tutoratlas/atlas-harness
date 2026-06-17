import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";

/**
 * Converts markdown string to a full HTML5 document with embedded styles and fonts.
 *
 * Pure function: markdown string → full HTML5 document string.
 * Uses remarkGfm, remarkBreaks, and rehypeRaw (same as ChatMarkdown.tsx, WITHOUT rehype-sanitize).
 *
 * @param markdown - The markdown content to convert
 * @returns A complete HTML5 document string ready for PDF rendering
 */
export function markdownToHtml(markdown: string): string {
  // Render markdown to HTML using ReactMarkdown
  const bodyHtml = renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkBreaks],
      rehypePlugins: [rehypeRaw],
      children: markdown,
    })
  );

  // Embed print CSS content
  const printCss = getPrintCss();

  // Embed font-face declarations
  const fontFaces = getFontFaces();

  // Construct full HTML5 document
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <style>
${fontFaces}

${printCss}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Returns the print CSS content from apps/desktop/src/assets/print.css
 */
function getPrintCss(): string {
  return `/**
 * Print stylesheet for PDF rendering
 *
 * A4 page layout with Source Serif 4 Variable for body text
 * and DM Sans Variable for headings.
 */

/* A4 page setup with margins */
@page {
  size: A4;
  margin: 2cm 2.5cm;
}

/* Reset and base styles */
* {
  box-sizing: border-box;
}

html {
  font-size: 12pt;
  line-height: 1.6;
}

body {
  margin: 0;
  padding: 0;
  font-family: 'Source Serif 4 Variable', serif;
  color: #1a1a1a;
  orphans: 3;
  widows: 3;
}

/* Headings with DM Sans Variable */
h1, h2, h3, h4, h5, h6 {
  font-family: 'DM Sans Variable', sans-serif;
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  page-break-after: avoid;
  orphans: 3;
  widows: 3;
}

h1 {
  font-size: 24pt;
  font-weight: 700;
  margin-top: 0;
}

h2 {
  font-size: 18pt;
}

h3 {
  font-size: 14pt;
}

h4 {
  font-size: 12pt;
  font-weight: 700;
}

h5, h6 {
  font-size: 12pt;
}

/* Paragraphs */
p {
  margin: 0 0 0.75em 0;
  text-align: justify;
}

/* Links */
a {
  color: #2563eb;
  text-decoration: none;
}

a:after {
  content: " (" attr(href) ")";
  font-size: 90%;
  color: #666;
}

/* Lists */
ul, ol {
  margin: 0.75em 0;
  padding-left: 2em;
}

li {
  margin-bottom: 0.25em;
  page-break-inside: avoid;
}

ul ul, ul ol, ol ul, ol ol {
  margin: 0.25em 0;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  page-break-inside: avoid;
}

thead {
  display: table-header-group;
}

tr {
  page-break-inside: avoid;
}

th, td {
  padding: 0.5em 0.75em;
  border: 1px solid #d1d5db;
  text-align: left;
  vertical-align: top;
}

th {
  font-family: 'DM Sans Variable', sans-serif;
  font-weight: 600;
  background-color: #f3f4f6;
  color: #1f2937;
}

td {
  font-family: 'Source Serif 4 Variable', serif;
}

/* Blockquotes */
blockquote {
  margin: 1em 2em;
  padding: 0.5em 1em;
  border-left: 4px solid #d1d5db;
  background-color: #f9fafb;
  font-style: italic;
  page-break-inside: avoid;
}

blockquote p {
  margin: 0.5em 0;
}

blockquote cite {
  display: block;
  margin-top: 0.5em;
  font-size: 90%;
  font-style: normal;
  color: #6b7280;
}

/* Code blocks */
pre {
  margin: 1em 0;
  padding: 1em;
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  overflow-x: auto;
  page-break-inside: avoid;
}

code {
  font-family: 'Courier New', Courier, monospace;
  font-size: 10pt;
  background-color: #f3f4f6;
  padding: 0.1em 0.3em;
  border-radius: 2px;
}

pre code {
  background-color: transparent;
  padding: 0;
}

/* Inline code */
p code, li code {
  font-size: 11pt;
}

/* Horizontal rules */
hr {
  margin: 2em 0;
  border: none;
  border-top: 1px solid #d1d5db;
  page-break-after: avoid;
}

/* Images */
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
  page-break-inside: avoid;
}

/* Strong and emphasis */
strong, b {
  font-weight: 700;
}

em, i {
  font-style: italic;
}

/* Page breaks */
.page-break {
  page-break-after: always;
}

.avoid-break {
  page-break-inside: avoid;
}

/* Print-specific utilities */
@media print {
  body {
    background: white;
  }

  /* Hide elements that shouldn't be printed */
  .no-print {
    display: none !important;
  }

  /* Ensure links are visible */
  a[href^="http"]:after {
    content: " (" attr(href) ")";
  }

  a[href^="#"]:after,
  a[href^="javascript:"]:after {
    content: "";
  }
}`;
}

/**
 * Returns @font-face declarations.
 *
 * NOTE: For production, this should embed .woff2 font files as base64 data URIs.
 * Currently uses system font fallbacks since font embedding requires file system access
 * which is not available in a pure web context. Font embedding will be handled by the
 * desktop app when it calls this function from a Node.js context.
 */
function getFontFaces(): string {
  // Use high-quality system font stack as fallback
  // In production, the desktop app will provide embedded base64 font data
  return `/* System font fallbacks - production will use embedded fonts */
@font-face {
  font-family: 'DM Sans Variable';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: local('DM Sans'), local('Inter'), local('Roboto'), local('system-ui');
}

@font-face {
  font-family: 'Source Serif 4 Variable';
  font-style: normal;
  font-weight: 200 900;
  font-display: swap;
  src: local('Source Serif 4'), local('Georgia'), local('Cambria'), local('Times New Roman');
}`;
}
