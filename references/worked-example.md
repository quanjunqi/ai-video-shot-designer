# 黄金样例（worked example）

本文件是一个**虚构**的最小完整范例，只用于示范固定交付格式；人物、剧情均为示例，实际产出必须以用户剧本为准。它演示一条完整链路：先给资产/故事板图片 Prompt，再给两个分段——单元 1 为常规对白，单元 2 为承接上一段尾帧的道具交接（高一致性要求）。格式契约见 [output-schema.md](output-schema.md)，所有硬参数以 [platform-spec.md](platform-spec.md) 为准。

- 示例片名：《信》（The Letter）
- 场景：夜晚·旧式茶馆内景；主光为画面右侧的暖黄油灯，雨夜，木门在 camera left 背景。
- 标签规划：`<Subject 1>` 林岚（女掌柜）、`<Subject 2>` 陈默（来客）、`<Subject 3>` 牛皮纸信封（关键道具）、`<Subject 4>` 茶馆内景；`<Picture 1>` 单元 1 开场构图、`<Picture 2>` 单元 2 交接构图。
- 说话人编号：陈默先发声 = `(S1)`，林岚后发声 = `(S2)`；编号跨单元沿用。

---

## 一、全局资产与故事板图片 Prompt（先输出一次，逐项可复制）

```text
[Subject 1｜角色资料卡｜锁定林岚身份，供全片复用]
A Chinese woman around 30, tea-house keeper, calm weary face, oval jaw, hair in a low bun with a plain wooden hairpin, wearing a dark teal diagonal-collar cotton tunic and a long dark skirt, a small brass key hanging at her waist, slender upright build; character reference sheet, front full body plus left and right 45-degree half-body views plus one face close-up, A-pose, full body visible with feet in frame, centered, clean plain light-gray background, soft even studio lighting, realistic cinematic style, consistent proportions, no text, no watermark, no split-screen, no collage.
```

```text
[Subject 2｜角色资料卡｜锁定陈默身份，供全片复用]
A Chinese man in his mid-30s, tired guarded expression, short neat black hair, light stubble, wearing a dark charcoal long gown with faint rain dampness on the left shoulder, sturdy cloth shoes; character reference sheet, front full body plus left and right 45-degree half-body views plus one face close-up, A-pose, full body visible with feet in frame, centered, clean plain light-gray background, soft even studio lighting, realistic cinematic style, consistent proportions, no text, no watermark, no split-screen, no collage.
```

```text
[Subject 3｜道具外观图｜锁定信封外观与持握基准]
A plain kraft-paper envelope, sealed, slightly worn soft edges, no writing and no stamp on its surface, held size reference against an adult palm; front and back and a thin-side view, centered, clean plain light-gray background, soft even studio lighting, realistic material texture, no text, no watermark, no split-screen, no collage.
```

```text
[Subject 4｜场景标准空镜｜锁定茶馆空间结构与主光方向]
An old Chinese tea-house interior at night, empty with no people, wooden counter on camera right, a latticed wooden door on the camera-left background, two fixed anchors: a brass oil lamp on the right counter casting warm amber key light from camera right, and a tall wooden shelf of tea jars on the back wall; faint blue night glow seeping through the left door, wide establishing shot, target aspect ratio, deep but readable space, realistic cinematic single frame, no people, no text, no watermark, no split-screen, no collage.
```

```text
[Picture 1｜故事板参考图｜单元1开场：来客从左后景门走向右侧柜台]
Old tea-house interior at night, warm amber key light from an oil lamp on camera right, cool blue rim from the camera-left latticed door; a man in a dark long gown enters through the left-background door and walks toward the wooden counter at camera right where a woman in a teal tunic stands; medium-wide shot, camera at counter height, man placed camera-left mid-ground walking camera-right, woman placed camera-right foreground behind the counter, two visible spatial anchors (right oil lamp, back tea-jar shelf), clear readable single composition, cinematic final-look frame, no split-screen, no collage, no text, no watermark.
```

```text
[Picture 2｜故事板参考图｜单元2道具交接：信封从来客右手进入掌柜双手]
Same old tea-house at night, matching warm amber key light from camera right; over-the-shoulder framing favoring the woman behind the counter at camera right, the man at camera left extending his right hand to pass a plain kraft envelope into the woman's both hands reaching from camera right; close two-shot, the envelope fully visible mid-transfer at frame center, hands and holders unambiguous, oil lamp and counter edge as spatial anchors, camera-left/right and action direction explicit, clear readable single composition, cinematic final-look frame, no split-screen, no collage, no text, no watermark.
```

---

## 二、生成单元 1（常规对白）

