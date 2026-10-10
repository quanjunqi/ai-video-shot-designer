-- 028: protocol_templates 增加 request_template（ADR-007 D3，请求模板字符串）
--
-- 模板此前用 params[]（key/value/type/role 三分类）+ runtime 的 __passthrough 描述请求体：
-- 请求体的**形状**由执行器组装代码决定，模板只能声明「有哪些参数」，表达不了嵌套结构，
-- 也表达不了 multipart（例如把参考图放进 input_reference 字段）。
-- ADR-007 D3 改为「一个带 {{占位符}} 的请求模板字符串」：一眼看懂请求体长什么样。
--
-- 兼容并存过渡（本次只做能力，不迁移既有定义）：
--   request_template 非空 → 执行器渲染本列作为请求体（params[] 仍用于解析占位符取值）；
--   request_template 为空/NULL → 逐字沿用 params[] 组装，既有定义行为完全不变。
--
-- 只加列，不回填，不改列、不删列、不改既有数据。

ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS request_template text;

COMMENT ON COLUMN protocol_templates.request_template IS
    'ADR-007 D3 请求模板（{{key}} 占位符，值按 JSON 语义插入：字符串原样、数字/布尔字面量、对象/数组为 JSON 文本）。非空时优先于 params[]：执行器渲染本列作为请求体，params[] 只用于解析占位符取值；NULL/空时沿用 params[] 组装，行为同改动前。本列不回填';
