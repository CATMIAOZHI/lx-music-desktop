import { describe, it, expect } from 'vitest'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { toFileUrl } from '../src/common/utils/fileUrl'

/**
 * toFileUrl 的核心职责：把本地绝对路径转换为 audio.src 可直接加载的 file:// URL，
 * 正确处理 # / ? / % / 空格 / 中文 / 跨平台分隔符 / UNC / Windows 盘符。
 *
 * 对应审查场景 F / E3：原实现 download.ts 直接返回原始路径、local.ts 仅 encodePath
 * （只转义 % 和 #），路径含 ? / 空格 / 中文时 audio 加载失败被当作 URL 失效走在线。
 * 第一轮修复用手动 encodeURI 仍漏掉 # 和 ?，第二轮改用 Node pathToFileURL。
 *
 * 注意：pathToFileURL 按当前进程平台解析路径。Windows 盘符 / UNC 路径仅在
 * Windows 平台能被识别为绝对路径，因此相关用例用 itWindows 守卫，
 * 避免 Ubuntu CI 上因路径被当作相对 POSIX 路径而断言失败。
 */
describe('toFileUrl', () => {
  it('空字符串返回空', () => {
    expect(toFileUrl('')).toBe('')
  })

  it('转义 # 避免 URL fragment 误解析', () => {
    const p = path.join(os.tmpdir(), 'a#b.mp3')
    expect(toFileUrl(p)).toBe(pathToFileURL(p).href)
    expect(toFileUrl(p)).not.toContain('#')
    expect(toFileUrl(p)).toMatch(/a%23b\.mp3$/)
  })

  it('转义 ? 避免 URL query 误解析', () => {
    const p = path.join(os.tmpdir(), 'a?b.mp3')
    expect(toFileUrl(p)).toBe(pathToFileURL(p).href)
    expect(toFileUrl(p)).not.toContain('?')
    expect(toFileUrl(p)).toMatch(/a%3Fb\.mp3$/)
  })

  it('转义 % 避免非法百分号编码', () => {
    const p = path.join(os.tmpdir(), '100%love', 'song.mp3')
    expect(toFileUrl(p)).toBe(pathToFileURL(p).href)
    expect(toFileUrl(p)).toMatch(/100%25love/)
  })

  it('编码中文与空格', () => {
    const p = path.join(os.tmpdir(), '中文 目录', 'song.mp3')
    const url = toFileUrl(p)
    expect(url).toBe(pathToFileURL(p).href)
    expect(url).not.toContain(' ')
    // 中文应被 percent-encode
    expect(/%E[0-9A-F]/.test(url)).toBe(true)
  })

  it('与 Node pathToFileURL 完全等价（随机特殊字符）', () => {
    const cases = [
      'a+b.mp3',
      'a&b.mp3',
      'a=b.mp3',
      'a b.mp3',
      'song (1).mp3',
      '100%love.mp3',
    ]
    for (const name of cases) {
      const p = path.join(os.tmpdir(), name)
      expect(toFileUrl(p)).toBe(pathToFileURL(p).href)
    }
  })

  // Windows 专用路径用例：pathToFileURL 仅在 win32 平台识别盘符 / UNC 路径。
  // Ubuntu CI 上这些字符串会被当作带反斜杠的相对 POSIX 路径，断言必然失败。
  // 改为矩阵 CI（ubuntu + windows）后，这些用例只在 windows-latest 上执行。
  const itWindows = process.platform === 'win32' ? it : it.skip

  itWindows('Windows 盘符路径生成 file:///C:/... 形式', () => {
    const winPath = 'C:\\Users\\test\\song.mp3'
    const url = toFileUrl(winPath)
    expect(url).toBe(pathToFileURL(winPath).href)
    expect(url).toMatch(/^file:\/\/\/C:\//)
  })

  itWindows('UNC 路径生成 file://server/share/... 形式', () => {
    const uncPath = '\\\\server\\share\\a#b.mp3'
    const url = toFileUrl(uncPath)
    expect(url).toBe(pathToFileURL(uncPath).href)
    expect(url).toMatch(/^file:\/\/server\/share\//)
    expect(url).toMatch(/a%23b\.mp3$/)
  })
})