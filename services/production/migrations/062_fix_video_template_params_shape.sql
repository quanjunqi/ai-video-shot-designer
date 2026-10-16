-- 062: 修正 061 引入的契约违反 —— pt_builtin_openai_video 的 params/response_params 必须是**数组**
--
-- 号段：production 模型中心 060-069（060=渠道清理 / 061=视频模板 / 本文件 062）
--
-- ============================================================================
-- 缺陷（我自己造成的，已实测确认）
-- ============================================================================
-- 061 建 pt_builtin_openai_video 时把 params / response_params 写成了 `'{}'::jsonb`（**对象**），
-- 而契约与其余 8 个模板都要求**数组**：
--
--   openapi/bff.yaml:2935-2939
--     params:         {type: array, items: {$ref: '#/components/schemas/ModelParam'}}
--     responseParams: {type: array, items: {$ref: '#/components/schemas/ModelParam'}}
--
--   实测（2026-10-17，查真库 production）：
--     pt_builtin_openai_video  jsonb_typeof(params)=**object**   resp=**object**
--     其余 8 个模板             jsonb_typeof(params)=**array**    resp=**array**
--
-- ============================================================================
-- 后果（为什么必须修，而不是"前端容忍一下"）
-- ============================================================================
-- 前端 useSettingsStore.ts:81 写的是 `(t.params ?? []).map(...)`。
-- `{}` **不是 nullish** ⇒ `?? []` 兜不住 ⇒ 抛
--   TypeError: (t.params ?? []).map is not a function
-- 该异常被同文件 :157 的**裸 `catch {}` 吞掉** ⇒ 走 markOfflineFallback()
--   ⇒ `catalogSource` 停在 **'offline-fallback'**，UI 显示"服务端不可达·本地缓存"
--   —— **而服务端其实是好的**（/api/v1/catalog 与 /workspace/channels 全部 HTTP 200）。
-- ⇒ **一条畸形数据被静默转换成了"服务端不可达"**，把排查引向错误方向。
--   **验收判据 8（catalogSource 应为 'server'）因此不成立。**
--
-- **反事实实验（决定性证据）**：不改任何源码与数据，仅在 CDP 层 `Fetch.fulfillRequest`
-- 于响应途中把这一行的 `{}` 改成 `[]`，其余字节不动 ⇒ **同一次运行**里
-- `syncCatalog()` 立刻 `offline-fallback → server`，DOM 徽章变「目录已连接」
--   ⇒ 拦路石**只有这一条畸形数据**。
--
-- ============================================================================
-- 为什么是"新增迁移"而不是改 061
-- ============================================================================
-- 仓规铁律：**迁移文件只增不改**（已应用的文件被改，执行器校验和会拒绝执行）。
-- 061 已在本地库生效 ⇒ 必须新增本文件修正。全新库会先跑 061（写入对象）再跑本文件（改成数组），
-- 最终态一致。
--
-- ============================================================================
-- 兼容性与幂等
-- ============================================================================
-- · 只 UPDATE **这一行**、**这两个字段**，不触碰任何其它模板与字段。
-- · WHERE 里带上 `jsonb_typeof(...) = 'object'` ⇒ 重复执行安全（已是数组则匹配 0 行）。
-- · 本迁移不改任何行为契约，只是让数据回到契约要求的形状。
-- ============================================================================

UPDATE protocol_templates
   SET params          = '[]'::jsonb,
       response_params = '[]'::jsonb,
       updated_at      = now()
 WHERE id = 'pt_builtin_openai_video'
   AND (jsonb_typeof(params) = 'object' OR jsonb_typeof(response_params) = 'object');

-- 契约一致性护栏（说明性，不新增约束）：
-- 本表 params/response_params 的**唯一合法类型是 array**。061 的教训是"新模板也要对齐契约，
-- 不能因为该模板暂不使用参数就随手写 `{}`" —— 空数组应写 `'[]'`。
COMMENT ON COLUMN protocol_templates.params IS
'参数声明。必须是 JSON 数组（契约 openapi/bff.yaml ProtocolTemplate.params: type=array，元素 ModelParam）。无参数时写 []，不得写 {} —— 前端按数组消费（(t.params ?? []).map），对象会抛 TypeError。';
