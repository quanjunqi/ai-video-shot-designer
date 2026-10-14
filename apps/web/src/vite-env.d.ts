/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MIAODA_CLIENT_BASE_PATH: string;
  /** 组件库展示页开关：'1' 表示非开发环境也注册 /dev/ui-kit（预览环境给产品/设计看组件用） */
  readonly VITE_ENABLE_UI_KIT?: string;
}
