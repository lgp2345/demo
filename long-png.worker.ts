// src/utils/long-png/long-png.worker.ts

import {
  createIdatChunk,
  createIendChunk,
  createIhdrChunk,
  PNG_SIGNATURE,
} from './png';

/**
 * 初始化 PNG。
 */
interface InitMessage {
  type: 'init';

  width: number;

  height: number;
}

/**
 * 写入一个 html2canvas 分片。
 */
interface ChunkMessage {
  type: 'chunk';

  /**
   * RGBA ArrayBuffer
   */
  buffer: ArrayBuffer;

  /**
   * 当前 Canvas 高度。
   *
   * 注意是 scale 后真实像素高度。
   */
  height: number;

  /**
   * 是否最后一个分片。
   */
  isLast: boolean;
}

type WorkerRequest =
  | InitMessage
  | ChunkMessage;

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

/**
 * 避免 TS 把 self 判断成 Window。
 */
const workerScope =
  globalThis as unknown as {
    postMessage(
      message: WorkerResponse,
      transfer?: Transferable[],
    ): void;

    onmessage:
      | ((
          event: MessageEvent<WorkerRequest>,
        ) => void)
      | null;
  };

interface EncoderState {
  width: number;

  height: number;

  /**
   * 已编码多少行。
   */
  encodedRows: number;

  /**
   * PNG 最终数据。
   *
   * 注意：
   * 保存的是已经压缩后的 PNG 数据，
   * 不是完整 RGBA。
   */
  parts: BlobPart[];

  compression:
    CompressionStream;

  writer:
    WritableStreamDefaultWriter<BufferSource>;

  /**
   * CompressionStream readable
   * 必须持续消费。
   *
   * 否则 writable 可能因为背压暂停。
   */
  readTask: Promise<void>;
}

let state:
  | EncoderState
  | null = null;

/**
 * 将 Uint8Array 添加到 Blob。
 */
function appendBytes(
  parts: BlobPart[],
  bytes: Uint8Array,
) {
  /**
   * bytes 是我们新创建的 Uint8Array，
   * 整个 buffer 都属于当前 chunk。
   */
  parts.push(
    bytes.buffer as ArrayBuffer,
  );
}

/**
 * 创建 PNG encoder。
 */
function createEncoder(
  width: number,
  height: number,
): EncoderState {
  if (
    typeof CompressionStream ===
    'undefined'
  ) {
    throw new Error(
      'Current browser does not support CompressionStream.',
    );
  }

  /**
   * 非常重要：
   *
   * PNG 要的是 zlib 格式。
   *
   * 所以必须：
   *
   * deflate
   *
   * 不能使用：
   *
   * deflate-raw
   */
  const compression =
    new CompressionStream(
      'deflate',
    );

  const writer =
    compression.writable
      .getWriter();

  const parts: BlobPart[] =
    [];

  /**
   * PNG signature
   */
  appendBytes(
    parts,
    PNG_SIGNATURE,
  );

  /**
   * IHDR
   *
   * 这里提前声明最终超长图片尺寸。
   */
  appendBytes(
    parts,
    createIhdrChunk(
      width,
      height,
    ),
  );

  /**
   * 必须立刻启动读取任务。
   *
   * 不要等所有 writer.write()
   * 完成之后再 reader.read()。
   *
   * 否则 CompressionStream 可能
   * 因为 backpressure 阻塞。
   */
  const readTask =
    (async () => {
      const reader =
        compression.readable
          .getReader();

      try {
        while (true) {
          const {
            value,
            done,
          } =
            await reader.read();

          if (done) {
            break;
          }

          if (
            !value ||
            value.byteLength ===
              0
          ) {
            continue;
          }

          /**
           * CompressionStream
           * 输出的一段 zlib 数据
           * 包装成一个 IDAT。
           *
           * 所有 IDAT 拼接后，
           * 仍然是同一个 zlib stream。
           */
          appendBytes(
            parts,
            createIdatChunk(
              value,
            ),
          );
        }
      } finally {
        reader.releaseLock();
      }
    })();

  return {
    width,

    height,

    encodedRows: 0,

    parts,

    compression,

    writer,

    readTask,
  };
}

/**
 * 把 Canvas RGBA 数据转换为 PNG scanline。
 *
 * Canvas：
 *
 * R G B A R G B A ...
 *
 * PNG：
 *
 * filter
 * R G B A R G B A ...
 *
 * filter
 * R G B A R G B A ...
 *
 *
 * Filter 0 = None。
 *
 * 优点：
 * - 实现简单
 * - 分片之间不存在 previous row 依赖
 * - 特别适合长图流式处理
 */
