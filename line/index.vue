<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowReactive,
} from 'vue'

import RelationLines from './RelationLines.vue'

import type {
  Relation,
} from './types'

const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1250

interface CardItem {
  id: string
  label: string

  x: number
  y: number

  width: number
  height: number

  type:
    | 'small'
    | 'large'
}

const boardRef =
  ref<HTMLElement | null>(
    null,
  )

const viewportRef =
  ref<HTMLElement | null>(
    null,
  )

const relationLinesRef =
  ref<InstanceType<
    typeof RelationLines
  > | null>(null)

/**
 * 不使用 reactive，
 * 避免 Vue 深度代理 HTMLElement。
 */
const nodeElements =
  shallowReactive<
    Record<
      string,
      HTMLElement | undefined
    >
  >({})

const selectedNodeId =
  ref<string | null>(null)

/**
 * Demo 用。
 *
 * 你实际项目如果已经有 autofit / scale，
 * 可以把这里整个缩放逻辑删掉。
 */
const scale = ref(1)

let viewportObserver:
  | ResizeObserver
  | null = null

const cards: CardItem[] = [
  /**
   * 左边 5 个小卡片
   */
  {
    id: 'L1',
    label: '左侧 1',
    x: 70,
    y: 80,
    width: 230,
    height: 110,
    type: 'small',
  },

  {
    id: 'L2',
    label: '左侧 2',
    x: 70,
    y: 310,
    width: 230,
    height: 110,
    type: 'small',
  },

  {
    id: 'L3',
    label: '左侧 3',
    x: 70,
    y: 540,
    width: 230,
    height: 110,
    type: 'small',
  },

  {
    id: 'L4',
    label: '左侧 4',
    x: 70,
    y: 770,
    width: 230,
    height: 110,
    type: 'small',
  },

  {
    id: 'L5',
    label: '左侧 5',
    x: 70,
    y: 1000,
    width: 230,
    height: 110,
    type: 'small',
  },

  /**
   * 中间 6 个大卡片
   */
  {
    id: 'C1',
    label: '中间大卡片 1',
    x: 620,
    y: 40,
    width: 680,
    height: 120,
    type: 'large',
  },

  {
    id: 'C2',
    label: '中间大卡片 2',
    x: 620,
    y: 240,
    width: 680,
    height: 120,
    type: 'large',
  },

  {
    id: 'C3',
    label: '中间大卡片 3',
    x: 620,
    y: 440,
    width: 680,
    height: 120,
    type: 'large',
  },

  {
    id: 'C4',
    label: '中间大卡片 4',
    x: 620,
    y: 640,
    width: 680,
    height: 120,
    type: 'large',
  },

  {
    id: 'C5',
    label: '中间大卡片 5',
    x: 620,
    y: 840,
    width: 680,
    height: 120,
    type: 'large',
  },

  {
    id: 'C6',
    label: '中间大卡片 6',
    x: 620,
    y: 1040,
    width: 680,
    height: 120,
    type: 'large',
  },

  /**
   * 右边 5 个小卡片
   */
  {
    id: 'R1',
    label: '右侧 1',
    x: 1620,
    y: 80,
    width: 230,
    height: 110,
    type: 'small',
  },

  {
    id: 'R2',
    label: '右侧 2',
    x: 1620,
    y: 310,
    width: 230,
    height: 110,
    type: 'small',
  },

  {
    id: 'R3',
    label: '右侧 3',
    x: 1620,
    y: 540,
    width: 230,
    height: 110,
    type: 'small',
  },

  {
    id: 'R4',
    label: '右侧 4',
    x: 1620,
    y: 770,
    width: 230,
    height: 110,
    type: 'small',
  },

  {
    id: 'R5',
    label: '右侧 5',
    x: 1620,
    y: 1000,
    width: 230,
    height: 110,
    type: 'small',
  },
]

/**
 * 关系配置。
 *
 * ------------------------------------------------
 *
 * 重点：
 *
 * distance 永远按 1920 × 1250
 * 设计稿坐标填写。
 *
 * scale 不参与计算。
 *
 * ------------------------------------------------
 */
