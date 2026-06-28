import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";

import type * as Electron from "electron";

import * as ElectronWindow from "../electron/ElectronWindow.ts";

const PDF_TIMEOUT_MS = 30_000;

export class DesktopPdfRendererError extends Data.TaggedError("DesktopPdfRendererError")<{
  readonly cause: unknown;
}> {
  override get message() {
    return `Failed to render PDF: ${String(this.cause)}`;
  }
}

export interface DesktopPdfRendererShape {
  readonly renderToPdf: (
    html: string,
    outputPath: string,
  ) => Effect.Effect<
    { readonly pdfPath: string },
    DesktopPdfRendererError | PlatformError.PlatformError | ElectronWindow.ElectronWindowCreateError
  >;
}

export class DesktopPdfRenderer extends Context.Service<
  DesktopPdfRenderer,
  DesktopPdfRendererShape
>()("@t3tools/desktop/pdf/DesktopPdfRenderer") {}

const renderPdfWithWindow = Effect.fnUntraced(function* (input: {
  readonly electronWindow: ElectronWindow.ElectronWindowShape;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly html: string;
  readonly outputPath: string;
  readonly suffix: string;
}): Effect.fn.Return<
  { readonly pdfPath: string },
  DesktopPdfRendererError | PlatformError.PlatformError | ElectronWindow.ElectronWindowCreateError
> {
  const window = yield* input.electronWindow.create({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const cleanup = Effect.sync(() => {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });

  const renderEffect = Effect.gen(function* () {
    const htmlDataUri = `data:text/html;charset=utf-8,${encodeURIComponent(input.html)}`;

    const waitForLoad = Effect.callback<void, DesktopPdfRendererError>((resume) => {
      const finishLoadHandler = () => {
        resume(Effect.void);
      };

      const failLoadHandler = (
        _event: Electron.Event,
        errorCode: number,
        errorDescription: string,
      ) => {
        resume(
          Effect.fail(
            new DesktopPdfRendererError({
              cause: `Failed to load HTML: ${errorCode} ${errorDescription}`,
            }),
          ),
        );
      };

      window.webContents.once("did-finish-load", finishLoadHandler);
      window.webContents.once("did-fail-load", failLoadHandler);

      void window.loadURL(htmlDataUri);

      // Detach listeners if the load is interrupted (e.g. by the timeout below).
      return Effect.sync(() => {
        window.webContents.removeListener("did-finish-load", finishLoadHandler);
        window.webContents.removeListener("did-fail-load", failLoadHandler);
      });
    });

    yield* waitForLoad.pipe(
      Effect.timeout(PDF_TIMEOUT_MS),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(
          new DesktopPdfRendererError({ cause: "PDF rendering timed out after 30 seconds" }),
        ),
      ),
    );

    const pdfBuffer = yield* Effect.tryPromise({
      try: () =>
        window.webContents.printToPDF({
          pageSize: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          margins: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          },
        }),
      catch: (error) => new DesktopPdfRendererError({ cause: error }),
    });

    const directory = input.path.dirname(input.outputPath);
    const tempPath = `${input.outputPath}.${process.pid}.${input.suffix}.tmp`;

    yield* input.fileSystem.makeDirectory(directory, { recursive: true });
    yield* input.fileSystem.writeFile(tempPath, pdfBuffer);
    yield* input.fileSystem.rename(tempPath, input.outputPath);

    return { pdfPath: input.outputPath };
  });

  return yield* renderEffect.pipe(Effect.ensuring(cleanup));
});

export const layer = Layer.effect(
  DesktopPdfRenderer,
  Effect.gen(function* () {
    const electronWindow = yield* ElectronWindow.ElectronWindow;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    return DesktopPdfRenderer.of({
      renderToPdf: (html, outputPath) =>
        crypto.randomUUIDv4.pipe(
          Effect.map((uuid) => uuid.replace(/-/g, "")),
          Effect.flatMap((suffix) =>
            renderPdfWithWindow({
              electronWindow,
              fileSystem,
              path,
              html,
              outputPath,
              suffix,
            }),
          ),
          Effect.withSpan("desktop.pdfRenderer.renderToPdf"),
        ),
    });
  }),
);

export const layerTest = Layer.effect(
  DesktopPdfRenderer,
  Effect.gen(function* () {
    const renderCalls = yield* Ref.make<
      Array<{ readonly html: string; readonly outputPath: string }>
    >([]);

    return DesktopPdfRenderer.of({
      renderToPdf: (html, outputPath) =>
        Ref.update(renderCalls, (calls) => [...calls, { html, outputPath }]).pipe(
          Effect.map(() => ({ pdfPath: outputPath })),
        ),
    });
  }),
);
