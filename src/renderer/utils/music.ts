import { checkPath, joinPath, extname, basename, readFile, getFileStats } from '@common/utils/nodejs'
import { DOWNLOAD_STATUS } from '@common/constants'
import { formatPlayTime } from '@common/utils/common'
import { decodeKrc } from '@common/utils/lyricUtils/kg'
import { type IAudioMetadata } from 'music-metadata'

export const checkDownloadFileAvailable = async(musicInfo: LX.Download.ListItem, savePath: string): Promise<boolean> => {
  return musicInfo.isComplate && !/\.ape$/.test(musicInfo.metadata.fileName) &&
    (await checkPath(musicInfo.metadata.filePath) || await checkPath(joinPath(savePath, musicInfo.metadata.fileName)))
}

export const checkLocalFileAvailable = async(musicInfo: LX.Music.MusicInfoLocal): Promise<boolean> => {
  return checkPath(musicInfo.meta.filePath)
}

/**
 * 检查音乐文件是否存在
 * @param musicInfo
 * @param savePath
 */
export const checkMusicFileAvailable = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, savePath: string): Promise<boolean> => {
  if ('progress' in musicInfo) {
    return checkDownloadFileAvailable(musicInfo, savePath)
  } else if (musicInfo.source == 'local') {
    return checkLocalFileAvailable(musicInfo)
  } else return true
}

/**
 * 判断播放项是否为本地候选（已下载项或本地导入项）。
 *
 * 仅本地候选适用"本地重试 → 在线回退"重试语义；
 * 普通在线歌曲失效时应直接刷新 URL，不能占用本地重试额度。
 * 见 usePlayEvent.ts 重试状态机。
 *
 * 注意：下载任务必须处于完成态（isComplate 或 status=COMPLETED）才算本地候选。
 * RUN / PAUSE 状态的任务文件尚不完整，getDownloadFilePath 必然返回空，
 * 若被当作本地候选会让重试状态机以 isRefresh=false 请求在线 URL，
 * 前几次错误不会强制刷新失效 URL。
 */
export const isLocalCandidate = (info: LX.Music.MusicInfo | LX.Download.ListItem | null | undefined): boolean => {
  if (!info) return false
  if ('progress' in info) {
    return info.isComplate || info.status === DOWNLOAD_STATUS.COMPLETED
  }
  return info.source === 'local'
}

// 文件被认为是"可用"的最小字节数，与下载侧 skipExistFile 的判定阈值一致。
// 导出供测试断言使用
export const MIN_VALID_FILE_SIZE = 100

/**
 * 获取已下载音乐文件的本地路径。
 *
 * 按需自愈：当 status=COMPLETED 但 isComplate=false（如下载完成事件后 100ms throttle
 * 窗口内崩溃导致标志丢失）时，若文件实际存在且非空，立即回填 isComplate=true 并修正
 * metadata.filePath，避免首次播放就走在线（审查场景 B / N / D）。
 *
 * 返回 { path, healed }：
 * - path：可用的本地文件绝对路径，无可用文件时为空字符串
 * - healed：是否触发了自愈（回填 isComplate 或修正 filePath）
 *
 * 调用方应在 healed=true 时显式调用 downloadTasksUpdate 持久化，
 * 不要依赖"后续可能出现的其他更新"——审查 P2 指出 healDownloadList 看到内存
 * isComplate=true 后会跳过更新，导致 DB 仍是旧值。
 */
