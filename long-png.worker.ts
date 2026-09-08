/// <reference lib="webworker" />

import { Deflate } from 'pako';

import {
  ChunkType,
  ColorType,
  FilterMethod,
  encodeChunk,
  encodeHeader,
  encode_IDAT_raw,
  encode_IHDR,
} from 'png-tools';

interface InitMessage {
  type: 'init';

  width: number;

  height: number;

  compressionLevel: number;
}

interface ChunkMessage {
  type: 'chunk';

  /**
   * RGBA 像素
   */
  buffer: ArrayBuffer;

  /**
   * 当前分片真实像素高度
   *
   * 注意：
   * 这里已经是经过 scale 后的高度
   */
  height: number;

  /**
   * 是否最后一片
   */
  isLast: boolean;
}

type WorkerMessage =
  | InitMessage
  | ChunkMessage;

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

let imageWidth = 0;

let imageHeight = 0;

let encodedRows = 0;

let deflator: Deflate | null = null;

/**
 * 最终 PNG 的各个数据块。
 *
 * 这里保存的是已经经过 Deflate 压缩后的数据，
 * 而不是几百 MB / 几 GB 的 RGBA。
 */
let outputParts: BlobPart[] = [];

/**
 * 写普通 PNG 数据
 */
function write(data: Uint8Array) {
  outputParts.push(data);
}

/**
 * 写 PNG Chunk
 */
function writeChunk(
  type: string,
  data?: Uint8Array,
) {
  write(
    encodeChunk({
      type,
      data,
    }),
  );
}

/**
 * 初始化 PNG
 */
function init(message: InitMessage) {
  imageWidth = message.width;
  imageHeight = message.height;

  encodedRows = 0;

  outputParts = [];

  /**
   * PNG signature
   */
  write(
    encodeHeader(),
  );

  /**
   * PNG IHDR
   *
   * 注意这里直接声明最终超长图片尺寸。
   *
   * 例如：
   *
   * 1920 × 70000
   */
  writeChunk(
    ChunkType.IHDR,
    encode_IHDR({
      width: imageWidth,
      height: imageHeight,

      depth: 8,

      colorType: ColorType.RGBA,

      filter: FilterMethod.Paeth,
    }),
  );

  /**
   * 创建一个持续存在的 zlib stream。
   *
   * 非常重要：
   *
   * 所有分片必须进入同一个 Deflate stream。
   */
  deflator = new Deflate({
    level: message.compressionLevel,

    /**
     * 控制每次产生多少压缩数据。
     */
    chunkSize: 256 * 1024,
  });

  /**
   * pako 每产生一段压缩结果，
   * 就立即包装成 PNG IDAT。
   */
  deflator.onData = (
    compressed: Uint8Array,
  ) => {
    writeChunk(
      ChunkType.IDAT,
      compressed,
    );
  };

  /**
   * 重写默认 onEnd。
   *
   * 默认 Pako 会把所有 compressed chunk
   * 再合并成一个巨大 result。
   *
   * 我们不需要这个 result。
   *
   * 因为 compressed chunk 已经被我们写入
   * PNG IDAT。
   */
  deflator.onEnd = function (
    this: any,
    status: number,
  ) {
    this.err = status;

    this.msg =
      this.strm?.msg ?? '';
  };

  const response: ReadyResponse = {
    type: 'ready',
  };

  self.postMessage(response);
}

/**
 * 编码一个 html2canvas 分片
 */
function encodeImageChunk(
  message: ChunkMessage,
) {
  if (!deflator) {
    throw new Error(
      'PNG encoder has not been initialized.',
    );
  }

  const pixels = new Uint8ClampedArray(
    message.buffer,
  );

  const expectedLength =
    imageWidth *
    message.height *
    4;

  if (
    pixels.length !== expectedLength
  ) {
    throw new Error(
      [
        'Invalid RGBA buffer.',
        `Expected: ${expectedLength}`,
        `Actual: ${pixels.length}`,
      ].join(' '),
    );
  }

  /**
   * 把 RGBA 转换为 PNG scanline。
   *
   * 每一行最终类似：
   *
   * filter byte
   * R G B A
   * R G B A
   * ...
   */
  const raw = encode_IDAT_raw(
    pixels,
    {
      width: imageWidth,

      height:
        message.height,

      depth: 8,

      colorType:
        ColorType.RGBA,

      /**
       * 普通行使用 Paeth，
       * 文件体积一般比 None 小。
       */
      filter:
        FilterMethod.Paeth,

      /**
       * 非常重要。
       *
       * 每一个 html2canvas 分片的第一行
       * 不应该依赖上一个分片的 Previous Row。
       *
       * Sub 只依赖当前行左边像素。
       */
      firstFilter:
        FilterMethod.Sub,
    },
  );

  encodedRows +=
    message.height;

  /**
   * 把当前分片继续压入
   * 同一个 zlib stream。
   */
  const success =
    deflator.push(
      raw,
      message.isLast,
    );

  if (!success) {
    throw new Error(
      deflator.msg ||
        'Deflate failed.',
    );
  }

  if (message.isLast) {
    if (
      encodedRows !==
      imageHeight
    ) {
      throw new Error(
        [
          'PNG height mismatch.',
          `Expected: ${imageHeight}`,
          `Actual: ${encodedRows}`,
        ].join(' '),
      );
    }

    /**
     * PNG end
     */
    writeChunk(
      ChunkType.IEND,
    );

    /**
     * 最终只生成一个 Blob。
     *
     * 注意：
     * 这里并没有创建一个巨大 Canvas。
     */
    const blob = new Blob(
      outputParts,
      {
        type: 'image/png',
      },
    );

    const response: DoneResponse =
      {
        type: 'done',

        blob,

        size: blob.size,

        width:
          imageWidth,

        height:
          imageHeight,
      };

    self.postMessage(
      response,
    );

    /**
     * 释放 Worker 内部引用
     */
    outputParts = [];

    deflator = null;

    return;
  }

  const response: ChunkDoneResponse =
  