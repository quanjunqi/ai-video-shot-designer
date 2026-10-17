# TASK-PROTOCOL-007 开发日志

## 动作 A（2026-10-17）· 复现与定位
- 用户要求页面查看新增模板 → 页面显示「全部8 + 离线降级态」。
- 证据：浏览器 console `syncCatalog failed: (t.params ?? []).map is not a function`；BFF 返回 pt_builtin_openai_responses params 为 {}（对象）。
- 根因：068 迁移 INSERT 把 params/response_params 写成 '{}'，契约要求数组（store 注释曾记 061 同类事故）。

## 动作 B（2026-10-17）· 生成与落库
- 临时 cmd（用完即删）调 protocolgen 确定性生成：32 params（含 model role=model）+ 37 响应映射。
- 迁移 069：UPDATE（$$ 美元引号包裹 jsonb 数组；铁律不改已执行 068）。
- registry.go 同步 32/37（desc 完整 + 反引号转义）；golden 测试基线同步。
- 真库落库：jsonb_typeof=array、长度 32/37、schema_migrations=069。

## 动作 C（2026-10-17）· 回归与验证
- production build/vet/test -race 全绿；协议门禁 ✓（migration=069）；快照重拍。
- 前端实测：/settings/channels/protocols「全部10 · 已连接服务端」+ Responses 卡片（32 参数/37 响应映射）。

## 纪律自检
- 开工即建日志 ✓；不臆测参数（全部生成器确定性输出）✓；迁移只增不改（069 修正）✓；临时 cmd 已删 ✓。
