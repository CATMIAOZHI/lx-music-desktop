import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getDownloadFilePath, MIN_VALID_FILE_SIZE } from '../src/renderer/utils/music'
import { DOWNLOAD_STATUS } from '../src/common/constants'

/**
 * getDownloadFilePath 是"本地有文件却走在线"的最后闸门。
 * 按需自愈逻辑：当 status=COMPLETED 但 isComplate=false 时（下载完成事件后 100ms
 * throttle 窗口崩溃导致标志丢失），若文件实际存在且 > 100 字节，立即回填
 * isComplate=true 并修正 metadata.filePath。
 *
 * 对应审查场景 B / N / D / P：启动自愈异步未完成时的窗口期首次播放，
 * 必须靠此函数即时校验文件，而非依赖 isComplate 标志。
 */
describe('getDownloadFilePath', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // 造一个 > MIN_VALID_FILE_SIZE 的文件
  const makeValidFile = (filePath: string) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, Buffer.alloc(MIN_VALID_FILE_SIZE + 50, 0))
  }

  const buildItem = (overrides: Partial<LX.Download.ListItem> & {
    filePath?: string
    fileName?: string
    isComplate?: boolean
    status?: LX.Download.DownloadTaskStatus
  } = {}): LX.Download.ListItem => {
    const fileName = overrides.fileName ?? 'song.mp3'
    return {
      id: 'dl_1',
      isComplate: overrides.isComplate ?? true,
      status: overrides.status ?? DOWNLOAD_STATUS.COMPLETED,
      statusText: '',
      downloaded: 1000,
      total: 1000,
      progress: 100,
      speed: '',
      writeQueue: 0,
      metadata: {
        musicInfo: { id: 'm1', name: 'n', singer: 's', source: 'kw', interval: '', meta: { songId: '1', albumName: '' } } as any,
        url: null,
        quality: '320k',
        ext: 'mp3',
        fileName,
        filePath: overrides.filePath ?? path.join(tmpDir, fileName),
      },
    }
  }

  it('文件存在于 metadata.filePath 时返回该路径', async() => {
    const item = buildItem()
    makeValidFile(item.metadata.filePath)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe(item.metadata.filePath)
    expect(item.isComplate).toBe(true)
  })

  it('metadata.filePath 不存在但 savePath+fileName 存在时返回拼接路径并修正 filePath', async() => {
    const item = buildItem({ filePath: path.join(tmpDir, 'old-nonexist.mp3') })
    const realPath = path.join(tmpDir, 'song.mp3')
    makeValidFile(realPath)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe(realPath)
    // 自愈：修正陈旧 filePath
    expect(item.metadata.filePath).toBe(realPath)
  })

  it('isComplate=false 且 status=COMPLETED 时按需自愈回填 isComplate', async() => {
    const item = buildItem({ isComplate: false, status: DOWNLOAD_STATUS.COMPLETED })
    makeValidFile(item.metadata.filePath)
    expect(item.isComplate).toBe(false)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe(item.metadata.filePath)
    // 自愈触发
    expect(item.isComplate).toBe(true)
  })

  it('isComplate=false 且 status=PAUSE 时不做自愈，返回空走在线', async() => {
    const item = buildItem({ isComplate: false, status: DOWNLOAD_STATUS.PAUSE })
    makeValidFile(item.metadata.filePath)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe('')
    expect(item.isComplate).toBe(false)
  })

  it('isComplate=false 且 status=RUN 时不做自愈（下载中部分文件不可播放）', async() => {
    const item = buildItem({ isComplate: false, status: DOWNLOAD_STATUS.RUN })
    makeValidFile(item.metadata.filePath)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe('')
    expect(item.isComplate).toBe(false)
  })

  it('文件存在但小于最小可用字节数时返回空', async() => {
    const item = buildItem()
    fs.mkdirSync(path.dirname(item.metadata.filePath), { recursive: true })
    fs.writeFileSync(item.metadata.filePath, Buffer.alloc(MIN_VALID_FILE_SIZE - 10, 0))
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe('')
  })

  it('文件正好等于最小可用字节数时返回空（边界 >  而非 >=）', async() => {
    const item = buildItem()
    fs.mkdirSync(path.dirname(item.metadata.filePath), { recursive: true })
    fs.writeFileSync(item.metadata.filePath, Buffer.alloc(MIN_VALID_FILE_SIZE, 0))
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe('')
  })

  it('文件大于最小可用字节数 1 字节时可用（边界）', async() => {
    const item = buildItem()
    fs.mkdirSync(path.dirname(item.metadata.filePath), { recursive: true })
    fs.writeFileSync(item.metadata.filePath, Buffer.alloc(MIN_VALID_FILE_SIZE + 1, 0))
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe(item.metadata.filePath)
  })

  it('ape 格式硬排除：即使文件存在也返回空走在线（Chromium 无法解码 ape）', async() => {
    const item = buildItem({ fileName: 'song.ape', filePath: path.join(tmpDir, 'song.ape') })
    makeValidFile(item.metadata.filePath)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe('')
  })

  it('文件不存在时返回空', async() => {
    const item = buildItem()
    // 不创建文件
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe('')
  })

  it('ape 格式不触发 isComplate 自愈', async() => {
    const item = buildItem({ fileName: 'song.ape', filePath: path.join(tmpDir, 'song.ape'), isComplate: false })
    makeValidFile(item.metadata.filePath)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe('')
    expect(item.isComplate).toBe(false)
  })

  it('flac 格式可用且支持自愈', async() => {
    const item = buildItem({ fileName: 'song.flac', filePath: path.join(tmpDir, 'song.flac'), isComplate: false })
    makeValidFile(item.metadata.filePath)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe(item.metadata.filePath)
    expect(item.isComplate).toBe(true)
  })

  it('wav 格式可用且支持自愈', async() => {
    const item = buildItem({ fileName: 'song.wav', filePath: path.join(tmpDir, 'song.wav'), isComplate: false })
    makeValidFile(item.metadata.filePath)
    const result = await getDownloadFilePath(item, tmpDir)
    expect(result).toBe(item.metadata.filePath)
    expect(item.isComplate).toBe(true)
  })
})