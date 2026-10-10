-- 031_protocol_doc_ref.sql
-- ADR-008：协议配置定位为「上游文档镜像 + 契约核对基准」。
--
-- 本迁移**只加列、不回填**（与 028 同一原则）：存量 8 条内置协议保持 NULL，
-- 由后续切片（B2）逐条写入真实的 doc_ref；在此之前读取方必须容忍 NULL。
--
-- 两类证据**并列**，不是互相覆盖：
--   doc_ref           —— 文档依据（外部输入，可能过期或本身有误）
--   observed_evidence —— 实测证据（我们实际探测/调用观察到的，是事实）
-- 冲突时以 observed_evidence 为准，且**差异必须保留并可见**（差异即上游变更的信号）。
--
-- 用 jsonb 而非多个标量列：两类证据的字段会随上游文档形态演进
-- （sections/statusEnumDoc/referenceRuleDoc 等），标量列会频繁改表。

ALTER TABLE protocol_templates
    ADD COLUMN IF NOT EXISTS doc_ref jsonb,
    ADD COLUMN IF NOT EXISTS observed_evidence jsonb;

COMMENT ON COLUMN protocol_templates.doc_ref IS
    'ADR-008 文档依据：source(official|cloud|relay) / url / docVersion|verifiedAt / sections(提交与查询端点各对应文档哪一节) / authDoc / statusEnumDoc / referenceRuleDoc。NULL = 尚未对齐文档。外部输入，可能过期或本身有误。';

COMMENT ON COLUMN protocol_templates.observed_evidence IS
    'ADR-008 实测证据：lastProbedAt / observedStatusCodes / observedStatusEnum / observedEndpoints / discrepancies[]。冲突时以本列（实测）为准，且差异必须保留可见。NULL = 尚未实测。';
