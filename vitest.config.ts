import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@common': path.join(__dirname, 'src/common'),
      '@renderer': path.join(__dirname, 'src/renderer'),
      '@main': path.join(__dirname, 'src/main'),
      '@lyric': path.join(__dirname, 'src/renderer-lyric'),
    },
  },
  test: {
    // 测试文件放在 test/ 目录下，按主题分组
    include: ['test/**/*.test.ts'],
    // 测试环境：用 node，因为被测纯函数依赖 node:url / node:fs
    environment: 'node',
    globals: false,
    // 不在此处设置 run: true —— npm test 脚本用 `vitest run` 保证 CI 单次运行，
    // test:watch 脚本用 `vitest` 进入 watch 模式，全局 run:true 会让 watch 失效。
  },
})