// src/utils/long-png/exportLongPng.ts

import html2canvas from 'html2canvas-pro';

import type {
  ExportLongPngOptions,
} from './types';

interface ReadyResponse {
  type: 'ready';
}

interface ChunkDoneResponse {
  type: 'chunk-done';

  encodedRows: number;
}

interface DoneResponse {
  type: 'done';

  blob: Blob;

  width: number;

  height: number;

  size: number;
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

interface SliceInfo {
  index: number;

  /**
   * CSS px
   */
  y: number;

  /**
   * CSS px
   */
  height: number;

  /**
   * scale 后预计 Canvas height
   */
  outputHeight: number;
}

const DEFAULT_PIXEL_BUDGET =
  8_000_000;

const DEFAULT_MAX_CHUNK_HEIGHT =
  3000;

function createAbortError() {
  return new DOMException(
    'Export aborted.',
    'AbortError',
  );
}

function throwIfAborted(
  signal?: AbortSignal,
) {
  if (
    signal?.aborted
  ) {
    throw createAbortError();
  }
}

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
 * 自动计算每片高度。
 *
 * pixel =
 *
 * width
 * × chunkHeight
 * × scale²
 */
function getAutoChunkHeight(
  width: number,
  scale: number,
  pixelBudget: number,
) {
  const outputWidth =
    Math.floor(
      width *
        scale,
    );

  const estimated =
    Math.floor(
      pixelBudget /
        outputWidth /
        scale,
    );

  return Math.max(
    128,
    Math.min(
      DEFAULT_MAX_CHUNK_HEIGHT,
      estimated,
    ),
  );
}

/**
 * 提前计算所有分片。
 *
 * 同时提前知道最终 PNG 高度。
 */
function createSlices(
  totalHeight: number,
  chunkHeight: number,
  scale: number,
): {
  slices: SliceInfo[];

  outputHeight: number;
} {
  const slices: SliceInfo[] =
    [];

  let outputHeight = 0;

  let index = 0;

  for (
    let y = 0;
    y < totalHeight;
    y +=
      chunkHeight
  ) {
    const height =
      Math.min(
        chunkHeight,
        totalHeight - y,
      );

    /**
     * html2canvas 的 Canvas
     * 最终尺寸受 scale 影响。
     */
    const sliceOutputHeight =
      Math.floor(
        height *
          scale,
      );

    if (
      sliceOutputHeight <=
      0
    ) {
      throw new Error(
        'Invalid slice output height.',
      );
    }

    slices.push({
      index,

      y,

      height,

      outputHeight:
        sliceOutputHeight,
    });

    outputHeight +=
      sliceOutputHeight;

    index++;
  }

  return {
    slices,
    outputHeight,
  };
}

/**
 * Worker request / response。
 *
 * 每次必须等待 Worker 编完一片，
 * 才发送下一片。
 *
 * 防止几十个 RGBA Buffer
 * 堆积到 Worker 消息队列。
 */
function requestWorker(
  worker: Worker,
  message: unknown,
  transfer: Transferable[] = [],
  signal?: AbortSignal,
): Promise<WorkerResponse> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      if (
        signal?.aborted
      ) {
        reject(
          createAbortError(),
        );

        return;
      }

      const cleanup = () => {
        worker.removeEventListener(
          'message',
          onMessage,
        );

        worker.removeEventListener(
          'error',
          onError,
        );

        signal?.removeEventListener(
          'abort',
          onAbort,
        );
      };

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

        resolve(
          response,
        );
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

      const onAbort = () => {
        cleanup();

        reject(
          createAbortError(),
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

      signal?.addEventListener(
        'abort',
        onAbort,
        {
          once: true,
        },
      );

      worker.postMessage(
        message,
        transfer,
      );
    },
  );
}

/**
 * 超长 DOM
 *
 * ↓
 *
 * 单张完整 PNG Blob
 */
