# 交付前自检清单

每个批次交付前必须完成两层自检：A 类机械项用脚本自动跑，B 类语义项逐项人工确认。任一项不满足都不交付。硬参数口径以 [platform-spec.md](platform-spec.md) 为准。

## A. 机械项（交给校验脚本，要求 ERROR=0）

把当前批次草稿保存为文本后运行：

```bash
python3 scripts/validate_h3_prompt.py 草稿文件.md
# 从标准输入校验：粘贴内容后
python3 scripts/validate_h3_prompt.py -
# 需要机器可读结果时加 --json
```

脚本逐块检查，ERROR 必须清零（WARNING 需逐条判断是否合理）：

1. 六字段齐全、顺序正确且不重复：`subject_definitions → summary → retention_analysis → detailed_description → overall_soundscape → non_diegetic_music`。
2. 只使用官方标签 `<Subject N>/<Picture N>/<Video N>/<Audio N>`，且每个被引用标签都先在 `subject_definitions` 定义；定义但未使用的标签给出 WARNING。
3. `summary` 以官方任务前缀（如 `[reference generation]`）开头。
4. `retention_analysis` 使用合法保留度枚举（可见 `fully_preserved/partially_preserved/attribute_transfer/weak_reference`；音频 `fully_copy/partially_copy/reference/weak_reference`）。
5. `detailed_description` 的 `At MM:SS.mmm` 单调递增且不超过单段上限；`[Shot N]` 存在。
6. 台词写成 `<d>[Language]原文</d>` 且正确闭合；不出现 `Visual:/Action:/Camera:` 等自定义字段。
7. 六字段块内不出现 `continuity_in/generation_inputs/shot_handoff_in` 等内部字段（它们属于块前中文生成设置）。
8. 中文生成设置“本段时间线”时长不超过单段上限；声音字段句数在建议范围。

## B. 语义项（脚本无法判断，必须逐项确认）

**忠于剧本**
- 未改变剧情因果、人物动机与关键台词；信息不足处用最小必要假设并标注，未新增剧情事实/人物/道具。
- 自动估算时长没有被写成“用户明确指定”。

**跨段状态**
- 跨段单元第一镜复现上一段**实际尾帧**（不是故事板图）；首段不虚构尾帧。
- `continuity_out` 是稳定、清晰、无遮挡或可解释遮挡的画面，能直接成为下一段 `continuity_in`；避开运动模糊、闭眼变形、道具不可见帧。
- 人物位置/朝向、画面左右、摄影机侧、主光方向、服装伤势、道具持有者跨段一致；越轴前有中性/运动过渡。
- 道具易手、开启、损坏等变化写出“起点—中点—终点”，`state_diff` 只含剧本真实发生的变化。

**资产与参考**
- 遵循最小参考集合，每段都给出必选/可选/禁止混用（无冲突写“无”）；未出镜资产不列出。
- 故事板参考图（计划构图）、资产图（身份）、上一段实际尾帧图（真实状态）三者未混称。
- 同一资产跨单元使用同一标签与同一套外观描述，没有同义改写。

**台词与声音**
- 台词逐字保留原文与标点、不翻译；中文口型风险已用侧脸/背影/遮挡/画外音或后期配音处理。
- 切点不截断爆发音、脚步落点或关键对白；环境底噪与配乐可跨段拼接，必要时有声音桥。

**特殊情形**
- 闪回同时标主时间线全片码、单元局部码、色调、声音桥、回切点；悬疑单元写入 `do not reveal`；暗场只使用合法可见光源；屏幕/手机文字默认后期合成。

**交付边界**
- 默认只交付当前批次（数量见 platform-spec §2），未擅自展开全片。
- 每个六字段块标注“模型 Prompt，可直接复制”，块前元数据标注“生成设置（中文，不复制）”。

## C. 放行标准

1. 脚本 `ERROR=0`；2. B 类逐项通过或显式标注不适用；3. 复制边界与时间线标注齐全。三者同时满足才可交付；任一项失败就修正后重新跑 A，不得带错交付。
