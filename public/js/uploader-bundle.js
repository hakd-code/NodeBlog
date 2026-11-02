// 上传组件桥接：把 ESM 的 Uploader / sha256Hex 暴露给非模块脚本使用
// （纯 JS SHA-256 不依赖 crypto.subtle，HTTP + IP 等非安全上下文也能算指纹）
import { Uploader } from './uploader.mjs';
import { sha256Hex } from './sha256.mjs';

window.BlogUploader = Uploader;
window.sha256Hex = sha256Hex;
