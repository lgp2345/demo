<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'

import {
  buildAutoPoints,
  buildManualPoints,
  finishRoute,
  movePoint,
  normalizePoints,
  pointsToPath,
  sideToDirection,
} from './route'

import type {
  Point,
  Relation,
  Side,
} from './types'

interface Props {
  /**
   * 整个看板 DOM
   */
  board: HTMLElement | null

  /**
   * 卡片 DOM Map
   */
  nodes: Record<
    string,
    HTMLElement | undefined
  >

  relations: Relation[]

  /**
   * 当前选中的卡片 ID
   *
   * null = 不显示任何线
   */
  selectedNodeId: string | null

  /**
   * 设计稿尺寸
   */
  designWidth?: number
  designHeight?: number

  /**
   * 同一边出现多个连接点时，
   * 相互错开的距离。
   *
   * 设计稿坐标。
   */
  portGap?: number

  /**
   * 默认卡片出线距离
   */
  defaultGap?: number

  stroke?: string
  strokeWidth?: number

  dotColor?: string
  dotRadius?: number

  /**
   * 秒
   */
  dotDuration?: number

  /**
   * true:
   * 页面 scale 后线宽仍保持视觉宽度。
   *
   * false:
   * 线宽跟着看板一起缩放。
   */
  keepStrokeWidth?: boolean
}

const props = withDefaults(
  defineProps<Props>(),
  {
    designWidth: 1920,
    designHeight: 1250,

    portGap: 18,

    defaultGap: 30,

    stroke: '#4f8cff',
    strokeWidth: 3,

    dotColor: '#9dc1ff',
    dotRadius: 6,

    dotDuration: 2.8,

    keepStrokeWidth: false,
  },
)

interface RenderedLine {
  id: string
  d: string

  duration: number
  strokeWidth: number
  dotRadius: number

  begin: string
}

const svgRef =
  ref<SVGSVGElement | null>(
    null,
  )

const renderedLines =
  ref<RenderedLine[]>([])

let resizeObserver:
  | ResizeObserver
  | null = null

let frameId = 0

const viewBox = computed(
  () =>
    `0 0 ${props.designWidth} ${props.designHeight}`,
)

/**
 * 默认不显示任何关系。
 *
 * 点击卡片以后，
 * 只显示和这个卡片有关系的线路。
 */
const visibleRelations =
  computed(() => {
    if (
      !props.selectedNodeId
    ) {
      return []
    }

    return props.relations.filter(
      relation =>
        relation.source ===
          props.selectedNodeId ||
        relation.target ===
          props.selectedNodeId,
    )
  })

/**
 * 浏览器坐标 → SVG 设计稿坐标。
 *
 * 这是兼容 transform: scale()
 * 最关键的地方。
 */
function clientPointToSvg(
  clientX: number,
  clientY: number,
): Point | null {
  const svg =
    svgRef.value

  if (!svg) {
    return null
  }

  const matrix =
    svg.getScreenCTM()

  if (!matrix) {
    return null
  }

  const point =
    svg.createSVGPoint()

  point.x = clientX
  point.y = clientY

  const result =
    point.matrixTransform(
      matrix.inverse(),
    )

  return {
    x: result.x,
    y: result.y,
  }
}

/**
 * 获取卡片四个方向的中心锚点。
 */
function getAnchorPoint(
  element: HTMLElement,
  side: Side,
): Point | null {
  const rect =
    element.getBoundingClientRect()

  let clientX = 0
  let clientY = 0

  switch (side) {
    case 'top':
      clientX =
        rect.left +
        rect.width / 2

      clientY =
        rect.top

      break

    case 'right':
      clientX =
        rect.right

      clientY =
        rect.top +
        rect.height / 2

      break

    case 'bottom':
      clientX =
        rect.left +
        rect.width / 2

      clientY =
        rect.bottom

      break

    case 'left':
      clientX =
        rect.left

      clientY =
        rect.top +
        rect.height / 2

      break
  }

  return clientPointToSvg(
    clientX,
    clientY,
  )
}

/**
 * 同一个卡片同一个方向有多根线时，
 * 自动错开连接点。
 *
 * top / bottom:
 * 左右错开
 *
 * left / right:
 * 上下错开
 */
function offsetAnchor(
  point: Point,
  side: Side,
  offset: number,
): Point {
  if (
    side === 'top' ||
    side === 'bottom'
  ) {
    return {
      x:
        point.x +
        offset,

      y: point.y,
    }
  }

  return {
    x: point.x,

    y:
      point.y +
      offset,
  }
}

