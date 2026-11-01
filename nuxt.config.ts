export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  components: [
    { path: '~/components', pathPrefix: false },
  ],
  typescript: {
    strict: true,
    typeCheck: false,
  },
  vue: {
    compilerOptions: {
      // mtrl 提供的是自定义元素（m-progress 等），无需 Vue 解析为组件
      isCustomElement: (tag: string) => tag.startsWith('m-'),
    },
  },
  vite: {
    // 客户端插件才引入 mtrl，预打包可避免运行时再发现依赖导致整页刷新
    optimizeDeps: {
      include: ['mtrl/elements', 'mtrl/elements/css', 'mtrl/styles/base'],
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'm3e · 一天时间盘',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#17181a' },
        { name: 'description', content: '一天时间可视化与计时记录' },
      ],
    },
  },
  nitro: {
    // 数据目录由 server/utils/store.ts 读取 M3E_DATA_DIR，默认 ./.data
    externals: { inline: [] },
  },
})
