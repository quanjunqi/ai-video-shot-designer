# 分段状态交接规范

本文件定义生成设置与 H3 Prompt 的边界。它是内部规划和段前说明，不是 MiniMax H3 六字段的一部分。

## 状态对象（内部字段与用户显示名称）

```text
continuity_in: 本段第一帧必须复现的状态；第一段写剧本初始状态
continuity_out: 本段末尾稳定状态；必须能作为下一段 continuity_in
state_diff: 本段相对 continuity_in 发生的可验证变化
handoff_frame: 用于下一段首帧条件的稳定帧位置或截取策略
generation_inputs: 当前段显式使用的角色/场景/道具/帧/视频/音频输入
continuity_mode: 当前平台可用的运动、视觉或音画上下文模式
generation_duration: 模型实际生成时长，必须 <= 15s
overlap_duration: 为动作衔接而重复的时长，通常 0—1s
usable_duration: 后期保留时长，等于 generation_duration - overlap_duration
audio_handoff: 台词、动作音、环境声和配乐的边界策略
```

以上是内部字段名。面向用户的生成设置必须改用以下中文名称：连续性输入、连续性输出、状态变化、交接帧、生成素材、连续性模式、生成时长、重叠时长、可用时长、声音交接。不要把英文内部字段名作为可见标题或解释文字输出；`<Subject N>`、`<Picture N>` 等官方标签以及平台要求的模式代码除外。

## 模式选择

```text
motion_context: 普通连续动作、走位、追逐；优先传递运动趋势
rgb_guide: 主要锁定构图、人物位置、场景和光线
soft_av_prefix: 连续对白、歌唱或需要柔和音画交接
hard_av_prefix: 必须严格保留音画重叠前缀
```

模式名称只作为内部标识。面向用户时写成中文释义，例如“运动上下文（motion_context）”“画面引导（rgb_guide）”；组合模式写成“运动上下文 + 画面引导”。若目标平台不支持某个模式或组合，选择其最接近的首帧/尾帧、视频续写或参考视频能力，并在“生成素材”中用中文说明降级方案。

## 交接不变量

- 下一段 `continuity_in` 必须逐项匹配上一段 `continuity_out`，除非剧本明确切换时空。
- `state_diff` 只能描述本段实际发生的变化，不能凭空增加角色、道具或地点。
- 角色、服装、伤势、道具持有者、画面左右、摄影机侧、主光方向和场景锚点默认不可漂移。
- 高速动作可使用 0.3—1.0 秒重叠，但每个模型输入单元仍不得超过 15 秒。
- `handoff_frame` 选择稳定清晰帧，优先结束前 0.2—0.5 秒；不得使用严重运动模糊、脸部变形或关键道具不可见的帧。
- `generation_inputs` 每段都要显式列出当前真正依赖的参考资产；上一段引用过的资产不会自动继承。故事板参考图与上一段实际尾帧图必须分开列出，前者用于构图，后者用于状态。

## 复制边界

交付时把内容分成两个区域：

```text
【模型 Prompt，可直接复制】
subject_definitions / summary / retention_analysis /
detailed_description / overall_soundscape / non_diegetic_music

【生成设置（中文，不复制到 H3 Prompt）】
连续性输入 / 连续性输出 / 状态变化 / 交接帧 /
生成素材 / 连续性模式 / 生成时长 / 重叠时长 / 可用时长 / 声音交接
```

只有第一块进入 MiniMax H3 Prompt 框；第二块用于选择输入素材、平台模式和后期裁剪。
