-- 040: 清除 mock 渠道及其 mock 目录（Owner 2026-10-16 拍板：物理删除）
--
-- 背景：项目当前**只有 PearAPI 一个真实渠道**（`chan-muo4b9zo`，79 个真实上游模型由它同步）。
--   另外 6 个渠道（comfy / google / grsai / jimeng / minimax / openai）是**早期 mock 数据**，
--   其目录行是前端硬编码 mock 目录的镜像（`flux-comfy`/`sdxl-comfy`/`kling-1.6`/`seedance-2.0`…），
--   16 行里有 14 行 `provider_model` 为空。留着会让用户以为这些渠道可用。
--   ⇒ Owner 决定：**物理删除**（并已知悉下述代价）。
--
-- ★ 执行前已核实的影响面（三项，Owner 已确认接受）：
--   1. `model_catalog` **没有**指向 `model_channels` 的外键 ⇒ 删渠道**不会**自动清理目录行，
--      必须显式删除那 16 行（否则留下指向不存在渠道的孤儿）。
--   2. `model_catalog_versions.id` → `model_catalog.id` 是 **ON DELETE NO ACTION**
--      ⇒ 不先删归档版本，删目录行会被外键挡住。本迁移删除**56 条**归档版本。
--      ⚠️ 该表定位为 "Append-only version history"；本次删除是 Owner 决策的**例外**，
--      属于"清除 mock 数据"，不是常规做法。
--   3. `gateway_audit_logs`（execution 库）有 **44 行**引用这些 mock 渠道，且
--      `011_audit_immutability.sql` 规定**身份列不可变** ⇒ 这些行的 `channel_id`
--      **不修改**，将保留为"指向已删除渠道的历史引用"。这是**有意为之**：
--      审计是历史账本，不该因上游数据清理而改写。UI 若按渠道 join 需容忍查不到。
--
-- ★ 为什么用**显式 ID 列表**而不是 `WHERE channel_id <> 'chan-muo4b9zo'`：
--   范围条件会在未来新增渠道时把新渠道也误删。显式列表可审计、可控、可复核。
--
-- ★ 幂等：全部按显式 ID 删除，重复执行无副作用。
--
-- 号段：production【模型中心】登记为 024-039，**该号段已满**，故本文件取下一个可用号 040。
--       （建议 Owner 更新 `.agents/skills/database-migrations/SKILL.md` 的号段表。）

-- ① 先删归档版本（FK 是 NO ACTION，不先删会挡住下一步）
DELETE FROM model_catalog_versions
WHERE id IN (
    'flux-comfy', 'sdxl-comfy',
    'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'nano-banana', 'nano-banana-2-lite',
    'deepseek-v4-pro', 'kling-1.6', 'minimax-h3-grsai', 'seedance-2.0-grsai',
    'seedance-2.0', 'seedance-2.5', 'seedream-5.0',
    'minimax-h3', 'minimax-text-01',
    'gpt-image-2'
);

-- ② 再删 mock 目录行（16 行）
DELETE FROM model_catalog
WHERE id IN (
    'flux-comfy', 'sdxl-comfy',
    'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'nano-banana', 'nano-banana-2-lite',
    'deepseek-v4-pro', 'kling-1.6', 'minimax-h3-grsai', 'seedance-2.0-grsai',
    'seedance-2.0', 'seedance-2.5', 'seedream-5.0',
    'minimax-h3', 'minimax-text-01',
    'gpt-image-2'
);

-- ③ 最后删 6 个 mock 渠道
--    `channel_models` / `channel_model_syncs` 对 model_channels 是 ON DELETE CASCADE，
--    会随之清理（这 6 个渠道下当前无同步记录；79 条真实同步数据全部属于 PearAPI，不受影响）。
DELETE FROM model_channels
WHERE id IN ('comfy', 'google', 'grsai', 'jimeng', 'minimax', 'openai');
