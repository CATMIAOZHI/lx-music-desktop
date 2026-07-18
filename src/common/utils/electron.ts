import { shell, clipboard } from 'electron'
import { pathToFileURL } from 'node:url'


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
 *
 * 使用 Node.js 标准 pathToFileURL 实现，正确处理：
 * - Windows 盘符 / UNC 路径
 * - 跨平台分隔符归一化
 * - 所有需转义的特殊字符（#、?、%、空格、中文等）
 *
 * 不能用 encodeURI 手动拼接，因为 encodeURI 会保留 # 和 ?，
 * 导致 file:///C:/Music/a#b.mp3 的 #b.mp3 被解析为 URL fragment，
 * 实际加载路径只剩 C:/Music/a。Node 官方文档以 /foo#1 为例说明
 * pathToFileURL 会正确生成 %23。
 *
 * 统一替代原先 download.ts 直接返回原始路径、local.ts 仅调用 encodePath 的不一致做法。
 * 见审查场景 F / E3。
 */
export const toFileUrl = (localPath: string): string => {
  return localPath ? pathToFileURL(localPath).href : ''
}