const relations: Relation[] = [
  /**
   * A 模式
   *
   * L1 ────── C1
   */
  {
    id: 'L1-C1',

    source: 'L1',
    target: 'C1',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'auto',

    strategy:
      'horizontal-first',
  },

  /**
   * B 模式
   *
   * 人工控制先右，再下。
   */
  {
    id: 'L1-C3',

    source: 'L1',
    target: 'C3',

    sourceSide: 'right',
    targetSide: 'left',

    sourceGap: 35,
    targetGap: 35,

    mode: 'manual',

    route: [
      {
        direction: 'right',
        distance: 140,
      },

      {
        direction: 'down',
        distance: 210,
      },

      {
        align: 'target-y',
      },
    ],

    finishStrategy:
      'horizontal-first',
  },

  {
    id: 'L2-C2',

    source: 'L2',
    target: 'C2',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'auto',

    strategy:
      'horizontal-first',
  },

  /**
   * L3 同时关联 C2、C4。
   *
   * 点击 L3 时，
   * 两根线会自动把连接点错开。
   */
  {
    id: 'L3-C2',

    source: 'L3',
    target: 'C2',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'manual',

    route: [
      {
        direction: 'right',
        distance: 180,
      },

      {
        direction: 'up',
        distance: 120,
      },

      {
        align: 'target-y',
      },
    ],

    finishStrategy:
      'horizontal-first',
  },

  {
    id: 'L3-C4',

    source: 'L3',
    target: 'C4',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'auto',

    strategy:
      'vertical-first',
  },

  {
    id: 'L4-C5',

    source: 'L4',
    target: 'C5',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'auto',

    strategy:
      'vertical-first',
  },

  {
    id: 'L5-C6',

    source: 'L5',
    target: 'C6',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'manual',

    route: [
      {
        direction: 'right',
        distance: 160,
      },

      {
        direction: 'down',
        distance: 70,
      },

      {
        align: 'target-y',
      },
    ],

    finishStrategy:
      'horizontal-first',
  },

  /**
   * 中间 → 右边
   */
  {
    id: 'C1-R2',

    source: 'C1',
    target: 'R2',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'auto',

    strategy:
      'vertical-first',
  },

  /**
   * C2 同时连接 R1 / R3。
   *
   * 点击 C2 时能明显看到
   * 多线错开。
   */
  {
    id: 'C2-R1',

    source: 'C2',
    target: 'R1',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'manual',

    route: [
      {
        direction: 'right',
        distance: 160,
      },

      {
        direction: 'up',
        distance: 100,
      },

      {
        align: 'target-y',
      },
    ],

    finishStrategy:
      'horizontal-first',
  },

  {
    id: 'C2-R3',

    source: 'C2',
    target: 'R3',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'auto',

    strategy:
      'vertical-first',
  },

  {
    id: 'C3-R2',

    source: 'C3',
    target: 'R2',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'manual',

    route: [
      {
        direction: 'right',
        distance: 210,
      },

      {
        direction: 'up',
        distance: 130,
      },

      {
        align: 'target-y',
      },
    ],

    finishStrategy:
      'horizontal-first',
  },

  {
    id: 'C4-R4',

    source: 'C4',
    target: 'R4',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'auto',

    strategy:
      'vertical-first',
  },

  {
    id: 'C5-R4',

    source: 'C5',
    target: 'R4',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'manual',

    route: [
      {
        direction: 'right',
        distance: 190,
      },

      {
        direction: 'up',
        distance: 90,
      },

      {
        align: 'target-y',
      },
    ],

    finishStrategy:
      'horizontal-first',
  },

  {
    id: 'C6-R5',

    source: 'C6',
    target: 'R5',

    sourceSide: 'right',
    targetSide: 'left',

    mode: 'auto',

    strategy:
      'horizontal-first',
  },
]

function setNodeRef(
  id: string,
  element: unknown,
) {
  if (
    element instanceof
    HTMLElement
  ) {
    nodeElements[id] =
      element

    return
  }

  delete nodeElements[id]
}

function handleCardClick(
  id: string,
) {
  /**
   * 再次点击当前卡片：
   * 隐藏所有线
   */
  if (
    selectedNodeId.value ===
    id
  ) {
    selectedNodeId.value =
      null

    return
  }

  selectedNodeId.value =
    id
}

function getCardStyle(
  card: CardItem,
) {
  return {
    left:
      `${card.x}px`,

    top:
      `${card.y}px`,

    width:
      `${card.width}px`,

    height:
      `${card.height}px`,
  }
}

/**
 * Demo 的 scale。
 *
 * 你的项目如果自己已经有
 * scale 逻辑，可以全部删除。
 */
function updateScale() {
  const viewport =
    viewportRef.value

  if (!viewport) {
    return
  }

  const width =
    viewport.clientWidth

  scale.value =
    Math.min(
      1,
      width /
        DESIGN_WIDTH,
    )
}

/**
 * transform 后的外层实际尺寸。
 *
 * 这样不会出现：
 *
 * 子元素已经 scale 了，
 * 父元素还保留 1250px 高度。
 */
