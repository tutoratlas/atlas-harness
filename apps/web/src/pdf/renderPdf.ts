import type { DesktopBridge } from "@t3tools/contracts";

import { markdownToHtml } from "./markdownToHtml";

/**
 * Renders markdown to PDF via the desktop bridge.
 *
 * Orchestrates the PDF rendering pipeline:
 * 1. Converts markdown to HTML using markdownToHtml
 * 2. Calls the desktop bridge to render HTML to PDF via Electron's printToPDF
 * 3. Returns the path to the generated PDF file
 *
 * @param markdown - The markdown content to render
 * @param outputPath - The absolute file path where the PDF should be saved
 * @returns Promise resolving to the PDF file path
 * @throws Error with descriptive message if rendering fails or bridge is unavailable
 */
export async function renderPdf(
  markdown: string,
  outputPath: string,
): Promise<{ pdfPath: string }> {
  if (!window.desktopBridge) {
    throw new Error(
      "PDF rendering is only available in the desktop app. Please use the Electron desktop version.",
    );
  }

  // Convert markdown to HTML with embedded styles and fonts
  const html = markdownToHtml(markdown);

  // Call the desktop bridge to render HTML to PDF
  // Note: The contract field is named 'markdown' but contains HTML after conversion
  const result = await window.desktopBridge.renderMarkdownToPdf({
    markdown: html,
    outputPath,
  });

  // Handle rendering errors
  if (!result.success) {
    const errorMessage = result.error || "Unknown error occurred during PDF rendering";
    throw new Error(`Failed to render PDF: ${errorMessage}`);
  }

  // Verify we got a file path back
  if (!result.filePath) {
    throw new Error("PDF rendering succeeded but no file path was returned");
  }

  return { pdfPath: result.filePath };
}
