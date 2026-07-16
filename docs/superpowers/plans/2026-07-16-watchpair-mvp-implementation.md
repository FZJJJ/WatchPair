# WatchPair MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 构建一个供两人在 Windows 桌面版 Edge 中同步观看哔哩哔哩普通视频的私人 Manifest V3 插件，以及可部署到 Render 的 Node.js WebSocket 中转服务。

**架构：** 项目采用 npm workspaces 管理 `protocol`、`server` 和 `extension` 三个 TypeScript 工作区。共享协议包负责消息结构和纯同步算法；服务端维护最多两人的内存房间；插件的 Service Worker 管理 WebSocket，内容脚本适配哔哩哔哩视频，弹出面板负责房间操作和状态展示。

**技术栈：** TypeScript、npm workspaces、Vite、Vitest、Zod、Node.js、Express、ws、Edge Manifest V3、ESLint、Prettier。

---

## 文件结构

```text
WatchPair/
├─ apps/
│  ├─ extension/
│  │  ├─ public/manifest.json
│  │  ├─ src/background/service-worker.ts
│  │  ├─ src/content/bilibili-adapter.ts
│  │  ├─ src/content/media-sync-controller.ts
│  │  ├─ src/content/content-script.ts
│  │  ├─ src/popup/index.html
│  │  ├─ src/popup/main.ts
│  │  ├─ src/popup/styles.css
│  │  ├─ src/shared/extension-messages.ts
│  │  ├─ src/shared/settings.ts
│  │  ├─ tests/bilibili-adapter.test.ts
│  │  ├─ tests/media-sync-controller.test.ts
│  │  ├─ tests/settings.test.ts
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ vite.config.ts
│  └─ server/
│     ├─ src/index.ts
│     ├─ src/room-store.ts
│     ├─ src/rate-limiter.ts
│     ├─ tests/room-store.test.ts
│     ├─ tests/server.test.ts
│     ├─ package.json
│     └─ tsconfig.json
├─ packages/protocol/
│  ├─ src/messages.ts
│  ├─ src/sync.ts
│  ├─ src/reconnect.ts
│  ├─ src/index.ts
│  ├─ tests/messages.test.ts
│  ├─ tests/sync.test.ts
│  ├─ tests/reconnect.test.ts
│  ├─ package.json
│  └─ tsconfig.json
├─ docs/superpowers/specs/
├─ .editorconfig
├─ .gitignore
├─ .prettierrc.json
├─ eslint.config.js
├─ package.json
├─ render.yaml
├─ tsconfig.base.json
└─ README.md
```

## 任务 1：建立 monorepo 与质量检查基础

**文件：**
- 新建：`package.json`
- 新建：`tsconfig.base.json`
- 新建：`eslint.config.js`
- 新建：`.prettierrc.json`
- 新建：`.editorconfig`
- 新建：`.gitignore`
- 新建：三个工作区的 `package.json` 和 `tsconfig.json`

- [ ] **步骤 1：写入根工作区清单和统一脚本**

根 `package.json` 必须包含：

