# 术语与字段权威对照表

本表是内部英文字段、面向用户的中文显示名与“是否进入 H3 六字段”之间的**唯一权威映射**。其它文档（segment-state-schema、output-schema、director-continuity）与本表不一致时以本表为准。

## 1. 进入六字段的官方元素（保留英文，不翻译）

| 官方元素 | 处理方式 | 归属 |
| --- | --- | --- |
| `subject_definitions / summary / retention_analysis / detailed_description / overall_soundscape / non_diegetic_music` | 字段名原样保留、固定顺序 | 六字段内 |
| `<Subject N> <Picture N> <Video N> <Audio N>` | 官方标签原样保留 | 六字段内 |
| `[reference generation]` 等任务前缀、`fully_preserved` 等保留度枚举 | 原样保留 | 六字段内 |
| `<d>[Language]…</d>`、`<scenetrans>`、`<cutoff>` | 台词/衔接标签原样保留 | 六字段内 |

## 2. 块前中文生成设置（不进六字段，对用户显示中文名）

| 内部英文字段 | 面向用户中文名 | 默认精简卡是否显示 |
| --- | --- | --- |
| （单元序号） | 生成单元 | 显示 |
| global / local timeline | 全片时间线、本段时间线 | 显示 |
| `generation_duration` | 生成时长 | 显示 |
| `continuity_mode` | 连续性模式（中文释义后括注平台模式代码，如 运动上下文（motion_context）） | 显示 |
| reference selection | 参考图选择（必选 / 可选 / 禁止混用） | 显示 |
| `generation_inputs` | 生成素材 | 显示 |
| `continuity_in` | 连续性输入 | 显示 |
| `continuity_out` | 连续性输出 | 显示 |
| `handoff_frame` | 交接帧 | 显示 |
| `state_diff` | 状态变化 | 仅复杂动作/压力测试/诊断时展开 |
| `overlap_duration` | 重叠时长 | 同上 |
| `usable_duration` | 可用时长 | 同上 |
| `audio_handoff` | 声音交接 | 同上 |
| `shot_handoff_in / shot_handoff_out` | 镜头衔接输入 / 镜头衔接输出 | 仅复杂动作或镜头衔接测试时展开 |
| `shot_transition` | 镜头过渡 | 同上 |

## 3. 仅内部规划（不面显、不投喂）

| 内部标识 | 最终去向 |
| --- | --- |
| `N/S/E/W` 内部坐标 | 转成 `camera left/right`、`foreground/background` 等自然语言后才进入 Prompt |
| `scene_map` 站位地图、beat states | 仅在用户明确要求站位/机位图时作为独立附件输出，不嵌入六字段 |
| 标签编号推演、连续性台账草稿 | 用于内部推导，沉淀到 [batch-ledger-schema.md](batch-ledger-schema.md) 的项目台账 |

## 4. 使用原则

1. 六字段块内只允许第 1 节的官方英文元素；第 2 节一律写在块前并用中文标题；第 3 节不直接面向用户、不投喂模型。
2. 内部英文代码不得作为可见标题；例外只有官方标签与平台要求的模式代码，且模式代码放在中文释义后的括号内。
3. 新增字段时先在本表登记“英文字段 / 中文名 / 归属”，再在其它文档引用，避免同一字段出现多个中文名。
