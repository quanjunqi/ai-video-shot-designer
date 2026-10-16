-- 065: requestTemplate 数据迁移 —— 等价可迁移子集回填（TASK-PROTOCOL-001）
--
-- 号段：production 模型中心 060-069（060-064 已用，065 = 段内下一号）
--
-- ============================================================================
-- 背景（迁移 028 的遗留承诺）
-- ============================================================================
-- 迁移 028 只加了 request_template 列、按规格**不回填任何行**，注释明说：
--   「生效需要后续切片的回填/新建迁移」。
-- 本迁移兑现该承诺的**等价可迁移子集**：只回填 pt_builtin_comfyui 一行的模板。
--
-- ============================================================================
-- ★ 为什么不是「回填全部 8 个内置协议」（执行器语义实证，不是推测）
-- ============================================================================
-- 模板形态语义（services/execution/internal/engine/request_template.go + params.go）：
--   1) request_template 非空 → 渲染模板作为**请求体全文**（不再合并 params[] 组装的字段，
--      仅注入 task_type / __passthrough）—— request.go 渲染后直接返回；
--   2) 占位符缺失 → **响亮报错** ErrTemplateMissingValue（不静默省略、不插空串）；
--   3) 占位符取值表 = params[] 三分类（Present 才进）+ runtime 业务字段 + __passthrough。
--
-- ⇒ 模板可安全迁移 ⇔（判别标准，TASK-PROTOCOL-001 定稿）：
--   ① 模板占位符集合 ⊆ 执行器**恒 Present** 的 key 集合
--      （static 非空默认值 / role=model / 业务恒给的 runtime）；
--   ② 模板请求体字段集合 == params[] 形态发送集合（模板形态不再合并 params[] 组装的字段）；
--   ③ 有金标准等价性测试（同输入，两边 json.Unmarshal 后 DeepEqual）。
--
-- 8 个内置协议逐项裁定：
--   pt_builtin_comfyui      params=[client_id static]        ⇒ ✅ 本迁移回填（唯一静态字段恒 Present）
--   pt_builtin_minimax_text params=[stream static]           ⇒ ✅ 已生效（注册表 + 等价性测试锁定）
--   pt_builtin_grsai        params=[]（靠 __passthrough）    ⇒ ⚠️ 不回填：模板表达不了映射产物，无增益
--   pt_builtin_jimeng_image params=[]（靠 __passthrough）    ⇒ ⚠️ 不回填：同上
--   pt_builtin_jimeng_video params=[]（靠 __passthrough）    ⇒ ⚠️ 不回填：同上
--   pt_builtin_minimax_video params=[]（靠 __passthrough）   ⇒ ⚠️ 不回填：同上
--   pt_builtin_openai       14 字段含 runtime（messages/tools/user）⇒ ❌ 禁止回填：
--       模板含 tools/user ⇒ 业务缺省即 ErrTemplateMissingValue（破坏现有「缺省不发送」行为）；
--       模板不含 ⇒ 丢字段。两者都不等价。判别标准第一条反例。
--   pt_builtin_openai_img   model + prompt(runtime) + static ⇒ ⚠️ 本期不做：
--       prompt 依赖业务必给（Present 非恒真）；需调用方保证 + 逐场景等价性测试，
--       列为候选，待有真实业务调用时再评估（ADR-007 D3 留档）。
--
-- ============================================================================
-- 兼容性 / 幂等
-- ============================================================================
-- UPDATE 单列 request_template，不触碰其它列、不改任何既有行为；
-- UPDATE 天然幂等（重复应用结果一致）。
-- 模板形态下 params 保留：{{client_id}} 仍由 params 三分类解析取值（与 minimax_text 先例一致）。
-- 模板写 task_type=sync：与 minimax_text 先例一致，把请求体写成一眼可见的完整形状；
-- 执行器按 async 声明注入/覆盖（comfyui 为纯同步协议，恒为 sync；异步协议会覆盖为 async）。

UPDATE protocol_templates
   SET request_template = '{"client_id":"{{client_id}}","task_type":"sync"}'
 WHERE id = 'pt_builtin_comfyui';

COMMENT ON COLUMN protocol_templates.request_template IS
'ADR-007 D3 请求模板（{{key}} 占位符，值按 JSON 语义插入）。非空时优先于 params[]：执行器渲染本列作为请求体全文（仅注入 task_type/__passthrough），params[] 只用于解析占位符取值；NULL/空时沿用 params[] 组装。回填策略见迁移 065 注释（TASK-PROTOCOL-001：等价可迁移子集 + 判别标准，openai chat 禁止回填）。';
