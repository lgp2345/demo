import type {
  Direction,
  Point,
  RouteStep,
  RouteStrategy,
  Side,
} from './types'

const EPSILON = 0.001

function nearlyEqual(
  a: number,
  b: number,
) {
  return Math.abs(a - b) < EPSILON
}

function samePoint(
  a: Point,
  b: Point,
) {
  return (
    nearlyEqual(a.x, b.x) &&
    nearlyEqual(a.y, b.y)
  )
}

/**
 * Side 转 Direction
 *
 * Side 表示卡片哪个方向
 * Direction 表示线路往哪个方向走
 */
export function sideToDirection(
  side: Side,
): Direction {
  switch (side) {
    case 'top':
      return 'up'

    case 'right':
      return 'right'

    case 'bottom':
      return 'down'

    case 'left':
      return 'left'
  }
}

/**
 * 从某个点按照方向移动
 *
 * distance 使用设计稿坐标。
 */
export function movePoint(
  point: Point,
  direction: Direction,
  distance: number,
): Point {
  switch (direction) {
    case 'up':
      return {
        x: point.x,
        y: point.y - distance,
      }

    case 'right':
      return {
        x: point.x + distance,
        y: point.y,
      }

    case 'down':
      return {
        x: point.x,
        y: point.y + distance,
      }

    case 'left':
      return {
        x: point.x - distance,
        y: point.y,
      }
  }
}

/**
 * 自动路由
 */
export function buildAutoPoints(
  source: Point,
  target: Point,
  strategy: RouteStrategy,
): Point[] {
  if (samePoint(source, target)) {
    return [source]
  }

  // 已经在同一条垂直线上
  if (nearlyEqual(source.x, target.x)) {
    return [
      source,
      target,
    ]
  }

  // 已经在同一条水平线上
  if (nearlyEqual(source.y, target.y)) {
    return [
      source,
      target,
    ]
  }

  if (
    strategy ===
    'horizontal-first'
  ) {
    return [
      source,

      {
        x: target.x,
        y: source.y,
      },

      target,
    ]
  }

  return [
    source,

    {
      x: source.x,
      y: target.y,
    },

    target,
  ]
}

/**
 * B 模式。
 *
 * 执行手动路径。
 */
export function buildManualPoints(
  source: Point,
  target: Point,
  route: RouteStep[],
): Point[] {
  const points: Point[] = [
    { ...source },
  ]

  let current: Point = {
    ...source,
  }

  for (const step of route) {
    if ('direction' in step) {
      current = movePoint(
        current,
        step.direction,
        step.distance,
      )

      points.push(current)

      continue
    }

    if (
      step.align ===
      'target-x'
    ) {
      current = {
        x: target.x,
        y: current.y,
      }

      points.push(current)

      continue
    }

    if (
      step.align ===
      'target-y'
    ) {
      current = {
        x: current.x,
        y: target.y,
      }

      points.push(current)
    }
  }

  return points
}

/**
 * B 模式执行完人工路径后，
 * 自动完成剩下的部分。
 *
 * 返回值不包含 current，
 * 但包含 target。
 */
export function finishRoute(
  current: Point,
  target: Point,
  strategy: RouteStrategy,
): Point[] {
  if (
    samePoint(
      current,
      target,
    )
  ) {
    return []
  }

  if (
    nearlyEqual(
      current.x,
      target.x,
    ) ||
    nearlyEqual(
      current.y,
      target.y,
    )
  ) {
    return [
      {
        ...target,
      },
    ]
  }

  if (
    strategy ===
    'horizontal-first'
  ) {
    return [
      {
        x: target.x,
        y: current.y,
      },

      {
        ...target,
      },
    ]
  }

  return [
    {
      x: current.x,
      y: target.y,
    },

    {
      ...target,
    },
  ]
}

/**
 * 删除：
 *
 * 1. 重复点
 * 2. 同一直线上的中间点
 *
 * 比如：
 *
 * (100,100)
 * (100,200)
 * (100,300)
 *
 * 会变成：
 *
 * (100,100)
 * (100,300)
 */
export function normalizePoints(
  source: Point[],
): Point[] {
  let points: Point[] = []

  for (const point of source) {
    const previous =
      points[points.length - 1]

    if (
      !previous ||
      !samePoint(
        previous,
        point,
      )
    ) {
      points.push({
        ...point,
      })
    }
  }

  let changed = true

  while (
    changed &&
    points.length >= 3
  ) {
    changed = false

    for (
      let i = 1;
      i < points.length - 1;
      i++
    ) {
      const previous =
        points[i - 1]

      const current =
        points[i]

      const next =
        points[i + 1]

      const sameX =
        nearlyEqual(
          previous.x,
          current.x,
        ) &&
        nearlyEqual(
          current.x,
          next.x,
        )

      const sameY =
        nearlyEqual(
          previous.y,
          current.y,
        ) &&
        nearlyEqual(
          current.y,
          next.y,
        )

      if (
        sameX ||
        sameY
      ) {
        points.splice(
          i,
          1,
        )

        changed = true
        break
      }
    }
  }

  return points
}

function formatNumber(
  value: number,
) {
  return Number(
    value.toFixed(3),
  )
}

/**
 * Point[] 转成 SVG Path。
 *
 * 全部使用 M / L，
 * 所以一定是直线 + 90° 转折。
 */
export function pointsToPath(
  points: Point[],
): string {
  if (!points.length) {
    return ''
  }

  const [first, ...rest] =
    points

  return [
    `M ${formatNumber(first.x)} ${formatNumber(first.y)}`,

    ...rest.map(
      point =>
        `L ${formatNumber(point.x)} ${formatNumber(point.y)}`,
    ),
  ].join(' ')
}
