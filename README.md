# WatchPair

WatchPair 是一个供两个人异地同步观看哔哩哔哩视频的私人 Microsoft Edge 插件。双方分别打开同一个 B 站视频，插件只同步播放、暂停、进度和倍速，不传输或存储视频内容。

## 当前范围

- Windows 桌面版 Microsoft Edge
- 哔哩哔哩普通视频页
- 每个房间最多两人
- 六位房间码，无账号和数据库
- Node.js WebSocket 中转服务

暂不支持手机端、其他视频网站、聊天、弹幕同步或浏览器商店安装。

## 环境要求

- Node.js 22 或更高版本
- npm 11 或更高版本
- Microsoft Edge 桌面版

## 本地开发

```powershell
npm install
npm run build -w @watchpair/protocol
npm run dev -w @watchpair/server
```

服务默认监听 `http://127.0.0.1:3000`，WebSocket 地址为 `ws://127.0.0.1:3000`。健康检查地址为 `http://127.0.0.1:3000/health`。

另开一个终端构建插件：

```powershell
npm run build -w @watchpair/extension
```

插件产物位于 `apps/extension/dist`。

## 在 Edge 中加载

1. 打开 `edge://extensions`。
2. 开启左侧的“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择 `apps/extension/dist` 文件夹。
5. 将 WatchPair 固定到浏览器工具栏。

本地测试时，在插件的“服务器设置”中填写 `ws://127.0.0.1:3000`。

## 两人使用

1. 双方都安装插件，并打开同一个 B 站视频及同一个分 P。
2. 一方点击“创建房间”，把六位房间码告诉另一方。
3. 另一方输入房间码并点击“加入”。
4. 任意一方播放、暂停、拖动进度或修改倍速，另一方会跟随。
5. 视频不一致时插件不会执行远端控制；短暂断网后会自动重连。

## 免费部署到 Render

1. 把本仓库推送到你自己的 GitHub 仓库。
2. 登录 Render，选择 **New > Blueprint**。
3. 连接该 GitHub 仓库，Render 会读取根目录的 `render.yaml`。
4. 创建完成后等待 `/health` 显示服务正常。
5. 复制 Render 提供的 `https://...onrender.com` 地址，并把协议改成 `wss://`。
6. 双方在插件“服务器设置”中保存同一个 `wss://...onrender.com` 地址。

Render 免费实例闲置后会休眠。第一次创建或加入房间时可能需要等待几十秒，插件会在连接成功后继续操作。

## 验证命令

```powershell
npm run verify
```

该命令依次执行自动化测试、TypeScript 类型检查、ESLint、Prettier 检查和生产构建。

## 人工验收清单

- [ ] 两个 Edge 配置文件都能加载 `apps/extension/dist`。
- [ ] 两端使用本地或 Render 服务成功创建和加入同一房间。
- [ ] 播放、暂停、跳转和倍速能双向同步。
- [ ] 不同 BV 号或分 P 不会错误同步。
- [ ] 刷新页面和短暂断网后能够恢复。
- [ ] 连续播放 10 分钟时，两端通常保持在 1 秒以内。

真实 Edge 双端测试和 Render 部署需要在有图形界面及 Render 账号的环境中人工执行，自动化测试不能替代这些步骤。

## 隐私与安全

WatchPair 不读取或保存 B 站 Cookie、账号信息、视频内容、浏览历史或房间历史。服务端只在内存中保存当前房间状态，双方离开 10 分钟后删除房间。生产环境必须使用 `wss://`。
