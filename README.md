# Rustdesk-Control-Panel-WEB

Rustdesk-Control-Panel 系列的 Web 管理台（React 19.3 + Semi Design）。

## 系列仓库

| 仓库                         | 说明                                            |
| ---------------------------- | ----------------------------------------------- |
| `Rustdesk-Control-Panel-API` | 控制平面 API，OpenAPI 契约事实源                |
| `Rustdesk-Control-Panel-WEB` | Web 管理台（本仓库）                            |
| `Rustdesk-Control-Panel-APP` | 移动管理端（Expo SDK 57 / RN 0.86，仅 Android） |

## 技术栈

TypeScript · React 19.3 · Redux Toolkit（React-Redux v9）· React-Router v8 · Semi Design · Tailwind CSS v4 · Rsbuild · vitest · Cypress

## React 19 适配（重要）

React 19 移除了 `ReactDOM.render` 与 `findDOMNode`，Semi Design 需要显式注入 adapter：

- **入口文件第一行**必须是 `import '@douyinfe/semi-ui/react19-adapter'`（见 `src/main.tsx`），否则 `Modal` / `Toast` / `Notification` 的命令式 API 会报 `createRoot is not available`
- `Tooltip` / `Popover` / `PopConfirm` / `Dropdown` 的**直接子元素不得为类组件**，需用 DOM 元素包裹（`findDOMNode` 已移除）
- 详见 https://semi.design/zh-CN/ecosystem/react19

## 样式策略

Tailwind v4 **不引入 preflight**（避免与 Semi 的 reset 冲突），只引入 `theme` 与 `utilities` 两层；Semi 全量样式在 `src/main.tsx` 中引入（Semi 2.x 的 `exports` 未暴露 `dist/css/*`，因此在 `rsbuild.config.ts` 中配置了别名旁路）。

## 本地开发

```bash
pnpm install          # 安装依赖（Cypress 二进制默认不下载）
pnpm dev              # 开发服务
pnpm build            # 生产构建
pnpm test             # 单元测试（vitest）
pnpm typecheck        # 类型检查
pnpm lint             # ESLint
pnpm format:check     # Prettier 检查
```

Cypress 端到端用例将在 P5 落地；本地需要跑 e2e 时执行 `pnpm cypress install` 下载二进制。

## 目录结构

```
src/
  main.tsx            # 入口（Semi react19-adapter 必须第一行）
  router.tsx          # React-Router v8 路由
  App.tsx             # 应用外壳
  store/              # Redux Toolkit store 与 slice
  styles/global.css   # Tailwind v4（无 preflight）
  test/setup.ts       # vitest 环境垫片（jsdom canvas 桩）
```

## 约定

- 分支流：`feature/*` → `develop` → `main`；`develop`/`main` 禁止日常直推（唯一例外：本仓库 bootstrap 首提交）
- 提交信息 Conventional Commits（英文）；代码注释英文，文档中文
- 命令一律在 Git Bash 中执行

## 许可

私有项目，保留所有权利（见 `LICENSE`）。