```json
{
  "name": "watchpair",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "verify": "npm run test && npm run typecheck && npm run lint && npm run format:check && npm run build"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/node": "^24.0.0",
    "eslint": "^9.0.0",
    "globals": "^16.0.0",
    "jsdom": "^26.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **步骤 2：写入严格 TypeScript、ESLint、Prettier 和忽略规则配置**

`tsconfig.base.json` 启用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`useUnknownInCatchVariables`，目标为 `ES2022`。ESLint 使用 TypeScript 推荐规则并忽略 `dist`、`coverage`、`node_modules`。

- [ ] **步骤 3：安装依赖并验证工具链**

运行：`npm install`

运行：`npm run test`

预期：Vitest 能启动；在还没有测试文件时正常退出或报告没有测试，且不存在配置加载错误。

- [ ] **步骤 4：提交基础设施**

```bash
git add package.json package-lock.json tsconfig.base.json eslint.config.js .prettierrc.json .editorconfig .gitignore apps packages
git commit -m "chore: scaffold WatchPair monorepo"
```

## 任务 2：以 TDD 实现共享协议与同步算法

**文件：**
- 新建：`packages/protocol/src/messages.ts`
- 新建：`packages/protocol/src/sync.ts`
- 新建：`packages/protocol/src/reconnect.ts`
- 新建：`packages/protocol/src/index.ts`
- 新建：`packages/protocol/tests/messages.test.ts`
- 新建：`packages/protocol/tests/sync.test.ts`
- 新建：`packages/protocol/tests/reconnect.test.ts`

- [ ] **步骤 1：先写消息结构失败测试**

测试必须证明合法的 `create-room`、`join-room`、`media-operation` 和 `state-snapshot` 可以解析，同时缺失 `participantId`、超长字符串、非法倍速和未知消息类型会被拒绝。核心示例：

```ts
expect(ClientMessageSchema.safeParse({
  type: 'media-operation',
  roomCode: 'AB3K7M',
  participantId: 'participant-12345678',
  operationId: 'op-1',
  clientSentAt: 1_000,
  video: { bvid: 'BV1xx411c7mD', part: 1, duration: 120 },
  media: { paused: false, currentTime: 10, playbackRate: 1 }
}).success).toBe(true);
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npm test -- packages/protocol/tests/messages.test.ts`

预期：FAIL，原因是协议模块尚不存在。

- [ ] **步骤 3：实现 Zod 消息结构和导出类型**

定义 `VideoIdentity`、`MediaState`、`ClientMessage`、`ServerMessage`。房间码使用正则 `/^[A-HJ-NP-Z2-9]{6}$/`，进度必须非负，倍速限制在 `0.25` 至 `3`，消息字符串设置合理上限。

- [ ] **步骤 4：运行消息测试确认通过**

运行：`npm test -- packages/protocol/tests/messages.test.ts`

预期：全部 PASS。

- [ ] **步骤 5：先写偏差修正与重连退避失败测试**

```ts
expect(planCorrection({ driftSeconds: 0.2, roomRate: 1 })).toEqual({ kind: 'none' });
expect(planCorrection({ driftSeconds: 0.8, roomRate: 1 })).toMatchObject({ kind: 'nudge', playbackRate: 1.08 });
expect(planCorrection({ driftSeconds: -0.8, roomRate: 1 })).toMatchObject({ kind: 'nudge', playbackRate: 0.92 });
expect(planCorrection({ driftSeconds: 2, roomRate: 1 })).toEqual({ kind: 'seek', targetOffset: -2 });
expect(reconnectDelayMs(0, () => 0.5)).toBeGreaterThanOrEqual(400);
expect(reconnectDelayMs(20, () => 0.5)).toBeLessThanOrEqual(30_000);
```

- [ ] **步骤 6：运行测试确认失败，再实现最小算法并确认通过**

运行：`npm test -- packages/protocol/tests/sync.test.ts packages/protocol/tests/reconnect.test.ts`

预期：第一次 FAIL；实现 `planCorrection`、`estimateTargetTime`、`sameVideo` 和 `reconnectDelayMs` 后全部 PASS。

- [ ] **步骤 7：提交共享协议**

```bash
git add packages/protocol
git commit -m "feat: add shared synchronization protocol"
```

## 任务 3：以 TDD 实现房间状态存储

**文件：**
- 新建：`apps/server/src/room-store.ts`
- 新建：`apps/server/tests/room-store.test.ts`

- [ ] **步骤 1：写房间生命周期失败测试**

测试覆盖：生成合法六位房间码、创建者加入、第二人加入、第三人被拒绝、重复操作 ID 被忽略、房间版本号递增、最后状态可读取、双方离线十分钟后删除。

```ts
const store = new RoomStore({ now: () => now, random: deterministicRandom });
const created = store.create('alice');
expect(created.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
expect(store.join(created.code, 'bob').ok).toBe(true);
expect(store.join(created.code, 'charlie')).toEqual({ ok: false, reason: 'room-full' });
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npm test -- apps/server/tests/room-store.test.ts`

预期：FAIL，原因是 `RoomStore` 尚不存在。

- [ ] **步骤 3：实现最小房间模型**

`RoomStore` 公开 `create`、`join`、`leave`、`applyOperation`、`getSnapshot` 和 `sweepExpired`。内部用 `Map<string, Room>`，保存参与者在线状态、最新媒体状态、最近操作 ID 集合、版本号和空房时间。

- [ ] **步骤 4：运行测试确认通过**

运行：`npm test -- apps/server/tests/room-store.test.ts`

预期：全部 PASS。

- [ ] **步骤 5：提交房间存储**

```bash
git add apps/server/src/room-store.ts apps/server/tests/room-store.test.ts
git commit -m "feat: add in-memory room store"
```

## 任务 4：以 TDD 实现 WebSocket 服务

**文件：**
- 新建：`apps/server/src/rate-limiter.ts`
- 新建：`apps/server/src/index.ts`
- 新建：`apps/server/tests/server.test.ts`

- [ ] **步骤 1：写服务端集成失败测试**

启动随机端口测试服务器，连接三个 `ws` 客户端，验证：`GET /health` 返回 `{ "status": "ok" }`；创建房间返回房间码；第二人加入后双方收到在线状态；媒体操作只广播给房内成员；第三人收到 `room-full`；无效 JSON 和超大消息被关闭；频繁猜码被限流。

- [ ] **步骤 2：运行测试确认失败**

运行：`npm test -- apps/server/tests/server.test.ts`

预期：FAIL，原因是服务器工厂尚不存在。

- [ ] **步骤 3：实现可测试的服务器工厂**

导出 `createWatchPairServer(options)`，返回 `{ httpServer, close }`。HTTP 使用 Express，WebSocket 使用 `ws` 的 `WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 })`。每条消息先由共享 Zod schema 校验，再交给 `RoomStore`。

- [ ] **步骤 4：实现加入限流和连接清理**

`JoinRateLimiter` 按网络地址维护一分钟滑动窗口，允许最多 20 次加入尝试；连续失败后返回 `rate-limited`。连接关闭时调用 `leave`，并向仍在线的成员广播 presence。

- [ ] **步骤 5：运行服务端测试确认通过**

运行：`npm test -- apps/server/tests/server.test.ts apps/server/tests/room-store.test.ts`

预期：全部 PASS，测试结束后无未关闭句柄。

- [ ] **步骤 6：提交 WebSocket 服务**

```bash
git add apps/server
git commit -m "feat: add WatchPair WebSocket relay"
```

## 任务 5：建立 Edge 插件构建、清单和设置存储

**文件：**
- 新建：`apps/extension/public/manifest.json`
- 新建：`apps/extension/src/shared/settings.ts`
- 新建：`apps/extension/src/shared/extension-messages.ts`
- 新建：`apps/extension/tests/settings.test.ts`
- 新建：`apps/extension/vite.config.ts`

- [ ] **步骤 1：先写设置失败测试**

测试默认服务地址、保存合法 `wss://` 地址、开发环境允许 `ws://localhost`，以及拒绝其他协议。

