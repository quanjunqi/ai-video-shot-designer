# 怎么把代码同步到服务器（120.25.150.72）

本文回答一个问题：**本地 `git push` 之后，怎么把新代码部署到那台生产机器上，以及怎么回滚。**

目标机器现状（2026-10-26 实测）：

| 项 | 值 |
|---|---|
| 域名 | `https://qjqhs.fun`（nginx 443，Let's Encrypt/自签证书在 `/etc/nginx/ssl/`） |
| 代码工作副本 | `/root/ai-video-shot-designer`（git，跟踪 `origin/develop`） |
| 发布产物 | `/opt/shotdesigner/releases/<UTC时间>-<短SHA>/`，`current` 软链指向最新 |
| 运行时 | 6 个 systemd 实例 `shotdesigner@{workspace,production,asset,execution,outbox-relay,web-bff}` |
| 静态根 | `/usr/share/nginx/html` → `/opt/shotdesigner/current/web`（软链，切版本不用改 nginx） |
| 中间件 | docker compose：`shotdesigner-postgres-1`、`shotdesigner-redis-1`、`shotdesigner-minio-1`（生产 MinIO，`127.0.0.1:19000`） |
| 密钥 | `/etc/shotdesigner/env`（0600，**不入 git**） |

---

## TL;DR：日常部署只需一条命令

```powershell
# 在仓库根目录（Windows）
scripts\deploy-remote.cmd -Push
```

> 直接跑 `.ps1` 可能被 PowerShell 执行策略拦下；`.cmd` 包装器用
> `-ExecutionPolicy Bypass` 只对本次调用放行。也可以手动：
> `pwsh -ExecutionPolicy Bypass -File scripts/deploy-remote.ps1 -Push`

它做三件事：

1. `git push` 当前分支到 GitHub；
2. `ssh root@120.25.150.72` 执行服务器上的 `/usr/local/bin/shotdesigner-deploy origin/develop`；
3. 校验**服务器实际部署的 commit == 本地 `origin/develop`**，不一致就报错退出。

不想用脚本，直接 ssh 也行：

```bash
ssh root@120.25.150.72 'shotdesigner-deploy origin/develop'
```

部署输出末尾会打印一行 `DEPLOYED_SHA=<40位sha>`，方便脚本/人核对。

### 免密登录（一次性）

