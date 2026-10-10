-- 032: MiniMax 视频终态的【候选值】覆盖 —— 让两套已文档化的枚举都能被识别
--
-- 背景（与 030 的关系）：030 依据 platform.minimax.io 的文档把本模板的终态字面量
--   从 doneValue=Success / failValue=Failed 改为 completed / failed，
--   并在注释里**诚实标注**「值有据但域名未证实」（本模板渠道 base_url 是国内站
--   api.minimax.chat，而取值取自国际站文档）。
--
-- 本次核实（判据：官方 OpenAPI 原文）：
--   本模板的 pollPath = /v1/query/video_generation（legacy 端点），
--   其官方文档的 VideoProcessStatus 枚举为：
--     Preparing | Queueing | Processing | Success | Fail
--   即：**对这条链路，官方文档写的是 Success / Fail**，
--   而 030 写入的 completed / failed 来自**另一套/另一代接口的文档页**。
--   ⇒ 同一产品的不同文档页给出互相冲突的枚举；照任何一页取值都可能与实际端点不符。
--
-- 修法（**零代码改动、零调用费用**）：本项目的终态匹配早已支持
--   「逗号分隔候选 + 大小写不敏感」（services/execution/internal/engine/terminal_value.go，
--   有单测；030 的注释亦已把它列为逃生口）。故这里把两套**已文档化**的枚举都列为候选：
--     doneValue = "completed,Success"      （国际站 v2 用语 + legacy 用语）
--     failValue = "failed,Fail"
--   这样无论实际返回哪一套，都能被正确识别为终态。
--
-- 边界（刻意不做的）：
--   * 不把 Preparing/Queueing/Processing（以及 queued/in_progress）列入终态 —— 它们是
--     「继续轮询」态，误判为终态会导致提前失败。
--   * 不整体重写 async，只用 jsonb_set 覆盖这两个键，其余键（enabled/taskIdField/
--     statusField/pollPath 及管理员自定义项）原样保留。
--   * **仍未做真实调用验证**（视频类真实生成会消耗付费额度，需 Owner 显式授权）。
--     因此本迁移是「按两份文档取并集」的稳健化，**不是"已实测"**。
--
-- 只改这一行的两个键，不改表结构、不删列、不动其它模板。

UPDATE protocol_templates
SET async = jsonb_set(
        jsonb_set(async, '{doneValue}', to_jsonb('completed,Success'::text), true),
        '{failValue}', to_jsonb('failed,Fail'::text), true),
    updated_at = now()
WHERE id = 'pt_builtin_minimax_video';
