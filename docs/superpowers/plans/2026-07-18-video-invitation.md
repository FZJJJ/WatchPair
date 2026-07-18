# 同步视频邀请 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许房间成员确认后跳转到发起方当前的哔哩哔哩视频并应用其播放状态。

**Architecture:** 协议与 Node 中转服务转发一次性视频邀请。扩展后台用 Edge 通知完成任意网页的确认，并把确认后的邀请交给目标 B 站页面的内容脚本应用。

**Tech Stack:** Manifest V3、TypeScript、Zod、Node `ws`、Vitest、Chrome Extensions API。

---

### Task 1: 协议与服务端邀请转发

**Files:**
- Modify: `packages/protocol/src/messages.ts`
- Modify: `apps/server/src/index.ts`
- Test: `packages/protocol/tests/messages.test.ts`
- Test: `apps/server/tests/server.test.ts`

- [ ] 编写失败测试：协议接受有效邀请并拒绝非 B 站 URL；服务端将邀请只转发给另一位成员。
- [ ] 运行：`npm test -- packages/protocol/tests/messages.test.ts apps/server/tests/server.test.ts`，预期失败，提示未知消息类型。
- [ ] 添加 `video-invitation` 消息 schema、服务器解析分支和 `broadcast(..., socket)` 转发。
- [ ] 重新运行上述测试，预期通过。

### Task 2: 后台确认与安全导航

**Files:**
- Modify: `apps/extension/public/manifest.json`
- Modify: `apps/extension/src/background/service-worker.ts`
- Test: `apps/extension/tests/service-worker-invitation.test.ts`

- [ ] 编写失败测试：收到邀请创建通知；点击确认导航活跃标签页；`video-ready` 只应用一次待邀请状态。
- [ ] 运行：`npm test -- apps/extension/tests/service-worker-invitation.test.ts`，预期失败。
- [ ] 增加 `notifications`、`tabs` 权限；实现邀请暂存、通知按钮、活跃标签页导航与待状态应用。
- [ ] 重新运行测试，预期通过。

### Task 3: 发起按钮与文档

**Files:**
- Modify: `apps/extension/src/popup/popup-controller.ts`
- Modify: `apps/extension/src/popup/styles.css`
- Modify: `apps/extension/src/background/service-worker.ts`
- Modify: `README.md`
- Test: `apps/extension/tests/popup.test.ts`

- [ ] 编写失败测试：房间内显示同步视频按钮并发送 `send-video-invitation`。
- [ ] 运行：`npm test -- apps/extension/tests/popup.test.ts`，预期失败。
- [ ] 实现按钮、后台发起消息、URL 标准化与错误反馈；补充中文使用说明。
- [ ] 运行：`npm run verify`，预期 0 失败；再在两套 Edge 配置中手工验证确认、拒绝和跳转后同步。
