import { shell, clipboard } from 'electron'


/**
 * 在资源管理器中打开目录
 * @param {string} dir
 */
export const openDirInExplorer = (dir: string) => {
  shell.showItemInFolder(dir)
}


/**
 * 在浏览器打开URL
 * @param {*} url
 */
export const openUrl = async(url: string) => {
  if (!/^https?:\/\//.test(url)) return
  await shell.openExternal(url)
}


/**
 * 复制文本到剪贴板
 * @param str
 */
export const clipboardWriteText = (str: string) => {
  clipboard.writeText(str)
}

/**
 * 从剪贴板读取文本
 * @returns
 */
export const clipboardReadText = (): string => {
  return clipboard.readText()
}


export const encodePath = (path: string) => {
  // https://github.com/lyswhut/lx-music-desktop/issues/963
  // https://github.com/lyswhut/lx-music-desktop/issues/1461
  return path.replaceAll('%', '%25').replaceAll('#', '%23')
}

/**
 * 将本地绝对路径转换为可被 audio.src 直接加载的 file:// URL。
 * - 跨平台归一化分隔符（Windows 反斜杠 -> 正斜杠）
 * - 完整 encodeURI 编码（处理空格、中文、?、&、+、#、% 等）
 * - 补齐 file:// 协议前缀
 *
 * 统一替代原先 download.ts 直接返回原始路径、local.ts 仅调用 encodePath 的不一致做法。
 * 见审查场景 F / E3：路径含 #、?、% 或跨平台分隔符不一致会导致 audio 加载失败，
 * 进而被 usePlayEvent 当作 URL 失效而走在线请求。
 */
export const toFileUrl = (localPath: string): string => {
  if (!localPath) return ''
  // 1) 归一化分隔符
  let normalized = localPath.replaceAll('\\', '/')
  // 2) Windows 盘符前补 /（如 C:/... -> /C:/...），符合 file:///C:/... 形式
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = '/' + normalized
  }
  // 3) encodeURI 完整编码（保留 : / 用于路径分隔）
  const encoded = encodeURI(normalized)
  return 'file://' + encoded
}