interface RelationOffsets {
  source: number
  target: number
}

interface Endpoint {
  relationId: string

  type:
    | 'source'
    | 'target'
}

/**
 * 计算同一个 Port 上多根线的偏移。
 */
function buildPortOffsets(
  relations: Relation[],
): Map<
  string,
  RelationOffsets
> {
  const result =
    new Map<
      string,
      RelationOffsets
    >()

  const groups =
    new Map<
      string,
      Endpoint[]
    >()

  for (
    const relation of relations
  ) {
    result.set(
      relation.id,
      {
        source: 0,
        target: 0,
      },
    )

    const sourceKey =
      `${relation.source}:${relation.sourceSide}`

    const targetKey =
      `${relation.target}:${relation.targetSide}`

    const sourceGroup =
      groups.get(
        sourceKey,
      ) ?? []

    sourceGroup.push({
      relationId:
        relation.id,

      type: 'source',
    })

    groups.set(
      sourceKey,
      sourceGroup,
    )

    const targetGroup =
      groups.get(
        targetKey,
      ) ?? []

    targetGroup.push({
      relationId:
        relation.id,

      type: 'target',
    })

    groups.set(
      targetKey,
      targetGroup,
    )
  }

  for (
    const endpoints
    of groups.values()
  ) {
    endpoints.sort(
      (a, b) =>
        a.relationId.localeCompare(
          b.relationId,
        ),
    )

    const center =
      (endpoints.length - 1) /
      2

    endpoints.forEach(
      (
        endpoint,
        index,
      ) => {
        const offset =
          (index - center) *
          props.portGap

        const item =
          result.get(
            endpoint.relationId,
          )

        if (!item) {
          return
        }

        item[
          endpoint.type
        ] = offset
      },
    )
  }

  return result
}

/**
 * 根据 Relation 生成最终 Point[]。
 */
function buildRelationPoints(
  relation: Relation,
  offsets: RelationOffsets,
): Point[] | null {
  const sourceElement =
    props.nodes[
      relation.source
    ]

  const targetElement =
    props.nodes[
      relation.target
    ]

  if (
    !sourceElement ||
    !targetElement
  ) {
    return null
  }

  const rawSource =
    getAnchorPoint(
      sourceElement,
      relation.sourceSide,
    )

  const rawTarget =
    getAnchorPoint(
      targetElement,
      relation.targetSide,
    )

  if (
    !rawSource ||
    !rawTarget
  ) {
    return null
  }

  /**
   * 多线错开后的真实锚点。
   */
  const sourceAnchor =
    offsetAnchor(
      rawSource,
      relation.sourceSide,
      offsets.source,
    )

  const targetAnchor =
    offsetAnchor(
      rawTarget,
      relation.targetSide,
      offsets.target,
    )

  /**
   * 卡片外面的第一个点。
   */
  const sourceOut =
    movePoint(
      sourceAnchor,

      sideToDirection(
        relation.sourceSide,
      ),

      relation.sourceGap ??
        props.defaultGap,
    )

  /**
   * target 卡片外面的最后一个点。
   */
  const targetIn =
    movePoint(
      targetAnchor,

      sideToDirection(
        relation.targetSide,
      ),

      relation.targetGap ??
        props.defaultGap,
    )

  let routePoints: Point[]

  /**
   * A 自动模式
   */
  if (
    relation.mode ===
    'auto'
  ) {
    routePoints =
      buildAutoPoints(
        sourceOut,
        targetIn,

        relation.strategy ??
          'horizontal-first',
      )
  }

  /**
   * B 手工 + 自动收尾模式
   */
  else {
    const manualPoints =
      buildManualPoints(
        sourceOut,
        targetIn,
        relation.route,
      )

    const current =
      manualPoints[
        manualPoints.length -
          1
      ] ?? sourceOut

    const finishPoints =
      finishRoute(
        current,
        targetIn,

        relation.finishStrategy ??
          'horizontal-first',
      )

    routePoints = [
      ...manualPoints,
      ...finishPoints,
    ]
  }

  return normalizePoints([
    sourceAnchor,

    ...routePoints,

    targetAnchor,
  ])
}

