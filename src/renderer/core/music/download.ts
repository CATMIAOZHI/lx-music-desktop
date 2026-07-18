import { getDownloadFilePath } from '@renderer/utils/music'
import { toFileUrl } from '@common/utils/electron'

import {
  getMusicUrl as getOnlineMusicUrl,
  getPicUrl as getOnlinePicUrl,
  getLyricInfo as getOnlineLyricInfo,
} from './online'
import { buildLyricInfo, getCachedLyricInfo } from './utils'
import { buildSavePath } from '@renderer/store/download/utils'

export const getMusicUrl = async({ musicInfo, isRefresh, localRetryCount = 0, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  /**
   * 本地加载失败的重试次数。audio error / 加载超时触发的重试会传入此值。
   * 在达到阈值前仍优先尝试本地文件，避免一次加载失败就永久回退在线。
   * 见审查场景 C / I：原实现 isRefresh=true 时无条件跳过本地路径检查。
   */
  localRetryCount?: number
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
  allowToggleSource?: boolean
}): Promise<string> => {
  // 本地优先：仅在用户显式刷新或本地多次加载失败后才跳过本地路径
  if (!isRefresh && localRetryCount < 2) {
    const path = await getDownloadFilePath(musicInfo, buildSavePath(musicInfo))
    if (path) return toFileUrl(path)
  }

  return getOnlineMusicUrl({ musicInfo: musicInfo.metadata.musicInfo, isRefresh, onToggleSource, allowToggleSource })
}

export const getPicUrl = async({ musicInfo, isRefresh, listId, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  listId?: string | null
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  if (!isRefresh) {
    const path = await getDownloadFilePath(musicInfo, buildSavePath(musicInfo))
    if (path) {
      const pic = await window.lx.worker.main.getMusicFilePic(path)
      if (pic) return pic
    }

    const onlineMusicInfo = musicInfo.metadata.musicInfo
    if (onlineMusicInfo.meta.picUrl) return onlineMusicInfo.meta.picUrl
  }

  return getOnlinePicUrl({ musicInfo: musicInfo.metadata.musicInfo, isRefresh, onToggleSource }).then((url) => {
    // TODO: when listId required save url (update downloadInfo)

    return url
  })
}

export const getLyricInfo = async({ musicInfo, isRefresh, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const lyricInfo = await getCachedLyricInfo(musicInfo.metadata.musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  return getOnlineLyricInfo({
    musicInfo: musicInfo.metadata.musicInfo,
    isRefresh,
    onToggleSource,
  }).catch(async() => {
    // 尝试读取文件内歌词
    const path = await getDownloadFilePath(musicInfo, buildSavePath(musicInfo))
    if (path) {
      const rawlrcInfo = await window.lx.worker.main.getMusicFileLyric(path)
      if (rawlrcInfo) return buildLyricInfo(rawlrcInfo)
    }

    throw new Error('failed')
  })
}
