# 剧本解析中间表示（Script IR）

本文件把 SKILL 工作流第 1 步“解析剧本”标准化：先把自由文本剧本转成结构化中间表示（Script IR），再向下游衔接站位地图（[position-map-schema.md](position-map-schema.md)）、资产规划（[asset-generation-rules.md](asset-generation-rules.md)）与分段（[platform-spec.md](platform-spec.md)）。

Script IR 是**内部规划产物**：不直接投喂模型、不默认输出给用户；复杂剧本或需要复核时按此结构整理，用户明确要求时才展示。只记录剧本已有信息，信息不足用最小必要假设并在 `open_questions` 标注，不创造剧情事实。

## 1. 标准结构（空白模板）

```text
project:
- title:
- target_language / output_language:        # 剧本语言；六字段结构英文、台词保原语言
- aspect_ratio:                              # 画幅，剧本未给则留待确认/最小假设
- visual_genre_style:                        # 类型与视觉基调
- target_total_duration:                     # 用户指定 or 估算（标注来源，不伪装成指定）
- estimated_unit_count:                      # 依据台词密度/动作复杂度估算

scenes:
- scene_id:
  location / interior_exterior / time:
  weather / ambient_light / key_light_dir:   # 天气、环境光、主光方向
  characters_present: []
  props_present: []

characters:
- character_id:
  name / age_band / identity_anchors:        # 面部识别点、体型
  costume / hairstyle / accessories / injury:# 跨段必须锁定的外观
  voice_language / trait:                    # 声线、所说语言

props:
- prop_id:
  name / material_color_size:
  initial_holder_and_hand / initial_position:
  state_changes: []                          # 仅记录剧本真实发生的易手/开合/损坏

beats:                                        # 按时间排列的动作与事件
- beat_id / scene_id:
  action:                                    # 可观察动作，注明起止与方向
  dialogue:                                  # speaker_id、原文、语言、画内/画外(VO)
  on_screen_text:                            # 画面实际可见文字（默认后期合成）
  flashback:                                 # 是/否；若是记主时间线锚点与回切点
  vfx_special:

timeline_plan:
- proposed_shots: []                         # 初步景别/机位意向，供导演规划细化
- proposed_units: []                         # 初步分段与切点（切点避开不可恢复关键动作）

open_questions:                              # 信息缺口与最小假设
- <缺失项>：<采用的最小假设 or 需用户确认的问题>
```

## 2. 填写规则

- **只抽取不创作**：外观、时间、道具状态、动作方向必须来自剧本；推断项标注“估算/假设”，并与用户明确指定区分。
- **台词逐字**：`dialogue` 保留原文、原语言与标点，不翻译不改写；画外音标 VO，供后续包成 `<d>[Language]…</d>`。
- **可见文字单列**：手机、屏幕、招牌、字幕等进 `on_screen_text`，默认后期合成，不混进对白。
- **闪回显式标记**：在解析阶段就标出闪回与其主时间线锚点，避免后续时间码覆盖主时间线。
- **时长估算可追溯**：`target_total_duration` 与 `estimated_unit_count` 写明依据（台词密度、动作复杂度、场次），具体时长/词量口径以 platform-spec 为准。
- **为连续性埋点**：每个道具的初始持有者、每次人物移动与易手都要在 beats 中出现，供 position-map 与 segment-state 接续。

## 3. 极简示例（取自 worked-example《信》，仅示结构）

```text
project:
- title: 信(The Letter)；output_language: 结构英文/台词中文；aspect_ratio: 16:9
- visual_genre_style: 写实、年代夜景、暖黄油灯主光
- target_total_duration: 约24s（估算，依据两句对白加一次交接）；estimated_unit_count: 2
scenes:
- S1 旧式茶馆内 / interior / night；主光 camera-right 油灯；characters: C1林岚,C2陈默；props: P1信封
characters:
- C1 林岚 女约30 藏青斜襟布衫 低髻 腰挂黄铜钥匙；语言中文
- C2 陈默 男三十余 深色长衫 左肩雨痕；语言中文
props:
- P1 牛皮纸信封 无字；initial: C2右手；state_changes: 单元2 由C2右手交至C1双手
beats:
- B1 C2自左后景门走向右侧柜台
- B2 C2(S1)台词“林掌柜，有人让我把这个，亲手交给你。”
- B3 信封交接 C2右手→C1双手；C1(S2)台词“……他，还说了什么？”
open_questions:
- 剧本未给画幅：按 16:9 最小假设，可按用户要求改
```

## 4. 与下游的衔接

Script IR 完成后：复杂空间调度 → position-map-schema 建立站位地图；需要稳定视觉资产 → asset / storyboard / reference-selection 规则；进入分段 → segment-state-schema 与 continuity-workflow；最终格式 → output-schema；跨多批次维护 → batch-ledger-schema 把 character/prop 编号与每段 continuity_out 沉淀为项目台账。