```text
生成单元：1
全片时间线：00:00.000—00:24.000
本段时间线：00:00.000—00:13.800（13.8 秒，常规区间）
连续性输入：首段，无上一段尾帧；从剧本初始状态与 Picture 1 计划构图开始，不虚构尾帧。
连续性输出：陈默站定在柜台前 camera-left、右手把信封抬至胸前且信封清晰可见；林岚在 camera-right 柜台后注视他；暖黄油灯主光仍来自 camera-right；此稳定画面作为单元2首帧锚点。
生成素材：Subject 1、Subject 2、Subject 3、Subject 4 参考图；本单元故事板 Picture 1；无上一段视频。
参考图选择：
必选：Subject 4——锁定茶馆空间与右侧主光；Subject 2——锁定来客身份与左肩雨痕；Picture 1——锁定开场走位与构图。
可选：Subject 1——Shot2/3 林岚出镜时锁定其面部与服装；Subject 3——Shot3 信封出现时锁定道具外观。
禁止混用：无。
```

【模型 Prompt，可直接复制】

```text
subject_definitions:
<Subject 1> Lin Lan, the tea-house keeper: a Chinese woman around 30 in a dark teal diagonal-collar tunic and long dark skirt, hair in a low bun with a plain wooden pin, a small brass key at her waist; identity reference reused across the whole film.
<Subject 2> Chen Mo, the visitor: a Chinese man in his mid-30s in a dark charcoal long gown with faint rain dampness on the left shoulder; he is the first on-screen speaker, labeled (S1).
<Subject 3> a plain sealed kraft-paper envelope with worn soft edges and no writing, held by Chen Mo in his right hand.
<Subject 4> the old tea-house interior at night: wooden counter on camera right, latticed door on the camera-left background, warm amber oil-lamp key light from camera right, cool blue night glow at the left door, tea-jar shelf on the back wall.
<Picture 1> planned opening composition for this unit: Chen Mo entering from the camera-left background door toward the camera-right counter where Lin Lan stands.

summary:
[reference generation + image reference] Film timeline 00:00.000—00:24.000; this unit covers 00:00.000—00:13.800. Following <Picture 1>, <Subject 2> enters <Subject 4> from the camera-left door and approaches <Subject 1> at the camera-right counter, then speaks (S1). The unit ends on a stable, prop-visible tail frame that becomes the first-frame anchor for unit 2. Estimated duration is inferred from the script's dialogue and blocking, not user-specified.

retention_analysis:
<Subject 4> fully_preserved across Shot 1—Shot 3 to lock space and the camera-right key light. <Subject 2> fully_preserved across Shot 1—Shot 3, including left-shoulder dampness. <Subject 1> fully_preserved in Shot 2—Shot 3. <Subject 3> partially_preserved, held in <Subject 2>'s right hand and only partly shown until Shot 3. <Picture 1> attribute_transfer, used only for planned blocking and composition, not as an actual tail frame.

detailed_description:
[Shot 1] At 00:00.000, matching <Picture 1>, the latticed door on the camera-left background opens and <Subject 2> steps into <Subject 4>. Warm amber key light comes from the oil lamp on camera right while cool blue night rim catches his damp left shoulder. He pushes the door shut behind him and walks at an unhurried pace from camera-left background toward the counter at camera right, his right hand resting near <Subject 3> tucked against his torso. The camera holds a steady medium-wide frame at counter height.
[Shot 2] At 00:05.200, the shot changes to a medium close shot of <Subject 1> behind the camera-right counter. She lifts her gaze from the counter toward camera left, her hands pausing on the wood; the warm lamp light shapes the right side of her face and the background softens into shadow. The eyeline points camera left toward the approaching visitor, staying on the same side of the counter axis.
[Shot 3] At 00:09.600, a medium two-shot shows <Subject 2> now stopped in front of the counter at camera left, facing <Subject 1> at camera right. He raises <Subject 3> to chest height with his right hand so the plain kraft envelope is clearly readable, and speaks calmly: <Subject 2> (S1) <d>[Chinese]林掌柜，有人让我把这个，亲手交给你。</d> Lin Lan looks at the envelope without reaching for it yet. The frame settles steady on both figures, the envelope visible between them and the camera-right lamp direction unchanged.

overall_soundscape:
Muffled night rain outside, the soft creak and close of a wooden door, slow footsteps on old floorboards, the faint crackle of an oil lamp and light fabric movement; no dialogue is repeated here.

non_diegetic_music:
A very low, slow sustained string drone enters softly under the scene, restrained and tense, audible only to the audience.
```

---

## 三、生成单元 2（承接尾帧的道具交接）

```text
生成单元：2
全片时间线：00:00.000—00:24.000
本段时间线：00:13.800—00:24.000（10.2 秒，复杂动作区间）
连续性输入：必须复现单元1实际尾帧——陈默在 camera-left 柜台前、右手将信封抬至胸前且信封可见，林岚在 camera-right 注视，主光来自 camera-right；首镜不得引入新景别、服装或道具持有者。
连续性输出：信封已由陈默右手交至林岚双手、持有者变为林岚并收至胸前；陈默双手空垂于 camera-left；林岚位于 camera-right；画面稳定、道具清晰，作为后续单元首帧锚点。
生成素材：Subject 1—4 参考图；本单元故事板 Picture 2；跨段追加“单元1实际尾帧图”作为首帧状态锚点（状态输入，非故事板）；本单元不使用上一段视频。
参考图选择：
必选：单元1实际尾帧图——锁定交接前两人位置、画面左右、道具持有者与主光；Subject 3——锁定信封外观并表现易手；Picture 2——锁定交接构图与双手承接关系。
可选：Subject 1、Subject 2——交接近景下稳定双方身份与服装；Subject 4——补充空间与光线。
禁止混用：Picture 1——其为单元1走位构图，人物距离与本单元交接近景不一致，不得作为本镜头构图参考。
```

