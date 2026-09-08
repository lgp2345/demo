import html2canvas from 'html2canvas';

import type {
  ExportLongPngOptions,
} from './types';

interface ReadyResponse {
  type: 'ready';
}

interface ChunkDoneResponse {
  type: 'chunk-done';

  rows: number;
}

interface DoneResponse {
  type: 'done';

  blob: Blob;

  size: number;

  width: number;

  height: number;
}

interface ErrorResponse {
  type: 'error';

  message: string;
}

type WorkerResponse =
  | ReadyResponse
  | ChunkDoneResponse
  | DoneResponse
  | ErrorResponse;

/**
 * 每一个 html2canvas Canvas
 * 建议控制在多少像素以内。
 *
 * 8M pixels：
 *
 * RGBA 大约：
 *
 * 8,000,000 × 4
 * ≈ 32MB
 *
 * 加上 Canvas 自身，
 * 当前分片整体通常几十 MB。
 */
const DEFAULT_PIXEL_BUDGET =
  8_000_000;

function nextFrame() {
  return new Promise<void>(
    (resolve) => {
      requestAnimationFrame(
        () => resolve(),
      );
    },
  );
}

/**
 * 根据宽度和 scale
 * 自动计算安全 chunkHeight。
 */
function getAutoChunkHeight(
  width: number,
  scale: number,
) {
  /**
   * 输出真实像素宽度
   */
  const outputWidth =
    Math.floor(
      width * scale,
    );

  /**
   * 一个 CSS px 的纵向高度经过 scale 后，
   * 会产生 scale 行实际像素。
   */
  const height =
    Math.floor(
      DEFAULT_PIXEL_BUDGET /
        outputWidth /
        scale,
    );

  /**
   * 不要过大，
   * 也不要太小导致分片数量过多。
   */
  return Math.max(
    500,
    Math.min(
      3000,
      height,
    ),
  );
}

/**
 * Worker request-response。
 *
 * 我们每次只发送一块，
 * Worker 编码完后才发送下一块。
 *
 * 因此不会出现几十块 RGBA
 * 同时堆积在 Worker queue。
 */
function requestWorker(
  worker: Worker,

  message: unknown,

  transfer: Transferable[] = [],
) {
  return new Promise<WorkerResponse>(
    (resolve, reject) => {
      const onMessage = (
        event: MessageEvent<WorkerResponse>,
      ) => {
        cleanup();

        const response =
          event.data;

        if (
          response.type ===
          'error'
        ) {
          reject(
            new Error(
              response.message,
            ),
          );

          return;
        }

        resolve(response);
      };

      const onError = (
        event: ErrorEvent,
      ) => {
        cleanup();

        reject(
          event.error ??
            new Error(
              event.message,
            ),
        );
      };

      const cleanup = () => {
        worker.removeEventListener(
          'message',
          onMessage,
        );

        worker.removeEventListener(
          'error',
          onError,
        );
      };

      worker.addEventListener(
        'message',
        onMessage,
      );

      worker.addEventListener(
        'error',
        onError,
      );

      worker.postMessage(
        message,
        transfer,
      );
    },
  );
}

function throwIfAborted(
  signal?: AbortSignal,
) {
  if (
    signal?.aborted
  ) {
    throw new DOMException(
      'Export aborted',
      'AbortError',
    );
  }
}

/**
 * 超长 DOM → 单张 PNG Blob
 */
export async function exportLongPng(
  element: HTMLElement,

  options: ExportLongPngOptions = {},
): Promise<Blob> {
  const {
    scale = 1,

    compressionLevel = 3,

    backgroundColor =
      '#ffffff',

    useCORS = true,

    onProgress,

    signal,
  } = options;

  /**
   * 为了保证：
   *
   * floor(chunk * scale)
   *
   * 的总和和
   *
   * floor(total * scale)
   *
   * 完全一致，
   *
   * 当前版本建议 scale 使用整数。
   *
   * 实际业务推荐直接 scale = 1。
   */
  if (
    !Number.isInteger(scale) ||
    scale <= 0
  ) {
    throw new Error(
      'scale must be a positive integer. Recommended value: 1.',
    );
  }

  if (
    compressionLevel < 0 ||
    compressionLevel > 9
  ) {
    throw new Error(
      'compressionLevel must be between 0 and 9.',
    );
  }

  throwIfAborted(
    signal,
  );

  /**
   * 等待 WebFont。
   *
   * 否则截图时可能字体还没加载完。
   */
  if (
    document.fonts
  ) {
    await document.fonts.ready;
  }

  const width =
    Math.ceil(
      element.scrollWidth,
    );

  const totalHeight =
    Math.ceil(
      element.scrollHeight,
    );

  if (
    width <= 0 ||
    totalHeight <= 0
  ) {
    throw new Error(
      'Invalid element size.',
    );
  }

  /**
   * PNG 最终实际像素尺寸。
   *
   * html2canvas 内部 CanvasRenderer
   * 使用 Math.floor(width * scale)。
   */
  const outputWidth =
    Math.floor(
      width * scale,
    );

  const outputHeight =
    Math.floor(
      totalHeight * scale,
    );

  const chunkHeight =
    options.chunkHeight ??
    getAutoChunkHeight(
      width,
      scale,
    );

  const totalChunks =
    Math.ceil(
      totalHeight /
        chunkHeight,
    );

  console.info(
    '[long-png]',
    {
      cssSize:
        `${width} × ${totalHeight}`,

      outputSize:
        `${outputWidth} × ${outputHeight}`,

      scale,

      chunkHeight,

      totalChunks,
    },
  );

  const worker =
    new Worker(
      new URL(
        './long-png.worker.ts',
        import.meta.url,
      ),
      {
        type: 'module',
      },
    );

  try {
    /**
     * 初始化最终 PNG。
     */
    const initResponse =
      await requestWorker(
        worker,
   