function rebuild() {
  frameId = 0

  if (
    !svgRef.value ||
    !props.board ||
    !props.selectedNodeId
  ) {
    renderedLines.value =
      []

    return
  }

  const relations =
    visibleRelations.value

  const offsets =
    buildPortOffsets(
      relations,
    )

  const lines:
    RenderedLine[] = []

  relations.forEach(
    (
      relation,
      index,
    ) => {
      const relationOffsets =
        offsets.get(
          relation.id,
        )

      if (
        !relationOffsets
      ) {
        return
      }

      const points =
        buildRelationPoints(
          relation,
          relationOffsets,
        )

      if (
        !points ||
        points.length < 2
      ) {
        return
      }

      const d =
        pointsToPath(
          points,
        )

      if (!d) {
        return
      }

      lines.push({
        id: relation.id,

        d,

        duration:
          relation.duration ??
          props.dotDuration,

        strokeWidth:
          relation.strokeWidth ??
          props.strokeWidth,

        dotRadius:
          relation.dotRadius ??
          props.dotRadius,

        /**
         * 使用负数 begin，
         * 可以让多根线的小球初始位置不完全同步。
         */
        begin:
          `-${index * 0.2}s`,
      })
    },
  )

  renderedLines.value =
    lines
}

/**
 * 避免 resize 时一帧执行很多次。
 */
function scheduleRebuild() {
  if (frameId) {
    cancelAnimationFrame(
      frameId,
    )
  }

  frameId =
    requestAnimationFrame(
      rebuild,
    )
}

/**
 * 监听卡片尺寸改变。
 */
function reconnectResizeObserver() {
  resizeObserver?.disconnect()

  resizeObserver =
    new ResizeObserver(
      () => {
        scheduleRebuild()
      },
    )

  if (props.board) {
    resizeObserver.observe(
      props.board,
    )
  }

  for (
    const element
    of Object.values(
      props.nodes,
    )
  ) {
    if (element) {
      resizeObserver.observe(
        element,
      )
    }
  }
}

watch(
  () =>
    props.selectedNodeId,

  async () => {
    await nextTick()

    scheduleRebuild()
  },
)

watch(
  () =>
    props.relations,

  async () => {
    await nextTick()

    scheduleRebuild()
  },

  {
    deep: true,
  },
)

/**
 * 卡片 DOM 出现、消失或替换。
 */
watch(
  () =>
    Object.values(
      props.nodes,
    ),

  async () => {
    await nextTick()

    reconnectResizeObserver()

    scheduleRebuild()
  },
)

onMounted(
  async () => {
    await nextTick()

    reconnectResizeObserver()

    scheduleRebuild()

    window.addEventListener(
      'resize',
      scheduleRebuild,
    )
  },
)

onBeforeUnmount(
  () => {
    resizeObserver?.disconnect()

    resizeObserver = null

    window.removeEventListener(
      'resize',
      scheduleRebuild,
    )

    if (frameId) {
      cancelAnimationFrame(
        frameId,
      )
    }
  },
)

/**
 * 如果你的卡片本身发生 transform / 动画，
 * 可以从父组件手动调用 refresh()。
 */
defineExpose({
  refresh:
    scheduleRebuild,
})
</script>

<template>
  <svg
    ref="svgRef"
    class="relation-lines"
    :viewBox="viewBox"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <g
      v-for="line in renderedLines"
      :key="`${line.id}:${line.d}`"
    >
      <path
        class="relation-path"
        :d="line.d"
        fill="none"
        :stroke="stroke"
        :stroke-width="
          line.strokeWidth
        "
        stroke-linecap="round"
        stroke-linejoin="miter"
        :vector-effect="
          keepStrokeWidth
            ? 'non-scaling-stroke'
            : undefined
        "
      />

      <circle
        class="relation-dot"
        :r="line.dotRadius"
        :fill="dotColor"
      >
        <animateMotion
          :path="line.d"
          :dur="
            `${line.duration}s`
          "
          :begin="line.begin"
          repeatCount="indefinite"
        />
      </circle>
    </g>
  </svg>
</template>

<style scoped>
.relation-lines {
  position: absolute;
  inset: 0;

  width: 100%;
  height: 100%;

  overflow: visible;

  pointer-events: none;

  z-index: 1;
}

.relation-path {
  opacity: 0.9;
}

.relation-dot {
  pointer-events: none;
}

@media (
  prefers-reduced-motion:
    reduce
) {
  .relation-dot {
    display: none;
  }
}
</style>
