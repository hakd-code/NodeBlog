// 文件真实类型嗅探（magic number）
// 图片白名单：jpg/png/webp/gif/avif；媒体与附件白名单：mp4/zip/rar/7z
export const MIME_MAP = {
  jpeg: { mime: 'image/jpeg', ext: '.jpg', kind: 'image' },
  png: { mime: 'image/png', ext: '.png', kind: 'image' },
  webp: { mime: 'image/webp', ext: '.webp', kind: 'image' },
  gif: { mime: 'image/gif', ext: '.gif', kind: 'image' },
  avif: { mime: 'image/avif', ext: '.avif', kind: 'image' },
  mp4: { mime: 'video/mp4', ext: '.mp4', kind: 'video' },
  zip: { mime: 'application/zip', ext: '.zip', kind: 'file' },
  rar: { mime: 'application/vnd.rar', ext: '.rar', kind: 'file' },
  '7z': { mime: 'application/x-7z-compressed', ext: '.7z', kind: 'file' },
};

/** 返回 { mime, ext, kind } 或 null（不在白名单） */
export function sniff(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return MIME_MAP.jpeg;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return MIME_MAP.png;
  if (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') return MIME_MAP.gif;
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return MIME_MAP.webp;
  if (b.toString('ascii', 4, 8) === 'ftyp') {
    const brand = b.toString('ascii', 8, 12);
    if (brand.startsWith('avif') || brand.startsWith('avis')) return MIME_MAP.avif;
    // mp4 家族：isom / mp42 / mp41 / M4V 等
    if (/^(isom|mp41|mp42|M4V |iso2|avc1)/.test(brand)) return MIME_MAP.mp4;
  }
  // ZIP（含 docx/xlsx 等衍生格式首部一致，这里仅接受 .zip 场景）
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) return MIME_MAP.zip;
  // RAR: "Rar!\x1a\x07"
  if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 && b[4] === 0x1a && b[5] === 0x07) return MIME_MAP.rar;
  // 7z: 37 7A BC AF 27 1C
  if (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf && b[4] === 0x27 && b[5] === 0x1c) return MIME_MAP['7z'];

  return null;
}