```ts
expect(normalizeServerUrl('wss://watchpair.onrender.com')).toBe('wss://watchpair.onrender.com');
expect(() => normalizeServerUrl('https://example.com')).toThrow('WebSocket');
expect(normalizeServerUrl('ws://localhost:3000')).toBe('ws://localhost:3000');
```

- [ ] **步骤 2：运行测试确认失败，再实现设置模块**

运行：`npm test -- apps/extension/tests/settings.test.ts`

预期：第一次 FAIL；实现后全部 PASS。

- [ ] **步骤 3：添加最小权限 Manifest V3 清单**

`manifest.json` 使用 `manifest_version: 3`，申请 `storage` 权限和 `https://www.bilibili.com/*` host permission；注册模块 Service Worker、弹出面板，以及仅匹配哔哩哔哩视频页的内容脚本。不申请 `tabs`、`webRequest` 或 cookies 权限。

- [ ] **步骤 4：配置 Vite 多入口构建**

生产构建必须输出固定文件名：`dist/background/service-worker.js`、`dist/content/content-script.js`、`dist/popup/index.html`，并复制 `manifest.json`。构建结果不包含远程 JavaScript。

- [ ] **步骤 5：构建并提交插件骨架**

运行：`npm run build -w @watchpair/extension`

预期：`apps/extension/dist/manifest.json` 存在且清单引用的文件均存在。

