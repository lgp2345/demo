<script setup lang="ts">
import {
  computed,
  ref,
} from 'vue';

import {
  downloadBlob,
  exportLongPng,
} from '@/utils/long-png/exportLongPng';

const reportRef =
  ref<HTMLElement | null>(
    null,
  );

const exporting =
  ref(false);

const progress =
  ref(0);

const progressText =
  ref('');

let abortController:
  | AbortController
  | undefined;

const progressStyle =
  computed(() => ({
    width:
      `${progress.value}%`,
  }));

function formatFileSize(
  bytes: number,
) {
  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(2)} KB`;
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(2)} MB`;
}

async function handleExport() {
  if (
    !reportRef.value ||
    exporting.value
  ) {
    return;
  }

  exporting.value = true;

  progress.value = 0;

  progressText.value =
    '准备导出';

  abortController =
    new AbortController();

  try {
    const blob =
      await exportLongPng(
        reportRef.value,
        {
          /**
           * 你的场景建议一定先用 1。
           */
          scale: 1,

          /**
           * 可以不填写。
           *
           * 会根据像素预算
           * 自动计算。
           */
          // chunkHeight: 3000,

          /**
           * 单 Canvas 控制在
           * 约 800 万像素以内。
           */
          pixelBudget:
            8_000_000,

          backgroundColor:
            '#ffffff',

          useCORS: true,

          /**
           * 保持 1920
           * 设计稿 viewport。
           */
          windowWidth:
            1920,

          signal:
            abortController.signal,

          onProgress(
            info,
          ) {
            progress.value =
              Math.round(
                info.progress *
                  100,
              );

            switch (
              info.phase
            ) {
              case 'capture':
                progressText.value =
                  [
                    '正在截图',
                    `${info.current}/${info.total}`,
                  ].join(' ');

                break;

              case 'encode':
                progressText.value =
                  [
                    '正在压缩',
                    `${info.current}/${info.total}`,
                  ].join(' ');

                break;

              case 'done':
                progressText.value =
                  '导出完成';

                break;
            }
          },
        },
      );

    console.log(
      'PNG:',
      formatFileSize(
        blob.size,
      ),
    );

    downloadBlob(
      blob,
      `完整长图-${Date.now()}.png`,
    );
  } catch (error) {
    if (
      error instanceof
        DOMException &&
      error.name ===
        'AbortError'
    ) {
      progressText.value =
        '已取消';

      return;
    }

    console.error(
      '[export]',
      error,
    );

    progressText.value =
      '导出失败';

    alert(
      error instanceof Error
        ? error.message
        : '导出失败',
    );
  } finally {
    exporting.value =
      false;

    abortController =
      undefined;
  }
}

function handleCancel() {
  abortController?.abort();
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <button
        :disabled="exporting"
        @click="handleExport"
      >
        {{ exporting ? '导出中...' : '导出完整长图' }}
      </button>

      <button
        v-if="exporting"
        @click="handleCancel"
      >
        取消
      </button>

      <div
        v-if="exporting"
        class="progress"
      >
        <div class="progress-track">
          <div
            class="progress-value"
            :style="progressStyle"
          />
        </div>

        <div>
          {{ progressText }}
          {{ progress }}%
        </div>
      </div>
    </div>

    <!--
      最好截图的是原始设计尺寸节点，
      不要截图外层 transform scale 容器。
    -->
    <div
      ref="reportRef"
      class="report"
    >
      <div
        v-for="index in 800"
        :key="index"
        class="row"
      >
        第 {{ index }} 行内容

        <strong>
          Vue3 超长图片导出测试
        </strong>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  background: #eee;
}

.toolbar {
  position: sticky;
  top: 0;
  z-index: 1000;

  display: flex;
  align-items: center;
  gap: 12px;

  padding: 12px;

  background: white;
}

.progress {
  width: 300px;
}

.progress-track {
  width: 100%;
  height: 8px;

  overflow: hidden;

  background: #ddd;
  border-radius: 4px;
}

.progress-value {
  height: 100%;

  background: #333;

  transition: width 0.2s;
}

.report {
  width: 1920px;

  box-sizing: border-box;

  background: white;
}

.row {
  height: 100px;

  box-sizing: border-box;

  padding: 20px;

  border-bottom:
    1px solid #ddd;

  font-size: 24px;
}
</style>