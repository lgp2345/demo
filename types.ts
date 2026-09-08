// src/utils/long-png/types.ts

export interface LongPngProgress {
  /**
   * capture:
   * html2canvas 正在截图
   *
   * encode:
   * Worker 正在编码 PNG
   *
   * done:
   * 完成
   */
  phase: 'capture' | 'encode' | 'done';

  /**
   * 0 ~ 1
   */
  progress: number;

  /**
   * 当前分片
   */
  current: number;

  /**
   * 总分片数量
   */
  total: number;
}

export interface ExportLongPngOptions {
  /**
   * html2canvas scale
   *
   * 强烈推荐 1
   */
  scale?: number;

  /**
   * 每次截图高度。
   *
   * 不传则自动计算。
   */
  chunkHeight?: number;

  /**
   * PNG 压缩级别
   *
   * 0 ~ 9
   *
   * 推荐 3
   */
  compressionLevel?: number;

  /**
   * 背景色
   */
  backgroundColor?: string | null;

  /**
   * 是否启用跨域图片
   */
  useCORS?: boolean;

  /**
   * 导出进度
   */
  onProgress?: (progress: LongPngProgress) => void;

  /**
   * AbortController
   */
  signal?: AbortSignal;
}