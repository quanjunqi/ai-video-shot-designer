# C4 Context & Container

> 本文件回答：**系统边界在哪、有哪些可部署单元、谁调用谁**。
> 图与代码不一致时以代码为准（事实来源见 [README](README.md#事实来源可复现校验)）。

---

## L1 · 系统上下文（System Context）

谁在用这个系统，它依赖哪些外部系统。

```mermaid
flowchart TB
    Creator(["创作者<br/>导演 / 编剧 / 剪辑"])
    Owner(["项目 Owner<br/>审批与合并"])

    subgraph SYS["漫剧导演工坊"]
        Platform["一站式 AI 漫剧 / 短剧 / 影视创作平台<br/>剧本 → 分镜 → 资产 → 视频"]
    end

    subgraph EXT_AI["外部 AI 后端"]
        Transit["中转站 API<br/>PearAPI / Grsai 等"]
        Official["官方 API<br/>OpenAI / MiniMax / 即梦"]
        Comfy["ComfyUI<br/>本地或云端 GPU"]
    end

    OIDC["OIDC 身份提供商<br/>Keycloak<br/>（已提供容器，业务未接入）"]
    ObjectStore["S3 兼容对象存储<br/>MinIO<br/>（asset 已接入）"]
    Git["GitHub<br/>PR / CI / 分支保护"]

    Creator -->|"创作、确认每个阶段的产物"| Platform
    Owner -->|"审阅并合并变更"| Git
    Git -->|"CI 门禁通过后进入主干"| Platform

    Platform -->|"统一网关调用（含审计）"| Transit
    Platform -->|"统一网关调用（含审计）"| Official
    Platform -->|"工作流调用"| Comfy
    Platform -->|"媒体读写"| ObjectStore
    Platform -.->|"用户身份校验（规划中）"| OIDC

    classDef planned stroke-dasharray: 5 5,fill:#fafafa
    class OIDC,Comfy planned
```

**图注**：虚线/淡色表示**尚未接通**。ComfyUI 执行器属 Phase 2.2/2.3（见 `docs/adr/001`）；OIDC 目前未接入，BFF 使用固定开发身份（见下 L2 与「信任模型」）。

---

## L2 · 容器图（Container）

可独立部署的单元、进程边界、数据存储。

```mermaid
flowchart TB
    Browser(["浏览器<br/>创作者"])

    subgraph EDGE["接入层"]
        Web["web<br/>React 19 SPA + Nginx<br/>端口 :WEB_PORT<br/>代理 /api/v1/* → BFF"]
    end

    subgraph APP["应用层（Go）"]
        BFF["web-bff :8080<br/>前端唯一入口<br/>无状态聚合，无自有数据库"]
        WS["workspace :18082<br/>成员 / 授权 / 渠道凭据"]
        PR["production :18081<br/>项目 / 剧集 / 分镜 / 模型目录"]
        EX["execution :8085<br/>Job 调度 / 模型网关 / 审计日志"]
        AS["asset :18084<br/>资产上传 / 媒体校验"]
        OB["outbox-relay<br/>无监听端口<br/>事务性消息投递 worker"]
    end

    subgraph DATA["数据层（PostgreSQL 16.8 共享实例，逻辑分库）"]
        DWS[("workspace 库")]
        DPR[("production 库<br/>+ production_test")]
        DEX[("execution 库")]
        DAS[("asset 库")]
    end

    MinIO[("MinIO<br/>S3 兼容")]
    ExtAI["外部 AI 后端<br/>HTTP / 异步任务"]

    Browser -->|"HTTPS"| Web
    Web -->|"HTTP /api/v1/*"| BFF

    BFF -->|"Bearer WORKSPACE_INTERNAL_TOKEN"| WS
    BFF -->|"Bearer PRODUCTION_INTERNAL_TOKEN"| PR
    BFF -->|"Bearer EXECUTION_INTERNAL_TOKEN"| EX
    BFF -->|"Bearer ASSET_INTERNAL_TOKEN"| AS

    EX -->|"取模型/协议目录快照"| PR
    EX -->|"reveal 渠道凭据"| WS
    EX -->|"HTTP 调用 + 审计写入"| ExtAI

    OB -->|"轮询 outbox_events"| DPR
    OB -->|"转换后投递"| EX

    WS --> DWS
    PR --> DPR
    EX --> DEX
    AS --> DAS
    AS -->|"PutObject"| MinIO

    classDef noPort fill:#eef7ee
    class OB noPort
```

---

## 调用矩阵（谁调用谁、用什么鉴权）

| 调用方 → 被调用方 | 协议 | 鉴权 | 代码位置 |
|---|---|---|---|
| 浏览器 → web | HTTPS | （规划中：OIDC 会话） | — |
| web → web-bff | HTTP `/api/v1/*` | 固定开发身份（`BFF_DEV_*`） | `services/web-bff/cmd/server/main.go` |
| web-bff → workspace / production / execution / asset | HTTP `/internal/v1/*` | `Authorization: Bearer <SERVICE>_INTERNAL_TOKEN` | 同上 |
| execution → production | HTTP | `PRODUCTION_INTERNAL_TOKEN` | `services/execution/internal/engine`+`catalog` |
| execution → workspace | HTTP | `WORKSPACE_INTERNAL_TOKEN` | `services/execution/internal/creds` |
| execution → 外部 AI | HTTP(S) | 渠道凭据（workspace 加密存储，运行时 reveal） | `services/execution/internal/engine/engine.go` |
| outbox-relay → production 库 | PostgreSQL | DSN | `services/outbox-relay/cmd/server/main.go` |
| outbox-relay → execution | HTTP | DSN 中的 execution 地址 | 同上 |
| asset → MinIO | S3 API | `ASSET_S3_ACCESS_KEY` / `ASSET_S3_SECRET_KEY` | `services/asset/internal/asset/store.go` |

**服务间鉴权实现**：下游服务用 `crypto/subtle.ConstantTimeCompare` 比对内部令牌（常量时间，抗时序侧信道），见 `services/workspace/internal/httpapi/handler.go:70`。

---

## 信任模型（当前状态，务必知悉）

```mermaid
flowchart LR
    U["终端用户"] -->|"① 无强身份校验"| BFF["web-bff"]
    BFF -->|"② 注入固定身份 ws_dev / actor_local"| WS["workspace 授权"]
    BFF -->|"③ Bearer 静态内部令牌"| SVC["各领域服务"]
    SVC -->|"④ 仅校验内部令牌，不校验终端用户"| DB[("领域库")]
```

- **① 缺口**：浏览器到 BFF 之间没有真实身份校验（无 OIDC/JWT）。BFF 直接采用 `BFF_DEV_WORKSPACE_ID` / `BFF_DEV_ACTOR_ID` 作为身份。
- **② 补偿**：BFF 会拿该身份去 workspace 做一次授权（`errAuthorizationDenied`），因此**越权仍会被拦截**，但身份本身可伪造。
- **③④ 现状**：服务信任「持有内部令牌的调用方」；令牌是静态共享密钥，非 mTLS、非短期凭证。

> **结论**：当前信任模型**仅适用于本地开发/单机验证**，不可直接对外。生产化必须补 OIDC + 短期凭证或 mTLS。此项与 `docs/architecture/00-technical-architecture.md` §14「多租户与安全」的目标态对应，属**已知未完成项**，不是隐形缺陷。

---

## 中间件接入状态（代码实证）

`deploy/local/compose.yaml` 的 `platform` profile 提供以下中间件，但**并非都已接入业务代码**：

| 中间件 | 容器已提供 | 业务代码已接入 | 证据 |
|---|---|---|---|
| PostgreSQL 16.8 | ✅ | ✅ 4 个服务全部使用 | `pgxpool`；`services/*/internal/**/postgres.go` |
| MinIO（S3） | ✅ | ✅ asset 使用 | `services/asset/internal/asset/store.go:113` |
| Redis | ✅ | ❌ **未接入** | Go 代码 0 命中 |
| Kafka + Schema Registry | ✅ | ❌ **未接入** | Go 代码 0 命中 |
| Temporal + UI | ✅ | ❌ **未接入** | Go 代码 0 命中 |
| Keycloak（OIDC） | ✅ | ❌ **未接入** | 无 jwt/oidc 校验；BFF 用固定开发身份 |

**读图提醒**：不要因为 compose 里有 Redis/Kafka/Temporal 就假定架构已使用它们。
`docs/architecture/00-technical-architecture.md` §17 已明确「任务中心、Temporal 业务 Workflow 和 Provider 模拟器尚未实现」。

---

## 相关文档

- 请求/生成的完整流转见 [02-key-sequences.md](02-key-sequences.md)
- 数据归属与分库见 [03-data-model.md](03-data-model.md)
- 本地与目标生产拓扑见 [05-deployment.md](05-deployment.md)
- 为什么网关内置于 execution 而非新建服务：[ADR-001](../adr/001-model-gateway-architecture.md)