```bash
git add apps/extension
git commit -m "chore: scaffold Edge extension"
```

## 任务 6：以 TDD 实现哔哩哔哩适配器和媒体控制器

**文件：**
- 新建：`apps/extension/src/content/bilibili-adapter.ts`
- 新建：`apps/extension/src/content/media-sync-controller.ts`
- 新建：`apps/extension/tests/bilibili-adapter.test.ts`
- 新建：`apps/extension/tests/media-sync-controller.test.ts`

- [ ] **步骤 1：写视频识别失败测试**

使用 jsdom 构造页面，验证 `/video/BV1xx411c7mD?p=2` 解析为 `{ bvid: 'BV1xx411c7mD', part: 2 }`，没有 `p` 时默认为 1；多个 `<video>` 时选择尺寸最大且可见的元素；MutationObserver 触发后可以重新发现被替换的视频元素。

- [ ] **步骤 2：运行测试确认失败，再实现适配器**

运行：`npm test -- apps/extension/tests/bilibili-adapter.test.ts`

预期：第一次 FAIL；实现 `parseBilibiliIdentity`、`findActiveVideo` 和 `observeActiveVideo` 后全部 PASS。

- [ ] **步骤 3：写媒体控制器失败测试**

验证本地 play/pause/seeked/ratechange 生成一次操作；应用远端 pause、seek 和倍速时不回发；误差较小时不动，误差中等时临时调整倍速，误差较大时跳转；waiting/playing 只发布缓冲状态。

- [ ] **步骤 4：运行测试确认失败，再实现控制器**

运行：`npm test -- apps/extension/tests/media-sync-controller.test.ts`

预期：第一次 FAIL；实现 `MediaSyncController` 后全部 PASS。

- [ ] **步骤 5：提交页面适配和同步控制**

```bash
git add apps/extension/src/content apps/extension/tests
git commit -m "feat: synchronize Bilibili media controls"
```

## 任务 7：实现内容脚本与 Service Worker 的端到端消息流

**文件：**
- 新建：`apps/extension/src/content/content-script.ts`
- 新建：`apps/extension/src/background/service-worker.ts`
- 新建：`apps/extension/tests/service-worker.test.ts`

- [ ] **步骤 1：先写连接状态机失败测试**

用可注入的 FakeWebSocket 验证：创建房间、加入房间、服务器冷启动状态、心跳、断线后指数退避、重连后先请求快照、离开房间、页面消息转发以及旧版本消息被忽略。

- [ ] **步骤 2：运行测试确认失败，再实现连接管理器**

运行：`npm test -- apps/extension/tests/service-worker.test.ts`

预期：第一次 FAIL；实现 `RoomConnection` 后全部 PASS。

- [ ] **步骤 3：接通内容脚本**

内容脚本发现视频后创建一个 `MediaSyncController`，将本地媒体操作通过 `chrome.runtime.sendMessage` 发给 Service Worker，并监听远端操作、权威快照、presence 和错误消息。页面切换时销毁旧控制器，再绑定新视频。

- [ ] **步骤 4：执行插件测试和类型检查**

运行：`npm test -- apps/extension/tests`

运行：`npm run typecheck -w @watchpair/extension`

预期：全部 PASS，无 TypeScript 错误。

- [ ] **步骤 5：提交消息流**

```bash
git add apps/extension/src/background apps/extension/src/content apps/extension/tests/service-worker.test.ts
git commit -m "feat: connect extension to sync rooms"
```

## 任务 8：实现插件弹出面板