export async function exportLongPng(
  element: HTMLElement,
  options: ExportLongPngOptions = {},
): Promise<Blob> {
  const {
    scale = 1,

    pixelBudget =
      DEFAULT_PIXEL_BUDGET,

    backgroundColor =
      '#ffffff',

    useCORS = true,

    onProgress,

    signal,
  } = options;

  if (
    !Number.isFinite(
      scale,
    ) ||
    scale < 1
  ) {
    throw new Error(
      'scale must be >= 1.',
    );
  }

  throwIfAborted(
    signal,
  );

  /**
   * 等字体加载完成。
   */
  if (
    document.fonts
  ) {
    await document.fonts.ready;
  }

  throwIfAborted(
    signal,
  );

  /**
   * transform 不会影响 scrollWidth /
   * scrollHeight。
   *
   * 对你的 1920px 设计稿非常合适。
   */
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
      `Invalid element size: ${width} × ${totalHeight}`,
    );
  }

  /**
   * 最终 PNG 宽度。
   */
  const outputWidth =
    Math.floor(
      width *
        scale,
    );

  const chunkHeight =
    options.chunkHeight ??
    getAutoChunkHeight(
      width,
      scale,
      pixelBudget,
    );

  if (
    chunkHeight <= 0
  ) {
    throw new Error(
      'chunkHeight must be > 0.',
    );
  }

  const {
    slices,
    outputHeight,
  } =
    createSlices(
      totalHeight,
      chunkHeight,
      scale,
    );

  if (
    outputWidth >
      0x7fffffff ||
    outputHeight >
      0x7fffffff
  ) {
    throw new Error(
      `PNG size is too large: ${outputWidth} × ${outputHeight}`,
    );
  }

  const totalChunks =
    slices.length;

  console.info(
    '[long-png] start',
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
        {
          type: 'init',

          width:
            outputWidth,

          height:
            outputHeight,
        },
        [],
        signal,
      );

    if (
      initResponse.type !==
      'ready'
    ) {
      throw new Error(
        'Unexpected PNG worker initialization response.',
      );
    }

    let finalBlob:
      | Blob
      | undefined;

    for (
      let currentIndex = 0;
      currentIndex <
      slices.length;
      currentIndex++
    ) {
      throwIfAborted(
        signal,
      );

      const slice =
        slices[
          currentIndex
        ];

      onProgress?.({
        phase:
          'capture',

        progress:
          currentIndex /
          totalChunks,

        current:
          currentIndex +
          1,

        total:
          totalChunks,
      });

      let canvas:
        | HTMLCanvasElement
        | undefined;

      try {
        /**
      * 每次只创建：
         *
         * 1920 × 3000
         *
         * 之类的小 Canvas。
         *
         * 永远不会创建：
         *
         * 1920 × 70000。
         */
        canvas =
          await html2canvas(
            element,
            {
              scale,

              /**
               * html2canvas-pro 文档中：
               *
               * x/y 是针对元素的裁剪坐标。
               */
              x: 0,

              y:
                slice.y,

              width,

              height:
                slice.height,

              backgroundColor,

              useCORS,

              logging: false,

              removeContainer:
                true,

              /**
               * 对你的 1920
               * 设计稿非常重要。
               *
               * 防止截图时媒体查询
               * 变成笔记本屏幕宽度。
               */
              windowWidth:
                options.windowWidth ??
                width,

              windowHeight:
                options.windowHeight ??
                window.innerHeight,

              /**
               * html2canvas-pro
               * 默认会进行 DOM normalize。
               *
               * 对存在 transform: scale()
               * 的大屏页面通常更合适。
               */
              normalizeDom:
                true,
            },
          );

        throwIfAborted(
          signal,
        );

        if (
          canvas.width !==
          outputWidth
        ) {
          throw new Error(
            [
              'Unexpected canvas width.',
              `Expected ${outputWidth},`,
              `received ${canvas.width}.`,
            ].join(' '),
          );
        }

        if (
          canvas.height !==
          slice.outputHeight
        ) {
          throw new Error(
            [
              'Unexpected canvas height.',
              `Expected ${slice.outputHeight},`,
              `received ${canvas.height}.`,
            ].join(' '),
          );
        }

        const context =
          canvas.getContext(
            '2d',
            {
              /**
               * Chrome 对频繁 getImageData()
               * 会给这个优化提示。
               */
              willReadFrequently:
                true,
            },
          );

        if (!context) {
          throw new Error(
            'Unable to get Canvas 2D context.',
          );
        }

        /**
         * 当前分片 RGBA。
         */
        const imageData =
          context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );

        /**
         * ArrayBuffer 所有权直接
         * Transfer 给 Worker。
         *
         * 不复制。
         */
        const buffer =
          imageData.data
            .buffer as ArrayBuffer;

        const isLast =
          currentIndex ===
          slices.length -
            1;

        onProgress?.({
          phase:
            'encode',

          progress:
            currentIndex /
            totalChunks,

          current:
            currentIndex +
            1,

          total:
            totalChunks,
        });

        const response =
          await requestWorker(
            worker,
            {
              type:
                'chunk',

              buffer,

              /**
               * 一定使用 Canvas
               * 实际像素高度。
               */
              height:
                canvas.height,

              isLast,
            },
            [
              buffer,
            ],
            signal,
          );

        if (isLast) {
          if (
            response.type !==
            'done'
          ) {
            throw new Error(
              'Unexpected final worker response.',
            );
          }

          finalBlob =
            response.blob;

          console.info(
            '[long-png] finished',
            {
              width:
                response.width,

              height:
                response.height,

              size:
                response.size,
            },
          );
        } else {
          if (
            response.type !==
            'chunk-done'
          ) {
            throw new Error(
              'Unexpected worker response.',
            );
          }
        }
      } finally {
        /**
         * html2canvas 当前分片立即释放。
         */
        if (canvas) {
          canvas.width = 0;

          canvas.height = 0;

          canvas = undefined;
        }
      }

      onProgress?.({
        phase:
          'encode',

        progress:
          (currentIndex +
            1) /
          totalChunks,

        current:
          currentIndex +
          1,

        total:
          totalChunks,
      });

      /**
       * 给浏览器：
       *
       * - UI
       * - GC
       * - RAF
       *
       * 一个执行机会。
       */
      await nextFrame();
    }

    if (!finalBlob) {
      throw new Error(
        'PNG Blob was not generated.',
      );
    }

    onProgress?.({
      phase: 'done',

      progress: 1,

  current:
        totalChunks,

      total:
        totalChunks,
    });

    return finalBlob;
  } finally {
    /**
     * 无论：
     *
     * 成功
     * 失败
     * Abort
     *
     * 都关闭 Worker。
     */
    worker.terminate();
  }
}

/**
 * 下载 Blob。
 */
export function downloadBlob(
  blob: Blob,
  filename =
    'long-image.png',
) {
  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      'a',
    );

  anchor.href = url;

  anchor.download =
    filename;

  anchor.style.display =
    'none';

  document.body.appendChild(
    anchor,
  );

  anchor.click();

  anchor.remove();

  /**
   * 不要 click 完立刻 revoke。
   */
  setTimeout(
    () => {
      URL.revokeObjectURL(
        url,
      );
    },
    3000,
  );
}