const scaledContainerStyle =
  computed(() => ({
    width:
      `${DESIGN_WIDTH * scale.value}px`,

    height:
      `${DESIGN_HEIGHT * scale.value}px`,
  }))

const boardStyle =
  computed(() => ({
    width:
      `${DESIGN_WIDTH}px`,

    height:
      `${DESIGN_HEIGHT}px`,

    transform:
      `scale(${scale.value})`,

    transformOrigin:
      '0 0',
  }))

const selectedLabel =
  computed(() => {
    if (
      !selectedNodeId.value
    ) {
      return '未选择'
    }

    return (
      cards.find(
        item =>
          item.id ===
          selectedNodeId.value,
      )?.label ??
      selectedNodeId.value
    )
  })

onMounted(() => {
  updateScale()

  viewportObserver =
    new ResizeObserver(
      updateScale,
    )

  if (
    viewportRef.value
  ) {
    viewportObserver.observe(
      viewportRef.value,
    )
  }
})

onBeforeUnmount(() => {
  viewportObserver?.disconnect()

  viewportObserver = null
})
</script>

<template>
  <div class="demo-page">
    <div class="demo-header">
      <span>
        当前：
        {{ selectedLabel }}
      </span>

      <span>
        Scale：
        {{ scale.toFixed(3) }}
      </span>

      <span>
        点击卡片显示关联线路，
        再次点击隐藏
      </span>
    </div>

    <div
      ref="viewportRef"
      class="board-viewport"
    >
      <!--
        scale() 本身不会改变布局占位，
        所以额外使用这一层维护
        scale 后真正的宽高。
      -->
      <div
        class="scaled-container"
        :style="
          scaledContainerStyle
        "
      >
        <div
          ref="boardRef"
          class="relation-board"
          :style="
            boardStyle
          "
        >
          <!--
            SVG 放卡片下面
          -->
          <RelationLines
            ref="relationLinesRef"
            :board="boardRef"
            :nodes="nodeElements"
            :relations="relations"
            :selected-node-id="
              selectedNodeId
            "
            :design-width="
              DESIGN_WIDTH
            "
            :design-height="
              DESIGN_HEIGHT
            "
            :port-gap="20"
            :default-gap="35"
            stroke="#4d8dff"
            dot-color="#a9c8ff"
            :stroke-width="3"
            :dot-radius="6"
            :dot-duration="2.8"
            :keep-stroke-width="
              false
            "
          />

          <button
            v-for="card in cards"
            :key="card.id"
            :ref="
              el =>
                setNodeRef(
                  card.id,
                  el,
                )
            "
            type="button"
            class="board-card"
            :class="[
              `board-card--${card.type}`,

              {
                'board-card--selected':
                  selectedNodeId ===
                  card.id,
              },
            ]"
            :style="
              getCardStyle(
                card,
              )
            "
            @click="
              handleCardClick(
                card.id,
              )
            "
          >
            <span
              class="card-id"
            >
              {{ card.id }}
            </span>

            <span>
              {{ card.label }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-page {
  width: 100%;

  box-sizing:
    border-box;
}

.demo-header {
  display: flex;

  align-items: center;

  gap: 24px;

  flex-wrap: wrap;

  margin-bottom: 16px;

  font-size: 14px;

  color: #64748b;
}

.board-viewport {
  width: 100%;

  overflow: auto;

  background: #08101e;

  border-radius: 12px;
}

/**
 * 占据 scale 后真实尺寸。
 */
.scaled-container {
  position: relative;
}

.relation-board {
  position: relative;

  overflow: hidden;

  background:
    linear-gradient(
      180deg,
      #101c31,
      #08111f
    );

  /**
   * 这一层就是整个
   * 1920 × 1250
   * 设计稿世界。
   */
}

.board-card {
  position: absolute;

  z-index: 2;

  display: flex;

  flex-direction: column;

  align-items: center;
  justify-content: center;

  gap: 8px;

  padding: 0;

  color: #dce9ff;

  background:
    rgba(
      20,
      42,
      70,
      0.92
    );

  border:
    2px solid
    rgba(
      101,
      146,
      205,
      0.55
    );

  border-radius: 10px;

  cursor: pointer;

  box-sizing:
    border-box;

  font-size: 22px;

  transition:
    border-color 0.2s,
    background 0.2s;
}

.board-card:hover {
  border-color:
    #75a7ff;
}

.board-card--selected {
  background:
    rgba(
      44,
      91,
      157,
      0.95
    );

  border-color:
    #8db6ff;
}

.board-card--small {
  font-size: 20px;
}

.board-card--large {
  font-size: 24px;
}

.card-id {
  font-size: 14px;

  color: #8ca8cc;

  letter-spacing: 1px;
}
</style>