**文件：**
- 新建：`apps/extension/src/popup/index.html`
- 新建：`apps/extension/src/popup/main.ts`
- 新建：`apps/extension/src/popup/styles.css`
- 新建：`apps/extension/tests/popup.test.ts`

- [ ] **步骤 1：写 popup 行为失败测试**

测试创建房间、输入房间码、非法房间码提示、复制房间码、离开房间、修改服务地址，以及连接中/服务器启动中/已连接/对方离线/视频不一致/正在缓冲等状态文本。

- [ ] **步骤 2：运行测试确认失败，再实现可访问 UI**

运行：`npm test -- apps/extension/tests/popup.test.ts`

预期：第一次 FAIL；实现后全部 PASS。

UI 使用简洁的 360px 宽单列布局，表单控件均有 `<label>`，状态不只依赖颜色表达，按钮具有 disabled 和 loading 状态，房间码使用等宽大字号展示。

- [ ] **步骤 3：构建插件并核对清单引用**

运行：`npm run build -w @watchpair/extension`

预期：构建成功，`dist` 可被 Edge 作为解压缩扩展加载。

- [ ] **步骤 4：提交弹出面板**

```bash
git add apps/extension/src/popup apps/extension/tests/popup.test.ts
git commit -m "feat: add WatchPair room controls"
```

## 任务 9：添加 Render 部署配置和完整中文文档

**文件：**
- 新建：`render.yaml`
- 新建：`README.md`
- 修改：`apps/extension/src/shared/settings.ts`

- [ ] **步骤 1：添加 Render Blueprint**

`render.yaml` 定义免费的 Node Web Service，构建命令为 `npm ci && npm run build -w @watchpair/protocol && npm run build -w @watchpair/server`，启动命令为 `npm start -w @watchpair/server`，健康检查路径为 `/health`，运行时读取 Render 提供的 `PORT`。

- [ ] **步骤 2：编写中文 README**

README 必须包含：项目作用与隐私边界、Node/npm 要求、本地安装、启动服务端、构建插件、Edge 加载 `apps/extension/dist`、两人创建/加入房间、配置 Render 地址、Render 免费部署、常见问题、完整验证命令。

- [ ] **步骤 3：验证部署构建和健康检查**

运行：`npm run build`

运行：启动服务后请求 `http://127.0.0.1:<port>/health`

预期：HTTP 200，正文为 `{ "status": "ok" }`。

- [ ] **步骤 4：提交部署和文档**

```bash
git add render.yaml README.md apps/extension/src/shared/settings.ts
git commit -m "docs: add deployment and usage guide"
```

## 任务 10：端到端验证与交付构建

**文件：**
- 可能修改：仅修改本任务验证发现的问题对应文件
- 生成但不提交：`apps/extension/dist/`

- [ ] **步骤 1：执行完整自动验证**

运行：`npm run verify`

预期：所有测试通过，类型检查零错误，ESLint 零错误，Prettier 检查通过，三个工作区构建成功。

- [ ] **步骤 2：检查插件产物和权限**

确认 `dist/manifest.json` 只包含 `storage` 与哔哩哔哩 host 权限；清单引用文件全部存在；构建产物不包含 `eval(`、远程 `<script src="http` 或未打包的源映射。

- [ ] **步骤 3：执行本地双客户端验收**

在两个 Edge 配置文件中加载同一构建，使用本地 WebSocket 服务创建和加入房间，逐项验证播放、暂停、跳转、倍速、不同视频保护、刷新恢复、短暂断网和退出房间。

- [ ] **步骤 4：记录无法自动完成的外部验证**

如果当前环境不能打开两个真实 Edge 会话或不能部署 Render，在 README 的“人工验收”部分明确标记待用户执行的步骤，不得把未执行项目声称为已通过。

- [ ] **步骤 5：提交最终修正**

```bash
git add apps packages README.md render.yaml
git commit -m "fix: address WatchPair acceptance findings"
```

- [ ] **步骤 6：确认仓库状态与提交历史**

运行：`git status --short`

预期：工作区干净。

运行：`git log --oneline --decorate -12`

预期：设计、计划和每个独立实现阶段都有清晰提交。
