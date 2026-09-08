<script setup lang="ts">
import {
  ref,
} from 'vue';

import {
  downloadBlob,
  exportLongPng,
} from '@/utils/long-png/exportLongPng';

const reportRef =
  ref<HTMLElement>();

const exporting =
  ref(false);

const progress =
  ref(0);

const progressText =
  ref('');

let controller:
  | AbortController
  | undefined;

async function handleExport() {
  if (!reportRef.value) {
    return;
  }

  exporting.value = true;

  progress.value = 0;

  controller =
    new AbortController();

  try {
    const blob =
      await exportLongPng(
        reportRef.value,
        {
          /**
           * 强烈建议 1。
           */
          scale: 1,

          /**
           * 可以不传，
           * 让程序自动计算。
           */
          // chunkHeight: 2000,

          /**
           * 速度 / 文件大小
           * 比较好的平衡。
           */
          compressionLevel: 3,

          backgroundColor:
            '#ffffff',

          useCORS: true,

          signal:
            controller.signal,

          onProgress(info) {
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
                  `正在截图 ${info.current}/${info.total}`;

                break;

              case 'encode':
                progressText.value =
                  `正在编码 ${info.current}/${info.total}`;

                break;

              case 'done':
                progressText.value =
                  '导出完成';

                break;
            }
          },
        },
      );

    /**
     * 最终只有一张 PNG。
     */
    downloadBlob(
      blob,
      '完整长图.png',
    );
  } catch (error) {
    if (
      error instanceof
        DOMException &&
      error.name ===
        'AbortError'
    ) {
      console.log(
        '导出已取消',
      );

      return;
    }

    console.error(
      error,
    );

    alert(
      error instanceof Error
        ? error.message
        : '导出失败',
    );
  } finally {
    exporting.value =
      false;

    controller =
      undefined;
  }
}

function handleCancel() {
  controller?.abort();
}
</script>

<template>
  <div>
    <div
      style="
        position: sticky;
        top: 0;
        z-index: 100;
        padding: 12px;
        background: white;
      "
    >
      <button
        :disabled="exporting"
        @click="handleExport"
      >
        导出完整长图
      </button>

      <button
        v-if="exporting"
        @click="handleCancel"
      >
        取消
      </button>

      <span
        v-if="exporting"
        style="margin-left: 12px"
      >
        {{ progressText }}
        {{ progress }}%
      </span>
    </div>

    <div
      ref="reportRef"
      style="
        width: 1920px;
        background: white;
      "
    >
      <!--
        这里放你的超长页面。

        即使最终高度：

        50000px
        70000px
        100000px

        都不会创建对应高度 Canvas。
      -->

      <div
        v-for="index in 1000"
        :key="index"
        style="
          height: 100px;
          border-bottom:
            1px solid #ddd;
          padding: 20px;
          box-sizing:
            border-box;
        "
      >
        第 {{ index }} 行内容
      </div>
    </div>
  </div>
</template>