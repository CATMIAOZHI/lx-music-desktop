import { onBeforeUnmount } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { musicInfo, playMusicInfo } from '@renderer/store/player/state'
import { setStop, isEmpty } from '@renderer/plugins/player'
import { playNext, setMusicUrl } from '@renderer/core/player'
import { setAllStatus } from '@renderer/store/player/action'
import { appSetting } from '@renderer/store/setting'
import { isLocalCandidate } from '@renderer/utils/music'

export default () => {
  const t = useI18n()
  // 在线 URL 刷新次数（仅对在线歌曲生效）
  let onlineRetryNum = 0
  // 本地加载失败次数（仅对已下载项 / 本地导入项生效）
  let localRetryNum = 0
  // 超时事件是否已触发过一次（用于本地候选的 本地重试 → 在线回退 状态机）
  let prevTimeoutId: string | null = null

  let loadingTimeout: NodeJS.Timeout | null = null
  let delayNextTimeout: NodeJS.Timeout | null = null
  const startLoadingTimeout = () => {
    // console.log('start load timeout')
    clearLoadingTimeout()
    loadingTimeout = setTimeout(() => {
      if (window.lx.isPlayedStop) {
        prevTimeoutId = null
        setAllStatus('')
        return
      }

      if (!playMusicInfo.musicInfo) {
        prevTimeoutId = null
        return
      }

      const info = playMusicInfo.musicInfo
      if (isLocalCandidate(info)) {
        // 本地候选：本地重试 → 在线回退 → 切歌
        if (prevTimeoutId == info.id) {
          // 第二次超时：本地重试已用完仍卡住，回退在线 URL
          prevTimeoutId = null
          setMusicUrl(info, true, 0)
        } else {
          prevTimeoutId = info.id
          if (localRetryNum < 2) {
            localRetryNum++
            setMusicUrl(info, false, localRetryNum)
          } else {
            // 本地重试已用尽，直接回退在线
            prevTimeoutId = null
            setMusicUrl(info, true, 0)
          }
        }
      } else {
        // 在线歌曲：URL 失效后强制刷新
        setMusicUrl(info, true)
      }
    }, 25000)
  }
  const clearLoadingTimeout = () => {
    if (!loadingTimeout) return
    // console.log('clear load timeout')
    clearTimeout(loadingTimeout)
    loadingTimeout = null
  }

  const clearDelayNextTimeout = () => {
    // console.log(this.delayNextTimeout)
    if (!delayNextTimeout) return
    clearTimeout(delayNextTimeout)
    delayNextTimeout = null
  }
  const addDelayNextTimeout = () => {
    clearDelayNextTimeout()
    delayNextTimeout = setTimeout(() => {
      if (window.lx.isPlayedStop) {
        setAllStatus('')
        return
      }
      void playNext(true)
    }, 5000)
  }

  const handleLoadstart = () => {
    if (window.lx.isPlayedStop) return
    if (appSetting['player.autoSkipOnError']) startLoadingTimeout()
    setAllStatus(t('player__loading'))
  }

  const handleLoadeddata = () => {
    setAllStatus(t('player__loading'))
  }

  const handlePlaying = () => {
    setAllStatus('')
    clearLoadingTimeout()
  }

  const handleEmpied = () => {
    clearDelayNextTimeout()
    clearLoadingTimeout()
  }

  const handleWating = () => {
    setAllStatus(t('player__buffering'))
  }

  const handleError = (errCode?: number) => {
    if (!musicInfo.id) return
    clearLoadingTimeout()
    if (window.lx.isPlayedStop) return
    if (!isEmpty()) setStop()
    if (playMusicInfo.musicInfo && errCode !== 1) {
      const info = playMusicInfo.musicInfo
      if (isLocalCandidate(info)) {
        // 本地候选：先本地重试 2 次，再回退在线 URL，最后切歌
        if (localRetryNum < 2) {
          localRetryNum++
          setMusicUrl(info, false, localRetryNum)
          setAllStatus(t('player__refresh_url'))
          return
        }
        if (onlineRetryNum < 2) {
          // 本地重试已用尽，回退在线 URL（最多 2 次）
          onlineRetryNum++
          setMusicUrl(info, true, 0)
          setAllStatus(t('player__refresh_url'))
          return
        }
      } else {
        // 普通在线歌曲：URL 失效后强制刷新 2 次
        if (onlineRetryNum < 2) {
          onlineRetryNum++
          setMusicUrl(info, true)
          setAllStatus(t('player__refresh_url'))
          return
        }
      }
    }

    if (appSetting['player.autoSkipOnError']) {
      if (document.hidden) {
        console.warn('error skip to next')
        void playNext(true)
      } else {
        setAllStatus(t('player__error'))
        setTimeout(addDelayNextTimeout)
      }
    }
  }

  const handleSetPlayInfo = () => {
    onlineRetryNum = 0
    localRetryNum = 0
    prevTimeoutId = null
    clearDelayNextTimeout()
    clearLoadingTimeout()
  }

  // const handlePlayedStop = () => {
  //   clearDelayNextTimeout()
  //   clearLoadingTimeout()
  // }


  window.app_event.on('playerLoadstart', handleLoadstart)
  window.app_event.on('playerLoadeddata', handleLoadeddata)
  window.app_event.on('playerPlaying', handlePlaying)
  window.app_event.on('playerWaiting', handleWating)
  window.app_event.on('playerEmptied', handleEmpied)
  window.app_event.on('playerError', handleError)
  window.app_event.on('musicToggled', handleSetPlayInfo)

  onBeforeUnmount(() => {
    window.app_event.off('playerLoadstart', handleLoadstart)
    window.app_event.off('playerLoadeddata', handleLoadeddata)
    window.app_event.off('playerPlaying', handlePlaying)
    window.app_event.off('playerWaiting', handleWating)
    window.app_event.off('playerEmptied', handleEmpied)
    window.app_event.off('playerError', handleError)
    window.app_event.off('musicToggled', handleSetPlayInfo)
  })
}
