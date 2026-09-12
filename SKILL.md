---
name: ai-video-shot-designer
version: 0.2.0
description: 解析中文或英文剧本，自动规划角色、场景、道具、站位和故事板参考图，并生成不超过15秒、可直接复制的 MiniMax H3 全能参考分段 Prompt；不适用于其他视频模型。
---

# AI 视频提示词生成

将剧本转换为可直接投喂 MiniMax H3 的 15 秒以内分段 Prompt。Skill 先从剧本自动推导导演级镜头规划、故事板参考图、参考主体和图片资产，再将长内容拆成多个独立生成单元；不输出无法直接投喂模型的长 Prompt、表格、分镜表或需要用户手动拼接的零散字段。

## 工作流程

1. 按 [references/script-parsing-schema.md](references/script-parsing-schema.md) 的中间表示解析剧本，提取场次、角色、场景、时间/内外、服装、道具、特效、动作、台词、字幕、闪回、目标时长、画幅和声音；信息不足时采用最小假设并登记待确认项，不创造剧情事实。
2. 在内部建立文本站位地图：为每个场景登记固定锚点、主动作轴线、摄影机所在侧、人物当前区域、朝向、层次、相对距离、遮挡关系、高低/容纳关系和可通行路径。地图使用 `N/S/E/W` 作为内部坐标，但不把缩写直接投喂模型。
3. 在内部完成导演级规划：判断类型与视觉基调，基于站位地图设计景别/角度/焦距/运镜/节奏，并让每个动作镜头明确起点、终点、方向、道具持有者和落点。连续动作、追逐、对话或时空转换时，读取 [references/director-continuity.md](references/director-continuity.md)，额外检查景别递进、视线/轴线、构图/透视/光线交接和资产基准。该规划用于生成 Prompt，不默认输出为表格。
4. 根据目标时长和节奏估算镜头数量与镜头时长，并强制按不超过 15 秒划分生成单元（常规/复杂动作的建议区间见 [references/platform-spec.md](references/platform-spec.md) §1）。默认只交付当前批次的少量生成单元、不一次展开整部剧本（批次数见 §2）；长剧本在用户确认上一批次素材后继续下一批次（跨批次状态台账与素材命名按 [references/batch-ledger-schema.md](references/batch-ledger-schema.md) 维护），短剧本也同样只先给当前批次。每个单元必须是完整、独立、可直接复制的 H3 六字段 Prompt；不再生成完整长视频 H3 Prompt。官方建议词量按单个生成单元控制、不按全片累计（见 §2）；切点优先放在动作停顿、台词结束或情绪落点，不能把一个不可恢复的关键动作拆在切点上。
5. 为每个生成单元保存空间状态快照：首帧状态、尾帧状态、人物位置和朝向、道具持有者、摄影机侧、主光方向、运动方向以及下一单元必须继承的视觉元素。下一单元的首帧必须与上一单元尾帧逐项匹配，除非剧本明确发生时空转换。
6. 为每个单元建立连续性合同：连续性输入写明本段必须复现的上一段尾帧，连续性输出写明本段必须交给下一段的稳定尾帧，生成素材写明角色/场景/道具参考图、上一段尾帧图和可选上一段视频的使用方式。先锁定状态，再描述动作；不得只依赖抽象的“保持一致”。
   对复杂动作或平台连续生成，按 [references/segment-state-schema.md](references/segment-state-schema.md) 维护状态变化、交接帧、连续性模式、生成时长、重叠时长、可用时长和声音交接；这些是段前生成设置，不放入 H3 六字段。生成设置面向用户，标题、字段名、字段值和衔接描述必须全部使用中文；仅保留官方资产标签和平台必要的模式代码作为不可翻译标识。
