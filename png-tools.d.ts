declare module 'png-tools' {
  export const ChunkType: {
    IHDR: string;
    IDAT: string;
    IEND: string;
  };

  export const ColorType: {
    GRAYSCALE: number;
    RGB: number;
    INDEXED: number;
    GRAYSCALE_ALPHA: number;
    RGBA: number;
  };

  export const FilterMethod: {
    None: number;
    Sub: number;
    Up: number;
    Average: number;
    Paeth: number;
  };

  export interface EncodeOptions {
    width: number;
    height: number;
    depth?: number;
    colorType?: number;
    filter?: number;
    firstFilter?: number;
  }

  export interface Chunk {
    type: string;
    data?: Uint8Array;
  }

  export function encodeHeader(): Uint8Array;

  export function encodeChunk(
    chunk: Chunk,
  ): Uint8Array;

  export function encode_IHDR(
    options: EncodeOptions,
  ): Uint8Array;

  export function encode_IDAT_raw(
    data: Uint8Array | Uint8ClampedArray,
    options: EncodeOptions,
  ): Uint8Array;
}