# TASK-MARKET-M5 验收清单（探查后精化）

> 探查结论：目录能力分组/归属编辑/type 推断/family 自动带出/逻辑模型继承 type 均已存在（TASK-IA-001 v14 已落地）。本卡收敛为两个真实缺口。

| # | 需求点 | 判据（四要素） | 自检 |
|---|---|---|---|
| 1 | 能力族校验单一来源 | curation.go 与 logicalmodel.go 的 type 校验共用同一函数；删除 curation.go 内独立硬编码（判据：代码审查+单测 TestCurateTypeSharedValidation；时点：修改后） | ✅ |
| 2 | 协议模板建议 | 策展表单选 type 时自动建议模板（text→pt_builtin_openai, image→pt_builtin_openai_img, video→pt_builtin_openai_video）；已手工选过则保留不覆盖（判据：前端交互实测+纯函数单测；时点：开发后） | ✅ |
| 3 | 门禁 | go test -race 全绿 + 前端 gate 绿 + 台账门禁 0 + PR 附勾对 | ✅ |
