-- 030: 修正 MiniMax 异步终态字面量（权威枚举）+ 终态匹配的容错
--
-- 背景（真实缺陷）：执行器 engine.go 的异步轮询原来用大小写敏感的精确比较判定终态
--   if status == async.DoneValue { ... }   if status == async.FailValue { ... }
-- 而迁移 008 给 MiniMax 视频模板写的是 doneValue=Success / failValue=Failed，
-- 与 MiniMax 官方文档的 status 枚举**都不相等**：
--   status  enum<string>  queued | in_progress | completed | failed
-- ⇒ 成功与失败都检测不到，MiniMax 视频任务在源实现下**必然空转到 6 分钟超时**
--   （成功与失败都不可用）；同时使阶段 1 的重试机制失效（超时与失败在语义及
--   重试策略上不同）。
--
-- 【域名的差异 —— 值有据但域名未证实】
--   上述枚举取自国际站文档 platform.minimax.io；而本模板渠道的 base_url 是
--   api.minimax.chat（国内站）。同一产品线的两个域名**理论上**枚举一致，但这一点
--   未能证实。这里按文档取值 completed / failed（有据），不做无依据的「两个都列」
--   （那会掩盖真实契约）。万一 .chat 的实际枚举不同 —— 由于本次已在执行器侧引入
--   容错匹配（逗号分隔候选 + 大小写不敏感），届时只需再补一条 jsonb_set 数据修正，
--   无需改代码、无需发布。
--
-- 【两套 MiniMax 枚举的区分（避免后来者误改）】
--   本模板轮询响应取**顶层 status**（async.statusField = "status"），对应枚举
--   queued / in_progress / completed / failed，故 doneValue=completed、failValue=failed。
--   注意 MiniMax 另一套接口使用嵌套的 task.status（枚举含 queued / running /
--   succeeded / failed / cancelled）。由于已引入逗号分隔 + 大小写不敏感的容错匹配，
--   万一实际契约是后者，只需一条 jsonb_set 把 doneValue 补为 "completed,succeeded"
--   （failValue 补为 "failed,cancelled" 等），**无需改代码**。
--   in_progress / queued 是有意的「继续轮询」态，不得判为终态。
--
-- 配套改动（两侧必须一致）：
--   services/execution/internal/engine/terminal_value.go —— matchesTerminalValue()
--     支持逗号分隔候选 + 大小写不敏感（终态匹配的唯一入口，共 2 处调用点）；
--   services/production/internal/catalog/protocol_registry.go —— 注册表（内置默认值
--     的权威来源）同步为 completed / failed。
--
-- 修法：jsonb_set(async, '{doneValue}' / '{failValue}', ...) 分别只覆盖这两个键。
--   enabled / taskIdField / statusField / pollPath 及其它任何键原样保留
--   （不整体重写 async，避免丢字段；管理员已自定义的键也不会被覆盖）。
--
-- 只改这一行的两个键，不改表结构、不删列、不动其它模板。

UPDATE protocol_templates
SET async = jsonb_set(
        jsonb_set(async, '{doneValue}', to_jsonb('completed'::text), true),
        '{failValue}', to_jsonb('failed'::text), true),
    updated_at = now()
WHERE id = 'pt_builtin_minimax_video';
