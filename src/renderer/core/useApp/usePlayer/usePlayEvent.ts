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
  // 本地候选的本地超时重试次数（与 localRetryNum 分开，避免与 error 事件互相干扰）
  let localTimeoutRetryNum = 0
  // 本地候选回退在线后的在线超时刷新次数
  let onlineTimeoutRetryNum = 0

  let loadingTimeout: NodeJS.Timeout | null = null
  let delayNextTimeout: NodeJS.Timeout | null = null
  const startLoadingTimeout = () => {
    // console.log('start load timeout')
    clearLoadingTimeout()
    loadingTimeout = setTimeout(() => {
      if (window.lx.isPlayedStop) {
        setAllStatus('')
        return
      }

      if (!playMusicInfo.musicInfo) {
        return
      }

      const info = playMusicInfo.musicInfo
      if (isLocalCandidate(info)) {
        // 本地候选：本地重试 1 次 → 回退在线 → 在线刷新最多 2 次 → 切歌
        if (localTimeoutRetryNum < 1) {
          localTimeoutRetryNum++
          setMusicUrl(info, false, localTimeoutRetryNum)
        } else if (onlineTimeoutRetryNum < 2) {
          onlineTimeoutRetryNum++
          setMusicUrl(info, true, 0)
        } else {
          void playNext(true)
        }
      } else {
        // 在线歌曲：URL 强制刷新最多 2 次，仍超时则切歌
        if (onlineTimeoutRetryNum < 2) {
          onlineTimeoutRetryNum++
          setMusicUrl(info, true)
        } else {
          void playNext(true)
        }
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
    // 成功播放后清零超时计数，避免同一首歌卡顿恢复后历史计数残留
    localTimeoutRetryNum = 0
    onlineTimeoutRetryNum = 0
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
    localTimeoutRetryNum = 0
    onlineTimeoutRetryNum = 0
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
