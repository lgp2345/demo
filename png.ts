// src/utils/long-png/png.ts

/**
 * PNG 文件头：
 *
 * 89 50 4E 47
 * 0D 0A 1A 0A
 */
export const PNG_SIGNATURE =
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ]);

const encoder =
  new TextEncoder();

/**
 * CRC32 lookup table
 */
const CRC_TABLE = (() => {
  const table =
    new Uint32Array(256);

  for (
    let n = 0;
    n < 256;
    n++
  ) {
    let c = n;

    for (
      let k = 0;
      k < 8;
      k++
    ) {
      if (c & 1) {
        c =
          0xedb88320 ^
          (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }

    table[n] =
      c >>> 0;
  }

  return table;
})();

/**
 * PNG CRC32
 */
export function crc32(
  data: Uint8Array,
): number {
  let crc =
    0xffffffff;

  for (
    let index = 0;
    index < data.length;
    index++
  ) {
    crc =
      CRC_TABLE[
        (crc ^ data[index]) &
          0xff
      ] ^
      (crc >>> 8);
  }

  return (
    crc ^ 0xffffffff
  ) >>> 0;
}

/**
 * 创建标准 PNG Chunk。
 *
 * PNG Chunk:
 *
 * ┌──────────┐
 * │ Length 4 │
 * ├──────────┤
 * │ Type   4 │
 * ├──────────┤
 * │ Data   N │
 * ├──────────┤
 * │ CRC    4 │
 * └──────────┘
 */
export function createPngChunk(
  type: string,
  data = new Uint8Array(),
): Uint8Array {
  const typeBytes =
    encoder.encode(type);

  if (
    typeBytes.length !== 4
  ) {
    throw new Error(
      `Invalid PNG chunk type: ${type}`,
    );
  }

  const output =
    new Uint8Array(
      12 + data.length,
    );

  const view =
    new DataView(
      output.buffer,
    );

  /**
   * Chunk data length
   *
   * PNG 使用大端序。
   */
  view.setUint32(
    0,
    data.length,
    false,
  );

  /**
   * Type
   */
  output.set(
    typeBytes,
    4,
  );

  /**
   * Data
   */
  output.set(
    data,
    8,
  );

  /**
   * CRC 计算范围：
   *
   * type + data
   */
  const crcInput =
    new Uint8Array(
      4 + data.length,
    );

  crcInput.set(
    typeBytes,
    0,
  );

  crcInput.set(
    data,
    4,
  );

  view.setUint32(
    8 + data.length,
    crc32(crcInput),
    false,
  );

  return output;
}

/**
 * IHDR
 *
 * width  4
 * height 4
 * depth  1
 * color  1
 * compress 1
 * filter   1
 * interlace 1
 */
export function createIhdrChunk(
  width: number,
  height: number,
): Uint8Array {
  if (
    width <= 0 ||
    height <= 0 ||
    width > 0x7fffffff ||
    height > 0x7fffffff
  ) {
    throw new Error(
      `Invalid PNG dimensions: ${width} × ${height}`,
    );
  }

  const data =
    new Uint8Array(13);

  const view =
    new DataView(
      data.buffer,
    );

  view.setUint32(
    0,
    width,
    false,
  );

  view.setUint32(
    4,
    height,
    false,
  );

  /**
   * Bit depth = 8
   */
  data[8] = 8;

  /**
   * Color type = 6
   *
   * RGBA
   */
  data[9] = 6;

  /**
   * Compression method
   */
  data[10] = 0;

  /**
   * Filter method
   */
  data[11] = 0;

  /**
   * No interlace
   */
  data[12] = 0;

  return createPngChunk(
    'IHDR',
    data,
  );
}

/**
 * IDAT
 */
export function createIdatChunk(
  compressedData: Uint8Array,
): Uint8Array {
  return createPngChunk(
    'IDAT',
    compressedData,
  );
}

/**
 * IEND
 */
export function createIendChunk() {
  return createPngChunk(
    'IEND',
  );
}