// import defaultSetting from '@common/defaultSetting'
import createWorkers from '@renderer/worker'

window.lx = {
  // appSetting: defaultSetting,
  isEditingHotKey: false,
  isPlayedStop: false,
  appHotKeyConfig: {
    local: {
      enable: false,
      keys: {},
    },
    global: {
      enable: false,
      keys: {},
    },
  },
  songListInfo: {
    fromName: '',
    searchKey: '',
    searchPosition: 0,
    songlistKey: '',
    songlistPosition: 0,
  },
  restorePlayInfo: null,
  worker: createWorkers(),
  isProd: process.env.NODE_ENV == 'production',
  /**
   * 是否为 Debug 构建（与正式版共存安装用）。
   * 由 webpack DefinePlugin 注入的 DEBUG_BUILD 环境变量决定。
   * Debug 版禁用自动更新，避免把调试版本升级为正式版。
   */
  isDebug: process.env.DEBUG_BUILD === '1',
  rootOffset: window.dt ? 0 : 8,
  apiInitPromise: [Promise.resolve(false), true, () => {}],
}

window.lxData = {}

window.ELECTRON_DISABLE_SECURITY_WARNINGS = process.env.ELECTRON_DISABLE_SECURITY_WARNINGS