async function writeRgbaRows(
  encoder: EncoderState,
  rgba: Uint8Array,
  height: number,
) {
  const {
    width,
    writer,
  } = encoder;

  const bytesPerPixel = 4;

  const rowBytes =
    width *
    bytesPerPixel;

  const expectedSize =
    rowBytes *
    height;

  if (
    rgba.byteLength !==
    expectedSize
  ) {
    throw new Error(
      [
        'RGBA size mismatch.',
        `Expected ${expectedSize},`,
        `received ${rgba.byteLength}.`,
      ].join(' '),
    );
  }

  /**
   * 每次最多构建大约 512 KB
   * PNG scanline 数据。
   *
   * 这样不会再额外创建：
   *
   * width × 3000 × 4
   *
   * 的第二份完整大 Buffer。
   */
  const targetBatchBytes =
    512 * 1024;

  const bytesPerScanline =
    rowBytes + 1;

  const rowsPerBatch =
    Math.max(
      1,
      Math.floor(
        targetBatchBytes /
          bytesPerScanline,
      ),
    );

  for (
    let startRow = 0;
    startRow < height;
    startRow +=
      rowsPerBatch
  ) {
    const batchRows =
      Math.min(
        rowsPerBatch,
        height -
          startRow,
      );

    const batch =
      new Uint8Array(
        batchRows *
          bytesPerScanline,
      );

    for (
      let localRow = 0;
      localRow <
      batchRows;
      localRow++
    ) {
      const sourceRow =
        startRow +
        localRow;

      const sourceOffset =
        sourceRow *
        rowBytes;

      const targetOffset =
        localRow *
        bytesPerScanline;

      /**
       * PNG Filter:
       *
       * 0 = None
       */
      batch[
        targetOffset
      ] = 0;

      batch.set(
        rgba.subarray(
          sourceOffset,
          sourceOffset +
            rowBytes,
        ),
        targetOffset + 1,
      );
    }

    /**
     * 写入同一个 CompressionStream。
     */
    await writer.write(
      batch,
    );
  }

  encoder.encodedRows +=
    height;
}

/**
 * 初始化。
 */
function handleInit(
  message: InitMessage,
) {
  if (state) {
    throw new Error(
      'PNG encoder is already initialized.',
    );
  }

  state =
    createEncoder(
      message.width,
      message.height,
    );

  workerScope.postMessage({
    type: 'ready',
  });
}

/**
 * 编码一个 Canvas 分片。
 */
async function handleChunk(
  message: ChunkMessage,
) {
  if (!state) {
    throw new Error(
      'PNG encoder has not been initialized.',
    );
  }

  /**
   * 注意：
   *
   * 这个 ArrayBuffer 是从主线程
   * Transfer 过来的，
   * 并没有复制。
   */
  const rgba =
    new Uint8Array(
      message.buffer,
    );

  await writeRgbaRows(
    state,
    rgba,
    message.height,
  );

  if (!message.isLast) {
    workerScope.postMessage({
      type:
        'chunk-done',

      encodedRows:
        state.encodedRows,
    });

    return;
  }

  /**
   * 最后一个分片。
   */

  if (
    state.encodedRows !==
    state.height
  ) {
    throw new Error(
      [
        'Final PNG height mismatch.',
        `Expected ${state.height},`,
        `encoded ${state.encodedRows}.`,
      ].join(' '),
    );
  }

  /**
   * 关闭 zlib stream。
   *
   * close 后 CompressionStream
   * 会输出：
   *
   * 最后的 deflate 数据
   * +
   * Adler32
   */
  await state.writer.close();

  /**
   * 等待读取侧把剩余数据
   * 全部转换成 IDAT。
   */
  await state.readTask;

  /**
   * 最后追加 IEND。
   */
  appendBytes(
    state.parts,
    createIendChunk(),
  );

  const blob =
    new Blob(
      state.parts,
      {
        type:
          'image/png',
      },
    );

  workerScope.postMessage({
    type: 'done',

    blob,

    width:
      state.width,

    height:
      state.height,

    size:
      blob.size,
  });

  /**
   * 主动释放引用。
   */
  state = null;
}

/**
 * Worker 消息入口。
 */
async function handleMessage(
  message: WorkerRequest,
) {
  switch (
    message.type
  ) {
    case 'init':
      handleInit(
        message,
      );

      break;

    case 'chunk':
      await handleChunk(
        message,
      );

      break;
  }
}

workerScope.onmessage = (
  event,
) => {
  void handleMessage(
    event.data,
  ).catch(
    (error: unknown) => {
      workerScope.postMessage({
        type: 'error',

        message:
          error instanceof Error
            ? error.message
            : String(
                error,
              ),
      });
    },
  );
};