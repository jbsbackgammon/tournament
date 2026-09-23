import { dimensions, renderBracket } from './render.js';

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function withDpi(png, dpi) {
  const bytes = new Uint8Array(png);
  const ppm = Math.round(dpi / .0254);
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
  view.setUint32(17, crc32(chunk.slice(4, 17)));
  const segments = [bytes.slice(0, 33), chunk];
  // Replace any existing pHYs rather than writing duplicate physical metadata.
  for (let pos = 33; pos < bytes.length;) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getUint32(0);
    const type = String.fromCharCode(...bytes.slice(pos + 4, pos + 8));
    if (type !== 'pHYs') segments.push(bytes.slice(pos, pos + length + 12));
    pos += length + 12;
  }
  const output = new Uint8Array(segments.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  segments.forEach(b => { output.set(b, offset); offset += b.length; });
  return output;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportPng(state, options) {
  await document.fonts.ready;
  const { width, height, dpi } = dimensions(options.format, options.orientation);
  const svg = renderBracket(state, options);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PNG出力に必要なCanvasを利用できません。');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNGを生成できませんでした。');
    return new Blob([withDpi(await blob.arrayBuffer(), dpi)], { type: 'image/png' });
  } finally { URL.revokeObjectURL(url); }
}
