import { ref, computed } from 'vue';

// 假设这是你从后端获取的原始数据
const rawPlans = [
  { id: 1, type: 'point', time: '2026-04-15', name: '需求评审' },
  { id: 2, type: 'range', startTime: '2026-04-10', endTime: '2026-04-20', name: '核心开发' },
  { id: 3, type: 'point', time: '2026-04-18', name: 'UI走查' }
];

// 配置项
const MONTH_WIDTH = 260; // 每月260px
const DAY_WIDTH = MONTH_WIDTH / 30; // 粗略计算每天的像素宽度
const NODE_HEIGHT = 40; // 每个轨道的高度 (包含节点本身高度和上下间距)
const MIN_GAP = 10; // 两个节点之间的最小安全像素间距

export function useTimelineLayout() {
  // 1. 数据预处理：计算每个节点的物理尺寸坐标
  const computeNodeBounds = () => {
    // 这里的基准时间视你的具体需求而定
    const baseTimestamp = new Date('2026-04-01').getTime(); 

    return rawPlans.map(plan => {
      let left = 0;
      let width = 0;

      if (plan.type === 'point') {
        const timeDiff = new Date(plan.time).getTime() - baseTimestamp;
        left = (timeDiff / (1000 * 60 * 60 * 24)) * DAY_WIDTH;
        // 估算文字宽度 (文字长度 * 字体大小 + 左右padding)
        // 也可以在挂载后通过 ref 获取真实 DOM 宽度再重新计算
        width = plan.name.length * 14 + 20; 
      } else {
        const startDiff = new Date(plan.startTime).getTime() - baseTimestamp;
        const endDiff = new Date(plan.endTime).getTime() - baseTimestamp;
        left = (startDiff / (1000 * 60 * 60 * 24)) * DAY_WIDTH;
        const calcWidth = ((endDiff - startDiff) / (1000 * 60 * 60 * 24)) * DAY_WIDTH;
        const textWidth = plan.name.length * 14 + 20;
        // 宽度取时间跨度和文字宽度的最大值，防止文字溢出重叠
        width = Math.max(calcWidth, textWidth); 
      }

      return {
        ...plan,
        left,
        width,
        right: left + width,
        top: 0 // 待计算
      };
    });
  };

  // 2. 核心算法：轨道分配
  const calculateLayout = () => {
    const nodes = computeNodeBounds();
    
    // 按 left 从左到右排序
    nodes.sort((a, b) => a.left - b.left);

    // 记录每条轨道当前最右侧被占据的坐标
    // 数组的索引代表轨道层级 (Y轴)，值代表该轨道最后被占用的 X 坐标
    const tracks = [];

    nodes.forEach(node => {
      let assignedTrackIndex = -1;

      // 从上到下遍历已有轨道，寻找能放下的位置
      for (let i = 0; i < tracks.length; i++) {
        // 如果当前轨道的右边缘 + 最小间距 <= 当前节点的左边缘
        if (tracks[i] + MIN_GAP <= node.left) {
          assignedTrackIndex = i;
          break; // 找到合适轨道，退出循环
        }
      }

      // 如果所有已有轨道都被占用了，开辟一条新轨道
      if (assignedTrackIndex === -1) {
        assignedTrackIndex = tracks.length;
        tracks.push(0); // 初始化新轨道的右边缘
      }

      // 更新该节点的 Y 轴坐标 (top)
      node.top = assignedTrackIndex * NODE_HEIGHT;
      
      // 更新该轨道最右侧边界坐标
      tracks[assignedTrackIndex] = node.right;
    });

    return nodes;
  };

  const layoutNodes = computed(() => calculateLayout());

  return { layoutNodes };
}
<template>
  <div class="timeline-container">
    <div 
      v-for="node in layoutNodes" 
      :key="node.id"
      class="node"
      :class="node.type"
      :style="{
        left: `${node.left}px`,
        top: `${node.top}px`,
        width: `${node.width}px` // 针对时间段设置固定宽度
      }"
    >
      {{ node.name }}
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  position: relative;
  /* 容器高度可根据最大 track 数量动态计算，或者设置 min-height */
}
.node {
  position: absolute;
  /* ...你的其他样式 */
}
</style>
