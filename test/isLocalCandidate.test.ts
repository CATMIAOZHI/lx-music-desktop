import { describe, it, expect } from 'vitest'
import { isLocalCandidate } from '../src/renderer/utils/music'
import { DOWNLOAD_STATUS } from '../src/common/constants'

/**
 * isLocalCandidate 决定 usePlayEvent 重试状态机走哪条分支：
 * - 本地候选：本地重试 2 次 → 在线 URL 回退 2 次 → 切歌
 * - 在线歌曲：URL 强制刷新 2 次 → 切歌
 *
 * 错判会导致：
 *   - 在线歌曲被当本地候选：占用 localRetryNum，前 2 次重试不强制刷新
 *   - 本地候选被当在线歌曲：audio error 直接 isRefresh=true，本地路径被永久跳过
 *
 * 对应审查 P1：原修复未区分两类歌曲，导致在线歌曲 URL 失效后无法刷新。
 * 对应审查 P2：未完成下载项（RUN/PAUSE）不应被当本地候选，
 *   否则 getDownloadFilePath 返回空后仍以 isRefresh=false 请求在线 URL。
 */
describe('isLocalCandidate', () => {
  it('null / undefined 返回 false', () => {
    expect(isLocalCandidate(null)).toBe(false)
    expect(isLocalCandidate(undefined)).toBe(false)
  })

  it('已完成下载项（isComplate=true）返回 true', () => {
    const downloadItem = {
      id: 'dl_1',
      isComplate: true,
      status: DOWNLOAD_STATUS.COMPLETED,
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
        fileName: 'n.mp3',
        filePath: 'C:\\music\\n.mp3',
      },
    }
    expect(isLocalCandidate(downloadItem)).toBe(true)
  })

  it('status=COMPLETED 但 isComplate=false（标志丢失）返回 true', () => {
    const downloadItem = {
      id: 'dl_2',
      isComplate: false,
      status: DOWNLOAD_STATUS.COMPLETED,
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
        fileName: 'n.mp3',
        filePath: 'C:\\music\\n.mp3',
      },
    }
    expect(isLocalCandidate(downloadItem)).toBe(true)
  })

  it('正在下载（RUN）返回 false（文件不完整，不应占用本地重试额度）', () => {
    const downloadItem = {
      id: 'dl_3',
      isComplate: false,
      status: DOWNLOAD_STATUS.RUN,
      statusText: '',
      downloaded: 100,
      total: 1000,
      progress: 10,
      speed: '1MB/s',
      writeQueue: 0,
      metadata: {
        musicInfo: { id: 'm1', name: 'n', singer: 's', source: 'kw', interval: '', meta: { songId: '1', albumName: '' } } as any,
        url: null,
        quality: '320k',
        ext: 'mp3',
        fileName: 'n.mp3',
        filePath: '',
      },
    }
    expect(isLocalCandidate(downloadItem)).toBe(false)
  })

  it('暂停（PAUSE）返回 false（文件不完整）', () => {
    const downloadItem = {
      id: 'dl_4',
      isComplate: false,
      status: DOWNLOAD_STATUS.PAUSE,
      statusText: '',
      downloaded: 500,
      total: 1000,
      progress: 50,
      speed: '',
      writeQueue: 0,
      metadata: {
        musicInfo: { id: 'm1', name: 'n', singer: 's', source: 'kw', interval: '', meta: { songId: '1', albumName: '' } } as any,
        url: null,
        quality: '320k',
        ext: 'mp3',
        fileName: 'n.mp3',
        filePath: '',
      },
    }
    expect(isLocalCandidate(downloadItem)).toBe(false)
  })

  it('source=local 的本地导入歌曲返回 true', () => {
    const localItem = {
      id: 'C:\\music\\local.mp3',
      name: 'local',
      singer: 's',
      source: 'local',
      interval: '',
      meta: {
        songId: 'C:\\music\\local.mp3',
        albumName: '',
        filePath: 'C:\\music\\local.mp3',
        ext: 'mp3',
      },
    }
    expect(isLocalCandidate(localItem)).toBe(true)
  })

  it('普通在线歌曲（kw/wy/tx/kg/mg 等源）返回 false', () => {
    const sources = ['kw', 'wy', 'tx', 'kg', 'mg'] as const
    for (const source of sources) {
      const onlineItem = {
        id: `m_${source}`,
        name: 'n',
        singer: 's',
        source,
        interval: '',
        meta: { songId: '1', albumName: '' },
      }
      expect(isLocalCandidate(onlineItem)).toBe(false)
    }
  })
})