【模型 Prompt，可直接复制】

```text
subject_definitions:
<Subject 1> Lin Lan, the tea-house keeper (identity identical to unit 1); she becomes the second on-screen speaker here, labeled (S2).
<Subject 2> Chen Mo, the visitor (identity identical to unit 1), still speaker (S1) if he speaks later.
<Subject 3> the plain sealed kraft envelope; at the start it is held by <Subject 2>'s right hand and during this unit transfers into <Subject 1>'s both hands.
<Subject 4> the old tea-house interior with the same camera-right warm amber key light and camera-left door.
<Picture 2> planned handoff composition: the envelope passing from <Subject 2>'s right hand at camera left into <Subject 1>'s both hands reaching from camera right.

summary:
[reference generation + image reference] Film timeline 00:00.000—00:24.000; this unit covers 00:13.800—00:24.000. The first shot reproduces the actual tail frame of unit 1 (state anchor supplied in the generation settings, not a storyboard), then follows <Picture 2> to show <Subject 3> transferring from <Subject 2> at camera left to <Subject 1> at camera right; Lin Lan then speaks (S2). The holder change is the only state change.

retention_analysis:
The unit-1 actual tail frame is fully_preserved as the first-frame state (positions, screen sides, holder, key light). <Subject 1>, <Subject 2>, <Subject 4> fully_preserved with identical appearance and light direction. <Subject 3> fully_preserved in appearance while its holder changes, recorded as attribute_transfer of possession from <Subject 2> to <Subject 1>. <Picture 2> attribute_transfer for composition only, never treated as the real tail frame.

detailed_description:
[Shot 1] At 00:00.000, the frame reproduces the unit-1 tail state: <Subject 2> stands at camera left in front of the counter with <Subject 3> raised to chest height in his right hand, <Subject 1> is behind the counter at camera right looking at the envelope, and the warm key light still comes from camera right. No new costume, holder, or screen-side change is introduced; the camera holds a medium two-shot matching <Picture 2>'s setup.
[Shot 2] At 00:03.400, in a close two-shot, <Subject 2> extends his right hand camera-right and <Subject 1> lifts both hands from the counter to receive <Subject 3>. The plain kraft envelope is fully visible at frame center through the whole transfer: start state it rests in Chen Mo's right hand, mid state it bridges both parties' hands, end state Lin Lan's both hands cradle it and Chen Mo's right hand releases and withdraws to camera left. The movement is slow and unambiguous, with no motion blur on the prop.
[Shot 3] At 00:07.200, <Subject 1> draws <Subject 3> against her chest at camera right, now its sole holder, while <Subject 2>'s hands hang empty at camera left. She lowers her eyes to the envelope, then asks quietly: <Subject 1> (S2) <d>[Chinese]……他，还说了什么？</d> The frame settles on a stable, prop-visible composition with the camera-right lamp direction and the counter axis unchanged, ready to be captured as the next unit's first-frame anchor.

overall_soundscape:
Continued muffled rain outside, the faint slide of paper and soft brush of sleeves during the handoff, a quiet breath from Lin Lan; ambient bed stays continuous and spliceable with unit 1.

non_diegetic_music:
The same low sustained string drone continues from unit 1 at an even level so the music can cross the cut without an audible restart; it stays subtle and non-diegetic.
```

---

## 四、本样例刻意示范的合规点（交付时不要输出给用户）

1. 先资产/故事板、后分段；默认只给当前批次两个单元，没有输出覆盖全片的长 Prompt。
2. 每段都是“中文生成设置（不复制）＋六字段代码块（可直接复制）”两区结构，元数据没有混入六字段。
3. 六字段顺序、官方标签、`[reference generation + image reference]` 前缀、`retention_analysis` 枚举全部符合 platform-spec。
4. 单元 2 首镜复现单元 1 **实际尾帧**，并把尾帧图写在“生成素材/连续性输入”，没有把 `<Picture 1>` 当成尾帧；禁止混用项明确排除了冲突的旧构图。
5. 道具易手用“起点—中点—终点”三态写清持有者变化，`state_diff` 只包含这一个真实变化。
6. 台词用 `<d>[Chinese]原文</d>` 逐字保留、不翻译；说话人 `(S1)/(S2)` 跨单元沿用并在 `subject_definitions` 说明对应关系。
7. 时长落在 platform-spec 区间（对白 13.8s、复杂交接 10.2s），时间码单元内递增、标题同时标全片范围。
