import { saveAs } from 'file-saver';
import { mimeMap } from '../constants/mime-map';

export function saveFile(fileData: Uint8Array, mimeType: string): string {
  const blob = new Blob([fileData.buffer as ArrayBuffer], { type: mimeType || 'application/octet-stream' });
  const ext = mimeMap[mimeType] || 'bin';
  const name = `output_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;

  // 检测是否为安卓/iOS App 环境
  const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

  if (isNative) {
    // 异步执行安卓保存逻辑，不阻塞页面 UI
    handleNativeSave(blob, ext, name).catch(err => {
      console.error('安卓保存失败，尝试回退到浏览器下载', err);
      saveAs(blob, name); // 保底策略
    });
    return name;
  }

  // 普通浏览器环境：保持原有逻辑不变
  saveAs(blob, name);
  return name;
}

// 独立的异步处理函数，仅在 App 环境下执行
async function handleNativeSave(blob: Blob, ext: string, name: string) {
  // 通过全局变量获取 Capacitor 插件（避免 Vite 打包时报错找不到模块）
  const plugins = (window as any).Capacitor?.Plugins;
  if (!plugins?.Filesystem || !plugins?.Share) {
    throw new Error('Capacitor plugins not loaded');
  }

  const { Filesystem, Directory, Share } = plugins;

  // 1. 将 Blob 转换为 Base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]); // 去掉 "data:image/png;base64," 前缀
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const fileName = `output_${Date.now()}.${ext}`;

  // 2. 将图片写入 App 的临时缓存目录（无需向安卓申请任何存储权限）
  await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: Directory.Cache,
  });

  // 3. 获取本地文件的真实路径
  const fileResult = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Cache,
  });

  // 4. 唤起安卓原生的“分享/保存”面板
  await Share.share({
    title: name,
    url: fileResult.uri,
  });
}