`deploy-remote` 需要能非交互地 ssh 到服务器。已把本机公钥
（`~/.ssh/id_ed25519.pub`，注释 `front-pc-clone`）装进服务器 `root` 的
`authorized_keys`；换机器时：

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@120.25.150.72 "cat >> /root/.ssh/authorized_keys"
ssh root@120.25.150.72 "chmod 600 /root/.ssh/authorized_keys"
```

撤销：在服务器的 `/root/.ssh/authorized_keys` 里删掉对应行。

---

## 服务器上到底发生了什么

`deploy.sh` 的流程（全部在服务器上跑，服务器自己从 GitHub 拉代码）：

```
git fetch --depth 1 origin develop   # 浅克隆，约 19MB / 数秒
git reset --hard + git clean -fdq    # 工作副本 == 目标 commit
go build ×6                          # 产物写入 releases/<new>/bin/
npm run build（仅前端有变更时）        # 产物写入 releases/<new>/web/
ln -sfn new current（原子 mv -T）      # 切换版本
systemctl restart shotdesigner@*      # 按序重启
/ready 健康检查 ×5 + outbox 存活检查    # 失败 → 自动把 current 指回上一个 release 并重启
```

几个刻意的设计：

- **构建期间旧版本仍在服务**：只有最后「切换 + 重启」的几秒会短暂中断（nginx 会短暂 502）。
- **每个 release 不可变**：回滚 = `current` 指回去 + 重启，**不需要重新构建**。
- **前端未变更时复用上一个 release 的产物**（硬链接），这台机器只有 1.8G 内存，省一次 vite 构建。
- **前端产物合并**：妙搭产物协议把 `dist/output`（index.html/静态资源）与 `dist/output_resource/assets`（JS/CSS）分开，nginx 只有一个静态根，部署时合并进同一条 release 的 `web/`。
- 只保留最近 5 个 release。

---

## 回滚

自动回滚：健康检查失败时脚本自己回滚，退出码 1。

手动回滚到上一个 release：

```bash
ssh root@120.25.150.72 '
  cd /opt/shotdesigner &&
  prev=$(ls -1dt releases/*/ | sed -n 2p) &&
  ln -sfn "$prev" current.tmp && mv -T current.tmp current &&
  systemctl restart "shotdesigner@workspace" "shotdesigner@production" "shotdesigner@asset" \
                     "shotdesigner@execution" "shotdesigner@outbox-relay" "shotdesigner@web-bff" &&
  echo "rolled back to $prev"'
```

或者退回某个 commit（会重新构建）：

```bash
ssh root@120.25.150.72 'shotdesigner-deploy origin/master'
```

---

## 一次性初始化（已经做过，说明留档）

服务器原先是用 `start-bin.sh` 里的 `nohup` 裸跑 6 个二进制、`pkill` 重启，没有 systemd、没有版本目录。
`deploy/server/install.sh` 把它改造成现在的形态：

```bash
# 1) 生成 /etc/shotdesigner/env（0600，从旧 start-bin.sh 的取值迁移）
# 2) 安装 shotdesigner@.service，enable 6 个实例
# 3) /usr/local/bin/shotdesigner-deploy  ← deploy.sh 的稳定副本
# 4) 首次部署
# 5) /usr/share/nginx/html → current/web（失败自动还原）
ssh root@120.25.150.72 'bash /root/ai-video-shot-designer/deploy/server/install.sh'
# 仓库里还没有 deploy/server 时（PR 未合并且工作副本已 reset），用引导副本：
ssh root@120.25.150.72 'bash /root/bootstrap/deploy/server/install.sh'
```

`install.sh` 幂等，可重复执行；`--no-deploy` / `--no-nginx` 可只做其中一步。

---

## 日常操作

```bash
# 看服务状态
systemctl status 'shotdesigner@web-bff'

# 看日志（journald，不再写 logs/*.log）
journalctl -u shotdesigner@workspace -f
journalctl -u shotdesigner@asset -n 100 --no-pager

# 重启单个服务
systemctl restart shotdesigner@asset

# 本次部署的 commit / release
cat /opt/shotdesigner/CURRENT_RELEASE; readlink /opt/shotdesigner/current

# 部署历史（脚本日志）
tail -50 /var/log/shotdesigner-deploy.log
```

---

## 常见问题

**Q：服务器能拉到 GitHub 吗？**
能，但**不稳定**（`github.com:443` 时常被重置，`codeload.github.com` / `api.github.com` 基本可达）。
所以部署用的是 `git fetch --depth 1`（数据量最小），失败时直接报错退出，不会部署到一半的版本。
如果连续失败，先手测：

```bash
ssh root@120.25.150.72 'timeout 30 git -C /root/ai-video-shot-designer fetch --depth 1 origin develop && echo OK'
```

**Q：本地 `git push` 卡住 / connection reset？**
这台机器边上有个本地代理（`127.0.0.1:7897`），但 git 默认不走系统代理：

```powershell
git -c http.proxy=http://127.0.0.1:7897 push origin <branch>
# 想长期生效（只影响本机）：git config --global http.proxy http://127.0.0.1:7897
```

注意**服务器**不使用这个代理（它是你机器的回环地址），服务器直连 GitHub。

**Q：改了 `/etc/shotdesigner/env` 要做什么？**
`systemctl restart shotdesigner@<服务名>`，或全量重启 6 个服务。
`WORKSPACE_CRED_KEY` 一旦库里有凭据数据就**不能改**（改了历史凭据解不开）。

**Q：asset 上传 500 / web-bff `/ready` 503？**
asset 依赖 MinIO。生产 MinIO 在 **`127.0.0.1:19000`**（`deploy/local/.env` 的 `MINIO_PORT`），
先确认 `curl -sf http://127.0.0.1:19000/minio/health/live`，再
`docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile platform up -d minio`。
部署脚本每次都会做这个检查。

> **9000 端口不是生产 MinIO**：那台机器上还跑着一个**公开的 CI 专用 MinIO**（容器名 `minio`，
> `0.0.0.0:9000`），供 GitHub Actions 的 asset 集成测试直连（见 `ci.yml` 的
> `ASSET_TEST_S3_ENDPOINT`）。两者是不同容器、不同数据卷，别停错。

**Q：为什么不直接在服务器上 `git pull` 后 `pm2/nohup` 重启？**
旧做法的三个问题：没有版本目录（回滚只能靠重新构建）、`pkill -f` 可能误杀、重启靠手工脚本且开机不自启。
现在的做法把「构建产物不可变 + 软链切换 + systemd 托管」三件事拆开了，回滚是常数时间。

**Q：这次改造前的状态备份在哪？**
`/root/backups/20261026-145801/`（源码 tar、旧脚本、端口/容器/nginx 快照）。

**Q：`/root/ai-video-shot-designer/deploy/local/.env` 里的口令是生产口令？**
是。目前生产沿用本地 compose 的口令与内部令牌（`*_token_2026`），属于待还的技术债：
上线前应改为密钥管理注入的随机值（同时改 `/etc/shotdesigner/env` 与 `deploy/local/.env`）。

**Q：`/root/ai-video-shot-designer/.git/config` 里有个 GitHub PAT？**
历史遗留（已随本次改造从 remote URL 中移除，改用公开 HTTPS 拉取）。**那个 token 应尽快吊销。**

---

## 相关文件

| 文件 | 作用 |
|---|---|
| `deploy/server/deploy.sh` | 服务器端部署主脚本（拉取→构建→切换→重启→健康检查→回滚） |
| `deploy/server/install.sh` | 一次性初始化（systemd / 环境变量 / nginx 静态根） |
| `deploy/server/systemd/shotdesigner@.service` | systemd 模板单元 |
| `deploy/server/env.example` | `/etc/shotdesigner/env` 的变量清单模板 |
| `scripts/deploy-remote.ps1` | 本地一键触发 + 部署结果校验 |
| `scripts/deploy-remote.cmd` | 上面的 Windows 包装器（绕开 PS 执行策略） |
| `docs/how-to/release.md` | 版本号、打 tag、热修流程（本文只管「怎么落到服务器」） |
