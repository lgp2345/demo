export type Side =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'

export type Direction =
  | 'up'
  | 'right'
  | 'down'
  | 'left'

export type RouteStrategy =
  | 'horizontal-first'
  | 'vertical-first'

export interface Point {
  x: number
  y: number
}

export type RouteStep =
  | {
      /**
       * 按指定方向移动固定距离
       *
       * 这里的 distance 永远使用设计稿坐标，
       * 不需要乘 scale。
       */
      direction: Direction
      distance: number
    }
  | {
      /**
       * 自动与 target 对齐
       */
      align: 'target-x' | 'target-y'
    }

interface RelationBase {
  /**
   * 每条关系必须唯一
   */
  id: string

  /**
   * 起点卡片 ID
   */
  source: string

  /**
   * 终点卡片 ID
   */
  target: string

  /**
   * 从 source 哪个方向出去
   */
  sourceSide: Side

  /**
   * 从 target 哪个方向进入
   */
  targetSide: Side

  /**
   * 离开 source 后先向外走多少
   *
   * 设计稿坐标
   */
  sourceGap?: number

  /**
   * 到 target 前预留多少距离
   *
   * 设计稿坐标
   */
  targetGap?: number

  /**
   * 小圆点动画持续时间，秒
   */
  duration?: number

  /**
   * 单独指定线宽
   */
  strokeWidth?: number

  /**
   * 单独指定圆点半径
   */
  dotRadius?: number
}

export interface AutoRelation extends RelationBase {
  mode: 'auto'

  /**
   * 自动连线策略
   *
   * horizontal-first:
   *
   * source ─────┐
   *             │
   *             target
   *
   *
   * vertical-first:
   *
   * source
   *   │
   *   │
   *   └────── target
   */
  strategy?: RouteStrategy
}

export interface ManualRelation extends RelationBase {
  mode: 'manual'

  /**
   * 人工定义前半段路径
   */
  route: RouteStep[]

  /**
   * route 执行完后，
   * 剩余部分如何自动连接 target
   */
  finishStrategy?: RouteStrategy
}

export type Relation =
  | AutoRelation
  | ManualRelation