export const getDownloadFilePath = async(
  musicInfo: LX.Download.ListItem,
  savePath: string,
): Promise<{ path: string, healed: boolean }> => {
  // ape 格式 Chromium 无法解码，直接返回空走在线
  if (/\.ape$/.test(musicInfo.metadata.fileName)) return { path: '', healed: false }
  // 仅当标志为完成态、或 status=completed 但标志丢失时才尝试本地
  if (!musicInfo.isComplate && musicInfo.status !== DOWNLOAD_STATUS.COMPLETED) return { path: '', healed: false }

  let path = ''
  let filePathChanged = false
  if (await checkPath(musicInfo.metadata.filePath)) {
    path = musicInfo.metadata.filePath
  } else {
    const joined = joinPath(savePath, musicInfo.metadata.fileName)
    if (await checkPath(joined)) {
      path = joined
      // 修正陈旧的 filePath（配置/歌单改名后）
      musicInfo.metadata.filePath = joined
      filePathChanged = true
    }
  }
  if (path) {
    // 用 getFileStats 校验文件非空，避免写一半的 0 字节文件被当作可用
    const stats = await getFileStats(path)
    if (!stats || stats.size <= MIN_VALID_FILE_SIZE) return { path: '', healed: false }
    let healed = false
    if (!musicInfo.isComplate) {
      musicInfo.isComplate = true
      healed = true
    }
    if (filePathChanged) healed = true
    return { path, healed }
  }
  return { path: '', healed: false }
}

export const getLocalFilePath = async(musicInfo: LX.Music.MusicInfoLocal): Promise<string> => {
  // 审查场景 H：filePath 为空时 checkPath('') 返回 false 会静默回退在线搜索，
  // 违反用户"播放本地文件"的意图。显式 warn 以便诊断。
  if (!musicInfo.meta.filePath) {
    console.warn('local musicInfo.meta.filePath is empty, will fall back to online search:', musicInfo.id)
    return ''
  }
  return (await checkPath(musicInfo.meta.filePath)) ? musicInfo.meta.filePath : ''
}


/**
 * 获取音乐文件路径
 * @param musicInfo
 * @param savePath
 * @returns
 */
export const getMusicFilePath = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, savePath: string): Promise<string> => {
  if ('progress' in musicInfo) {
    return (await getDownloadFilePath(musicInfo, savePath)).path
  } else if (musicInfo.source == 'local') {
    return getLocalFilePath(musicInfo)
  }
  return ''
}

/**
 * 创建本地音乐信息对象
 * @param path 文件路径
 * @returns
 */
export const createLocalMusicInfo = async(path: string): Promise<LX.Music.MusicInfoLocal | null> => {
  if (!await checkPath(path)) return null
  const { parseFile } = await import('music-metadata')

  let metadata
  try {
    metadata = await parseFile(path)
  } catch (err) {
    console.log(err)
    return null
  }

  // console.log(metadata)
  let ext = extname(path)
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  let name = (metadata.common.title || basename(path, ext)).trim()
  let singer = metadata.common.artists?.length ? metadata.common.artists.map(a => a.trim()).join('、') : ''
  let interval = metadata.format.duration ? formatPlayTime(metadata.format.duration) : ''
  let albumName = metadata.common.album?.trim() ?? ''

  return {
    id: path,
    name,
    singer,
    source: 'local',
    interval,
    meta: {
      albumName,
      filePath: path,
      songId: path,
      picUrl: '',
      ext: ext.replace(/^\./, ''),
    },
  }
}

let prevFileInfo: {
  path: string
  promise: Promise<LX.MusicMetadataModule.IAudioMetadata | null>
} = {
  path: '',
  promise: Promise.resolve(null),
}
const getFileMetadata = async(path: string) => {
  if (prevFileInfo.path == path) return prevFileInfo.promise
  prevFileInfo.path = path
  return prevFileInfo.promise = checkPath(path).then(async(isExist) => {
    return isExist ? import('music-metadata').then(async({ parseFile }) => parseFile(path)).catch(err => {
      console.log(err)
      return null
    }) : null
  })
}
/**
 * 获取歌曲文件封面图片
 * @param path 路径
 */
export const getLocalMusicFilePic = async(path: string) => {
  const filePath = new RegExp('\\' + extname(path) + '$')
  let picPath = path.replace(filePath, '.jpg')
  let stats = await getFileStats(picPath)
  if (stats) return picPath
  picPath = path.replace(filePath, '.png')
  stats = await getFileStats(picPath)
  if (stats) return picPath
  const metadata = await getFileMetadata(path)
  if (!metadata) return null
  const { selectCover } = await import('music-metadata')
  return selectCover(metadata.common.picture)
}

