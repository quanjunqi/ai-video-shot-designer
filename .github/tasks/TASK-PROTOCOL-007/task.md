---
status: 待验收
priority: P0（B-002：新增模板导致前端降级）
depends_on: TASK-PROTOCOL-006
criteria: 6
criteriaPassed: 6
---

# TASK-PROTOCOL-007 任务卡

修复 pt_builtin_openai_responses 的 params/response_params 落库形状（B-002）：
068 的 INSERT 写成 '{}'（对象），契约要求 JSON 数组 ⇒ 前端 serverTemplateToLocal .map 崩溃 ⇒ syncCatalog 降级离线缓存，页面看不到新增模板。
依据 protocol-gen 确定性生成 32 params + 37 响应映射回填（069 迁移），registry 与测试基线同步。