7. 判断哪些内容需要稳定视觉资产。读取 [references/asset-generation-rules.md](references/asset-generation-rules.md) 决定角色资料卡、场景空镜/空间图、道具状态图和风格图；读取 [references/storyboard-generation-rules.md](references/storyboard-generation-rules.md) 决定故事板参考图的数量、画面风格和单帧构图；读取 [references/reference-selection-rules.md](references/reference-selection-rules.md) 按镜头功能自动选择必选、可选和禁止混用的参考图。为实际需要的资产和故事板镜头生成图片 Prompt，并写明用途与对应标签；图片只定义身份/场景时作为 `<Subject N>` 的来源，图片作为故事板中的具体镜头构图、首帧计划或动作面板时建立 `<Picture N>`。不要求用户另行制作“关键帧 Prompt”。
8. 为所有实际使用的资产分配稳定标签。仅当用户明确提供或要求复用整段视频/音频时，才创建 `<Video N>` 或 `<Audio N>`；不能因文件存在而自动创建。上一段生成视频若作为运动参考，应在当前单元的 `subject_definitions` 或 `summary` 中明确其用途，不把它误写成角色身份。
9. 固定为每个生成单元使用 MiniMax H3 六字段：`subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music`。六字段必须在每个单元内自洽，不跨单元依赖用户手动拼接；字段顺序、官方标签、前缀与保留度枚举统一以 [references/platform-spec.md](references/platform-spec.md) 为准。
10. `subject_definitions` 只定义本单元及其衔接所需的主体和参考作用；`summary` 以 `[reference generation]` 或与实际输入匹配的官方前缀开头，并标明全片时间范围和本单元时间范围；`retention_analysis` 说明本单元与前后单元的保留、迁移或复用关系。
11. `detailed_description` 用英文按本单元播放顺序逐镜叙述。每个 `[Shot N]` 独立成段，不添加 Visual/Action/Camera 等自定义字段；每个单元的第一镜从其首帧状态开始，后续镜头用单元内递增 `At MM:SS.mmm`，并在标题或 `summary` 中标明全片时间码。若出现闪回，必须同时标注其 memory/flashback 身份、主时间线全片时间码、单元局部时间码、色调、声音桥和回切点；回忆内部时间码不得覆盖主时间线时间。
12. 说话人、台词、画面文字和声音严格遵循参考指南。先输出一次当前批次真正需要的全局图片资产 Prompt 和故事板参考图 Prompt，再按时间顺序输出当前批次可直接复制的分段 H3 Prompt；不输出完整长视频 H3 Prompt。除非用户明确要求“全部生成单元”，否则不要展开后续批次。
13. 按 [references/pre-delivery-checklist.md](references/pre-delivery-checklist.md) 完成交付前两层自检：机械项运行 `scripts/validate_h3_prompt.py` 直到 ERROR=0，语义项逐项确认镜号与单元时间码、每段不超过 15 秒、标签一致性、台词完整性、动作链、站位快照、轴线、空间与光源连续性、输入参考关系和音频分类后再交付。

复杂动作或镜头衔接测试时，按 [references/director-continuity.md](references/director-continuity.md) 增加镜头级“镜头衔接输入”“镜头衔接输出”和“镜头过渡”；这些字段只作为代码块前的中文生成设置，不能插入 MiniMax H3 六字段。

## 不可违背的约束

