# ADR-010：单机生产部署采用「systemd + 不可变 release + 软链切换」

## 状态

- **编号**：010
- **状态**：已接受
- **日期**：2026-10-26
- **决策者**：Owner（quanjunqi）
- **相关 ADR**：无

---

## 背景

- **当前情况**：生产机 `120.25.150.72`（`https://qjqhs.fun`）此前用 `start-bin.sh` 里的
  `nohup` 直接拉起 6 个 Go 二进制，产物落在仓库工作副本 `bin/` 内，重启靠 `pkill -f` + 重新
  `nohup`；nginx 静态根是手工拷贝的 `/usr/share/nginx/html`；服务器上的源码目录是一个**零提交**
  的 git 仓库（tar 解压后 `git init`），无法 `git pull`。
- **面临的问题**：
  1. **回滚不存在**：没有历史版本，出问题只能重新构建，恢复时间取决于构建时间（本机约 40s–2min）。
  2. **重启不可靠**：`pkill -f "$BIN/"` 依赖路径匹配，误杀/漏杀都可能；进程是孤儿（PPid=1），
     开机不自启，机器重启后服务不会回来。
  3. **同步靠人工**：代码从开发机手工拷到服务器，无法回答「线上跑的是哪个 commit」。
  4. **网络约束**：该机器到 `github.com:443` **间歇性**超时/重置（实测同一台机器 0.8s 成功与
     20s 超时可能相隔数分钟），依赖 GitHub 的自动化必须容忍失败、且不能部署「半截代码」。
- **约束条件**：单台 2C/1.8G 无 swap；不引入新的编排系统（K8s/Helm 未交付，见
  [deployment.md](../architecture/deployment.md) 目标形态）；PostgreSQL/Redis/MinIO 仍由
  docker compose 提供；改动必须能在现有域名与端口不变的前提下灰度。

---

## 决策

**我们决定**：

生产部署采用**单机、无编排器**的形态，由四部分组成：

1. **不可变 release 目录**：每次部署产出 `/opt/shotdesigner/releases/<UTC时间>-<短SHA>/`，
   内含 `bin/`（6 个二进制）与 `web/`（前端产物），产出后不再修改。
2. **原子软链切换**：`/opt/shotdesigner/current` 指向某个 release（`ln -sfn` + `mv -T`），
   systemd 单元与 nginx 静态根都经由该软链解析；切换即换版本。
3. **systemd 托管**：`shotdesigner@.service` 模板 + 6 个实例，`Restart=always`、开机自启、
   日志入 journald；密钥通过 `EnvironmentFile=/etc/shotdesigner/env`（0600）注入。
4. **部署即校验**：`deploy.sh` 浅拉取目标 commit → 构建 → 切换 → 逐项 `/ready` 健康检查；
   任一项失败自动把 `current` 指回上一个 release 并重启。前端未变更时复用上一 release 的产物
   （硬链接），避免在这台 1.8G 机器上重复跑 vite 构建。

GitHub 侧的失败策略：`git fetch --depth 1` 重试 3 次，仍失败**直接退出**，不进入构建阶段。

---

## 备选方案

### 方案 A：维持 `git pull` + `pkill` + `nohup`（原状）

**优点**：零改造。
**缺点**：无版本目录 ⇒ 无秒级回滚；重启靠进程名匹配；开机不自启；无法确认线上 commit。
**结论**：不选，问题正是本次要解决的。

### 方案 B：生产全部容器化（docker compose 直接跑 app profile）

**优点**：与 `deploy/local/compose.yaml` 一套描述，镜像可复用 CI 产物。
**缺点**：1.8G 内存上同时跑 6 个 Go 服务 + 前端 + PostgreSQL/Redis/MinIO 余量更紧；镜像内构建
会把 Go/Node 工具链搬进镜像，构建时间反而变长；当前 compose 面向本地联调（固定开发身份、
`127.0.0.1` 端口绑定），直接当生产用会固化这些假设。
**结论**：不选为**当前**方案，但保留为后续生产化的路径（届时配合镜像与 Helm）。

### 方案 C：K8s / Helm（`docs/architecture/deployment.md` 的目标形态）