// const timeExp = /^\[([\d:.]*)\]{1}/
/**
 * 解析歌词文件，分离可能存在的翻译、罗马音歌词
 * @param lrc 歌词内容
 * @returns
 */
// export const parseLyric = (lrc: string): LX.Music.LyricInfo => {
//   const lines = lrc.split(/\r\n|\r|\n/)
//   const lyrics: string[][] = []
//   const map = new Map<string, number>()

//   for (let i = 0; i < lines.length; i++) {
//     const line = lines[i].trim()
//     let result = timeExp.exec(line)
//     if (result) {
//       const index = map.get(result[1]) ?? 0
//       if (!lyrics[index]) lyrics[index] = []
//       lyrics[index].push(line)
//       map.set(result[1], index + 1)
//     } else {
//       if (!lyrics[0]) lyrics[0] = []
//       lyrics[0].push(line)
//     }
//   }
//   const lyricInfo: LX.Music.LyricInfo = {
//     lyric: lyrics[0].join('\n'),
//     tlyric: '',
//   }
//   if (lyrics[1]) lyricInfo.tlyric = lyrics[1].join('\n')
//   if (lyrics[2]) lyricInfo.rlyric = lyrics[2].join('\n')

//   return lyricInfo
// }

type IComment = NonNullable<IAudioMetadata['common']['comment']> extends Array<infer U> ? U : never

/**
 * 获取歌曲文件歌词
 * @param path 路径
 */
export const getLocalMusicFileLyric = async(path: string): Promise<LX.Music.LyricInfo | null> => {
  // 尝试读取同目录下的同名lrc文件
  const filePath = new RegExp('\\' + extname(path) + '$')
  let lrcPath = path.replace(filePath, '.lrc')
  let stats = await getFileStats(lrcPath)
  // console.log(lrcPath, stats)
  if (stats && stats.size < 1024 * 1024 * 10) {
    const lrcBuf = await readFile(lrcPath)
    const { detect } = await import('jschardet')
    const { confidence, encoding } = detect(lrcBuf)
    console.log('lrc file encoding', confidence, encoding)
    if (confidence > 0.8) {
      const iconv = (await import('iconv-lite')).default
      if (iconv.encodingExists(encoding)) {
        const lrc = iconv.decode(lrcBuf, encoding)
        if (lrc) {
          return {
            lyric: lrc,
          }
        }
      }
    }
  }
  // 尝试读取同目录下的同名krc文件
  lrcPath = path.replace(filePath, '.krc')
  stats = await getFileStats(lrcPath)
  console.log(lrcPath, stats?.size)
  if (stats && stats.size < 1024 * 1024 * 10) {
    const lrcBuf = await readFile(lrcPath)
    try {
      return await decodeKrc(lrcBuf)
    } catch (e) {
      console.log(e)
    }
  }


  // 尝试读取文件内歌词
  const metadata = await getFileMetadata(path)
  // console.log(metadata?.common)
  if (!metadata) return null
  // let lyricInfo = metadata.common.lyrics?.[0]
  // if (lyricInfo) {
  //   let lyric: string | undefined
  //   if (typeof lyricInfo == 'object') lyric = lyricInfo.text
  //   else if (typeof lyricInfo == 'string') lyric = lyricInfo
  //   if (lyric && lyric.length > 10) {
  //     return { lyric }
  //   }
  // }
  // console.log(metadata)
  for (const info of Object.values(metadata.native)) {
    for (const ust of info) {
      switch (ust.id) {
        case 'LYRICS': {
          const value = typeof ust.value == 'string' ? ust.value : (ust as IComment).text
          if (value && value.length > 10) return { lyric: value }
          break
        }
        case 'USLT': {
          const value = ust.value as IComment
          if (value.text && value.text.length > 10) return { lyric: value.text }
          break
        }
      }
    }
  }
  return null
}
