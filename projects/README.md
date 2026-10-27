# 独立配套项目

每个目录均可单独复制、安装和运行。根目录不提供 Node 依赖，不使用 npm workspace 或兄弟项目的源码链接。

| 项目 | 章节 | 内容 |
|---|---|---|
| [01-shipping-lab](01-shipping-lab/README.md) | 01、02、03、04 | 运费边界练习 |

进入某个项目后执行 `npm ci --ignore-scripts --cache .pi/npm-cache`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm test`。具体实验命令及验证范围见各项目 README。

需要运费任务的项目各自包含参考实现、故障起点与验收脚本。这些文件的重复是独立分发的结果，修改一个项目不会改变另一个项目。各项目 .pi 目录只保存该项目运行产物。

04-service-lab 提供 SQLite 与隔离实验，07-multi-agent 提供计划校验；完整 HTTP 平台、自动恢复与 DAG 调度仍待实现。
