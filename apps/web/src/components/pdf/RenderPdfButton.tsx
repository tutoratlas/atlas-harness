import { useState } from "react";
import { LoaderIcon } from "lucide-react";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { renderPdf } from "~/pdf/renderPdf";
import { readLocalApi } from "~/localApi";

export interface RenderPdfButtonProps {
  /** The markdown content to render */
  markdown: string;
  /** The absolute path where the PDF should be saved */
  outputPath: string;
  /** Optional button text (defaults to "Render PDF") */
  buttonText?: string;
  /** Optional button variant */
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "destructive-outline" | "link";
  /** Optional button size */
  size?: "default" | "sm" | "lg" | "xl" | "xs" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | "icon-xl";
  /** Optional className for styling */
  className?: string;
  /** Optional callback when PDF is successfully rendered */
  onSuccess?: (pdfPath: string) => void;
  /** Optional callback when PDF rendering fails */
  onError?: (error: Error) => void;
}

/**
 * Button component that renders markdown to PDF.
 *
 * Shows loading spinner during render, success toast on completion with
 * 'Open PDF' action that calls localApi.materials.openPath(pdfPath),
 * and error toast on failure.
 */
export function RenderPdfButton({
  markdown,
  outputPath,
  buttonText = "Render PDF",
  variant = "default",
  size = "default",
  className,
  onSuccess,
  onError,
}: RenderPdfButtonProps) {
  const [isRendering, setIsRendering] = useState(false);

  const handleRender = async () => {
    if (!window.desktopBridge) {
      toastManager.add({
        title: "Desktop app required",
        description: "PDF rendering is only available in the desktop app.",
        type: "error",
      });
      return;
    }

    setIsRendering(true);

    try {
      const { pdfPath } = await renderPdf(markdown, outputPath);

      const api = readLocalApi();

      toastManager.add({
        title: "PDF rendered successfully",
        description: pdfPath,
        type: "success",
        data: api ? {
          dismissAfterVisibleMs: 5000,
          additionalActions: [
            {
              id: "open-pdf",
              props: {
                children: "Open PDF",
                onClick: async () => {
                  try {
                    await api.materials.openPath({ path: pdfPath });
                  } catch (error) {
                    toastManager.add({
                      title: "Failed to open PDF",
                      description: error instanceof Error ? error.message : "An unknown error occurred",
                      type: "error",
                    });
                  }
                },
              },
            },
          ],
        } : {
          dismissAfterVisibleMs: 5000,
        },
      });

      onSuccess?.(pdfPath);
    } catch (error) {
      console.error("Failed to render PDF:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";

      toastManager.add({
        title: "Failed to render PDF",
        description: errorMessage,
        type: "error",
      });

      onError?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <Button
      onClick={handleRender}
      disabled={isRendering}
      variant={variant}
      size={size}
      className={className}
    >
      {isRendering ? (
        <>
          <LoaderIcon className="size-4 animate-spin" />
          Rendering...
        </>
      ) : (
        buttonText
      )}
    </Button>
  );
}