- 不改变剧情因果、人物动机或关键台词；只补充不改变因果的视线、呼吸、停顿、手部动作和走位。
- 自动推断的时长、镜数、站位、镜头语言和声音只能服务于剧本已有信息；信息不足时采用最小必要假设，不创造新的剧情事实、人物或道具。
- 站位地图必须先定义场景固定锚点，再定义人物和摄影机关系；不能只写“人物在左边/右边”而不说明相对于哪个锚点和摄影机。
- 每次人物移动、交手、跌倒、起身、转身或道具交接都要更新站位状态；动作结束后的状态必须成为下一镜的起点。
- 一致性优先级固定为：首帧/尾帧状态 > 角色与场景参考图 > 连续性台账文字 > 风格形容词。发生冲突时以状态约束为准。
- 默认采用“故事板参考图负责构图 + 尾帧图负责跨段状态 + 相同参考资产复用”；若平台支持视频续写或视频参考，可在同一单元同时传入上一段视频继承运动趋势，但不能用故事板参考图或上一段视频替代实际尾帧状态。
- 跨段尾帧必须选稳定、清晰、无遮挡或可解释遮挡的画面；高速模糊帧、闭眼变形帧和道具不可见帧不得作为下一段状态锚点。必要时从上一段结束前的稳定帧区间选取（秒数见 [platform-spec](references/platform-spec.md) §3）。故事板参考图只描述计划构图，不得冒充实际生成尾帧。
- 对高风险打斗或快速追逐，可让下一段开头复现一小段承接动作、再在后期裁掉重复部分（重叠时长见 [platform-spec](references/platform-spec.md) §3）；每个模型生成单元仍不得超过 15 秒。
- 每个单元固定复用同一角色描述、服装描述、场景锚点、光源方向、镜头画幅和负面限制；不得为下一段重新发明同义但不同的外观描述。
- 参考图选择遵循最小集合原则：只列出本单元实际依赖的图片；全局资产不会因为已生成就自动上传到每段。未出镜角色、未使用道具和不参与当前构图的场景图必须省略。每段都输出必选、可选和禁止混用项；没有冲突时写“无”。
- 控制单元复杂度：单单元英文词量以 [platform-spec](references/platform-spec.md) §2 为上限；超过时先删除重复外观、重复连续性句和非必要镜头，不删除剧情动作、标签定义或六字段。默认生成设置使用精简操作卡，完整状态台账只在压力测试、动作复杂或用户要求诊断时展开。
- 声音连续性单独管理：环境底噪和持续音乐在段间保持可拼接，台词在段末完整结束或明确使用跨段连续台词；不得在切点截断爆发音、脚步落点或关键对白。
- 对话、追逐、打斗建立轴线；越轴前使用中性镜头或运动过渡。
- 动作镜头使用动作链：上一镜终点、下一镜起点、运动方向、道具持有者和状态。
- 悬疑单元列出不得提前揭示的信息，并在提示词加入 `do not reveal` 限制。
- 暗场说明合法可见光源，不得凭空添加均匀补光。
- 每个生成单元写明禁止漂移项：角色、服装、道具持有者、画面左右、运动方向、主光方向和场景结构。
- 手机、游戏、聊天和字幕文字默认标记为后期合成；中文口型不稳定时使用侧脸、背影、遮挡、画外音或后期配音。
- N/S/E/W 仅作内部规划，最终使用 camera left/right、foreground/background 等自然语言。
- 复杂场景可按 [references/position-map-schema.md](references/position-map-schema.md) 生成纯文字站位地图。该地图是规划/复核附件，不嵌入六字段 H3 Prompt；用户未要求时不额外输出。
- 每个分段 H3 Prompt 必须作为一个完整、独立、可复制的文本块交付；用户无需自行拼接字段。故事板参考图 Prompt 与角色/场景/道具资产 Prompt 另行逐项交付，同样可直接复制。默认一次只交付当前批次生成单元（数量见 [platform-spec](references/platform-spec.md) §2）；不得默认交付超过 15 秒的完整长视频 H3 Prompt 或整部剧本的全部单元。
- Subject 编号（`<Subject N>`）与说话人编号（`S1`、`S2`）是两套独立命名空间；同一主体可在不同镜头保持同一 `S` 编号，且不要求数字相同。首次发声时在 `subject_definitions` 或 `summary` 中明确对应关系。
- 每个单元时长不得超过 15 秒，必须注明全片时间范围、单元时间范围、首帧输入、尾帧输出和与前后单元的衔接。每个单元沿用同一标签、角色外观、服装、光源、空间轴线和道具状态；不得在切点重置人物、场景或道具。
- 第一镜从初始构图开始，后续镜头用三位小数秒数的切镜时间（如 `At 00:03.500`）写入同一时间线。
- 运镜写明类型、幅度和速度，例如 `The camera pushes in with small amplitude at slow speed`。
- 说话人跨镜头使用稳定编号 `(S1)`、`(S2)`；实际台词放在 `<d>` 内，逐字保留原文与标点，不翻译、不改写；画外音明确 `off-screen voiceover` 并说明嘴唇闭合。
- 画面中实际可见文字用英文双引号包住，逐字保留原文；不要把对白自动变成字幕。
- 每个分段全能参考 Prompt 只使用官方标签 `<Subject N>`、`<Picture N>`、`<Video N>`、`<Audio N>`，并且严格按 `subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music` 六字段顺序输出；不得把连续性输入、连续性输出或生成素材插入六字段代码块。它们应写在代码块前的中文生成设置中。
- 说话人跨镜头沿用 `(S1)` 等编号；台词放在 `<d>[Language]... </d>` 中。跨切镜连续台词使用 `<scenetrans>`，视频结尾截断使用 `<cutoff>`。
- 当用户未提供目标时长，依据剧本台词密度、动作复杂度和场次信息估算，并在 `summary` 或 `detailed_description` 中保持同一时长假设；不把估算值伪装成用户明确要求。

## 输出

Skill 被调用生成内容时，只交付用户请求的成品，不输出推理过程、专业分析、建议或自我评价。默认先输出当前批次真正需要的角色/场景/道具资产 Prompt 与故事板参考图 Prompt，再按时间顺序输出不超过 15 秒、可独立复制的分段 H3 Prompt（批次数见 [platform-spec](references/platform-spec.md) §2）；用户明确要求全部单元时才展开整部剧本。每段代码块前用全中文写明本段生成设置（包括参考图选择、故事板参考图、连续性输入、连续性输出、生成素材及其他衔接字段）；若用户要求双语，在每段英文成品后紧跟对应中文翻译。不要输出无法直接投喂模型的完整长视频 H3 Prompt。具体格式见 [references/output-schema.md](references/output-schema.md)、[references/reference-selection-rules.md](references/reference-selection-rules.md) 和 [references/continuity-workflow.md](references/continuity-workflow.md)；平台硬参数与默认值统一以 [references/platform-spec.md](references/platform-spec.md) 为单一事实源；完整端到端范例见 [references/worked-example.md](references/worked-example.md)；交付前自检见 [references/pre-delivery-checklist.md](references/pre-delivery-checklist.md)；跨批次台账与素材命名见 [references/batch-ledger-schema.md](references/batch-ledger-schema.md)；字段英中权威对照见 [references/terminology-map.md](references/terminology-map.md)。

若只有格式规范而没有创作内容，先请求创作内容；若用户要求测试，生成严格符合官方格式的测试 Prompt。
