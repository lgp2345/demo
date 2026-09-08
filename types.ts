// src/utils/long-png/types.ts

export type ExportPhase =
  | 'capture'
  | 'encode'
  | 'done';

export interface ExportProgress {
  phase: ExportPhase;

  /**
   * 0 ~ 1
   */
  progress: number;

  /**
   * 当前第几个分片
   */
  current: number;

  /**
   * 总分片数量
   */
  total: number;
}

export interface ExportLongPngOptions {
  /**
   * 导出倍率。
   *
   * 推荐：
   * scale: 1
   *
   * 1920px DOM 最终就是 1920px PNG。
   */
  scale?: number;

  /**
   * 每次 html2canvas 截多少 CSS px 高度。
   *
   * 不填写则自动计算。
   */
  chunkHeight?: number;

  /**
   * 单个 Canvas 最大像素预算。
   *
   * 默认 8,000,000 像素。
   */
  pixelBudget?: number;

  /**
   * 背景色。
   */
  backgroundColor?: string | null;

  /**
   * 是否使用 CORS 加载图片。
   */
  useCORS?: boolean;

  /**
   * html2canvas clone viewport 宽度。
   *
   * 默认使用元素宽度。
   */
  windowWidth?: number;

  /**
   * html2canvas clone viewport 高度。
   */
  windowHeight?: number;

  /**
   * 进度。
   */
  onProgress?: (
    progress: ExportProgress,
  ) => void;

  /**
   * 取消导出。
   */
  signal?: AbortSignal;
}