**优点**：滚动升级、多副本、声明式回滚。
**缺点**：需要集群、镜像仓库、Secret 管理、监控栈，当前只有一台机器，成本与复杂度远超收益。
**结论**：不作为本次交付，作为目标态保留。

### 方案 D：`rsync` 推产物（本地构建后上传）

**优点**：服务器不装 Go/Node 也可部署。
**缺点**：需全量上传（每次数十 MB），且「线上对应哪个 commit」要靠额外元数据维护；本地与
服务器 ABI/依赖若不一致，问题更隐蔽。
**结论**：不选；改为**服务器自建**（Go 1.26 + Node 22 已就绪，增量构建 4–70s）。

---

## 决策理由

- **回滚必须是常数时间**：release 目录不可变 + 软链切换，使「回滚」从「重新构建」变成
  「改一个软链 + 重启」，实测 8–13s 内完成一次切换。
- **不让部署工具成为新的单点**：不引入 Ansible/CI Runner/私有镜像仓库；`deploy.sh` 是仓库内的
  普通 bash 脚本，可读、可审、可在服务器上直接调试。
- **对齐既有事实**：服务器已有 Go/Node 与 docker，最小改动即可复用；不迁移数据、不改域名端口。
- **对网络故障 fail-closed**：拉取失败即中止，宁可「这次没部署」，也不能「部署到旧代码却报成功」。

---

## 后果

### 正面影响

- 部署一次 8–13s（首次 71s+26s），失败自动回滚，线上 commit 可查（`DEPLOYED_SHA=` 与
  `/opt/shotdesigner/CURRENT_RELEASE`）。
- 服务具备重启自愈与开机自启；日志统一进 journald。
- 服务端口收敛到 `127.0.0.1`，外部只能经 nginx 进入。

### 负面影响

- **仍是单机**：没有副本、没有滚动升级，切换瞬间有秒级 502；数据库无 HA。
- **构建与运行争抢内存**：1.8G 无 swap，前端构建需 `NODE_OPTIONS=--max-old-space-size=1536`，
  且只在 `apps/web` 变更时才构建。
- **依赖服务器直连 GitHub**：网络抖动时部署会失败（会明确报错，不会静默）。
- **密钥仍是环境变量**：尚未接入 KMS/Secret Manager。

### 需要做的工作

- 密钥轮换：`/etc/shotdesigner/env` 中的内部令牌为早期弱口令，应改为随机值；
  `WORKSPACE_CRED_KEY` 因已有加密数据不可直接更换（需先做重加密迁移）。
- 生产身份：`BFF_DEV_WORKSPACE_ID`/`BFF_DEV_ACTOR_ID` 仍是固定开发身份，待 OIDC 接入。
- 备份与监控：数据库备份、`/ready` 外部探测、磁盘水位告警尚未接入。

---

## 验证

- **验证指标**：部署耗时、健康检查通过率、回滚可用性、线上 commit 可核对。
- **验证时间**：2026-10-26 15:02–15:20（首轮改造与实测）
- **验证结果**：
  - 首次部署：后端 71s + 前端 26s，6/6 服务健康（`workspace/production/execution/asset/web-bff`
    的 `/ready` 返回 204，`outbox-relay` active）。
  - 增量部署（仅后端变更）：4–8s；前端未变更时复用上一 release（`WEB_TREE` 相同）。
  - 幂等：同一 commit 重跑输出「已经是 `<short sha>`，无需部署」并以 0 退出。
  - 端点：`https://qjqhs.fun` 首页 200、`/api/v1/me` 200、`/assets/*` 200。
  - 进程可追溯：6 个 `MainPID` 的 `/proc/<pid>/exe` 均指向 `releases/<id>/bin/*`。

---

## 参考资料

- 操作手册：[docs/how-to/deploy-server.md](../how-to/deploy-server.md)
- 拓扑与端口：[docs/architecture/deployment.md](../architecture/deployment.md)
- 发布流程：[docs/how-to/release.md](../how-to/release.md)

---

## 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|---|---|---|---|
| 2026-10-26 | 1.0 | 初始版本 | quanjunqi |
