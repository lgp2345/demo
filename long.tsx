async function exportLongPng(element: HTMLElement) {
  const width = element.scrollWidth;
  const totalHeight = element.scrollHeight;

  const chunkHeight = 3000;

  // 1. 创建 PNG encoder
  const encoder = createPngEncoder({
    width,
    height: totalHeight,
  });

  for (let y = 0; y < totalHeight; y += chunkHeight) {
    const height = Math.min(
      chunkHeight,
      totalHeight - y,
    );

    // 2. 只渲染当前区域
    const canvas = await html2canvas(element, {
      x: 0,
      y,
      width,
      height,

      scale: 1,

      useCORS: true,
      backgroundColor: '#fff',
    });

    // 3. 获取当前分片的 RGBA
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.getImageData(
      0,
      0,
      width,
      height,
    );

    // 4. 写入 PNG 流
    encoder.write({
      width,
      height,
      data: imageData.data,
    });

    // 5. 马上释放当前 canvas
    canvas.width = 0;
    canvas.height = 0;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  // 6. 完成 PNG
  return encoder.finish();
}