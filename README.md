# Pi Agent 实战：从第一次运行到自建 Agent Harness

从国内订单满 50 元免基础运费的边界 bug 出发，学习 Pi 的 CLI、工作流、SDK 和运行控制，再探索服务与进阶接口。

教程使用 Pi 1.4.0。资料基线为 2026-10-23，配套代码于 2026-10-27 拆分为十个独立项目。

- [配套项目与章节映射](projects/README.md)
- [术语与职责边界](docs/reference/glossary.md)
- [终端、Git 与副本速查](docs/reference/terminal-git.md)

## 开始运行

课程根目录只保存文档与 Python 维护脚本，没有共享 package.json 或 node_modules。每个项目都有自己的 package.json、lockfile、依赖和运行入口，可以单独复制使用。

准备 Node >=22.19.0；第 07 章 MCP 实验需 Node >=24，Python RPC 需 Python >=3.11。先进入第 01–04 章的项目：

```bash
cd projects/01-shipping-lab
npm ci --ignore-scripts --cache .pi/npm-cache
npm test
npm run lab:init
npm run lab:check
```

最后一条在新副本上应失败：国内 5000 分的普通和加急两项保留了预设 bug。修改副本 src/shipping.ts 后再运行同一检查。已有副本不会覆盖，重练时指定新名称并同步 workspace。

切换章节前查看章首的项目路径。相同项目内可以沿用练习副本，不同项目不共享依赖或运行记录。真实模型请求需要自行配置凭据。

## 独立项目

| 项目 | 对应章节 | 内容 |
|---|---|---|
| [01-shipping-lab](projects/01-shipping-lab/README.md) | 01、02、03、04 | 运费边界练习 |

服务项目提供 SQLite 与隔离实验，多 Agent 项目提供计划校验；完整 HTTP 平台、自动恢复与 DAG 调度仍是正文中的建设方案。

## 正文目录

### 第一次真实任务

- [01 认识 Pi，完成安装与模型连接](docs/chapters/01-first-run.md)
- [02 读懂仓库，完成并审阅第一次修改](docs/chapters/02-first-repository-task.md)

### 理解执行过程

- 03 理解 Agent 运行、上下文与会话控制
- 04 任务契约与最小评测

### 定制研发工作流

- 05 项目指令与可复用步骤
- 06 用工具扩展与事件组织研发流程
- 07 MCP 与 Codemode
- 08 将工作流封装为 Pi Package

### 构建自己的 harness

- 09 选择集成方式，建立可控的 SDK 闭环
- 10 任务生命周期、预算与中断恢复
- 11 子 Agent 协作与可审阅的结果包

### 把 harness 做成服务

- 12 将 harness 做成受控服务
- 13 工作区与执行隔离
- 14 并发与故障恢复
- 15 评测与运行证据
- 16 部署验收与版本升级

### 进阶专题

- 17 虚拟模型与任务路由
- 18 进阶多 Agent 编排
- 19 使用 agent-core 掌控循环
- 20 Pi Durable 与长任务
- 21 跨语言 RPC 集成
- 22 源码导航与复杂迁移案例

## 本地检查

在任意独立项目内运行：

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

在课程根目录检查全部项目与文章：

```bash
python3 scripts/verify_projects.py
python3 scripts/check_docs.py
python3 -m unittest discover -s scripts -p 'test_build_book.py' -v
```

首次安装全部项目可用 python3 scripts/verify_projects.py --install。文档合并使用 python3 scripts/build_book.py，上游检查使用 python3 scripts/check_upstream.py；这些维护脚本不提供共享的 Node 运行环境。

第三方来源与许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
