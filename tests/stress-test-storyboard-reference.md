# 暴力压力测试：《雨港夺证》

本测试验证：故事板参考图与实际尾帧图的职责分离、15 秒以内分段、多人追逐、近身打斗、道具交接、场景转换、越轴桥接和声音连续性。全片约 48 秒，拆为 4 个生成单元，每段 12 秒；第 2—4 段使用上一段实际生成的稳定尾帧图，不把故事板参考图冒充尾帧。

## 一、测试剧本

```text
第1集

场次：1-1
时间地点：废弃客运码头  外  夜/雨
人物：沈砚，林岚，刀疤男，黑衣追兵若干
△ 雨水砸在锈蚀的集装箱上。沈砚从画面左侧冲出，右手紧握银色证物盒，沿栈桥向画面右侧奔跑。林岚在后方三米处追赶，刀疤男从集装箱之间切出。
林岚(压低声音)：沈砚，别让他们拿到盒子！
△ 刀疤男挥出短棍。沈砚急停、侧身闪过，肩膀撞上铁栏。黑衣追兵封住栈桥出口。
△ 沈砚把证物盒从右手换到左手，借栏杆反弹踢开刀疤男，抓住林岚伸来的手，继续向右侧逃。
【字幕：凌晨一点四十七分】

场次：1-2
时间地点：码头仓库通道  内  夜/雨声持续
人物：沈砚，林岚，刀疤男，黑衣追兵若干
△ 沈砚和林岚撞入仓库，卷帘门在身后落下。刀疤男用短棍砸门，黑衣追兵绕向另一侧。
△ 林岚指向前方的红色安全门。沈砚将证物盒塞进她的左手，自己转身挡住追兵。
沈砚(急促)：你先走，楼梯口汇合！
△ 两名追兵同时扑上。沈砚用木箱格挡，连续后退三步；林岚抱紧证物盒冲向安全门。镜头在木箱上方短暂俯拍，交代两人的新站位，完成一次轴线转换。

场次：1-3
时间地点：仓库消防楼梯  内  夜
人物：沈砚，林岚，刀疤男
△ 红色安全门被林岚撞开。她沿楼梯向上，证物盒贴在胸前。沈砚从门内追出，刀疤男从下层冲上。
△ 二层平台，刀疤男抓住沈砚的衣领。沈砚压低重心，用肘击脱身，翻过半人高的扶手落到上层平台。林岚在上方回身伸手。
林岚(喊)：快！
△ 沈砚抓住林岚的右手，起身与她并肩冲向天台门。刀疤男停在下层，抬头看着他们。

场次：1-4
时间地点：码头天台  外  夜/雨停
人物：沈砚，林岚，刀疤男（画外）
△ 天台门被推开，雨声骤低，远处海面灯光闪烁。林岚把证物盒重新交回沈砚右手。两人背靠通风机，面向城市方向。
林岚(喘息)：盒子里是能洗清你的证据。
△ 楼梯门外传来刀疤男的脚步。沈砚扣紧证物盒，带着林岚向天台另一侧的逃生梯移动；镜头缓慢右摇，停在逃生梯入口的黄色警示线前。
【空镜：湿润天台边缘，城市灯光在水洼中延伸】
```

## 二、全局图片资产 Prompt

```text
[Subject 1｜角色参考图] Shen Yan, lean Chinese man in his early 30s, short black hair, faint cut on the right cheek, dark waterproof jacket over a charcoal shirt, black cargo trousers, worn running shoes; athletic but exhausted posture; front full-body, left and right 45-degree half-body, face close-up and right-hand prop-holding detail on a neutral grey studio background, cinematic photorealism, no text, no watermark.

[Subject 2｜角色参考图] Lin Lan, Chinese woman in her late 20s, shoulder-length black hair tied low, olive rain shell, dark jeans, red thread bracelet on the right wrist; alert determined expression; front full-body, 45-degree views, face close-up and left-hand prop-holding detail, neutral grey studio background, cinematic photorealism, no text, no watermark.

[Subject 3｜角色参考图] Scar-faced pursuer, broad Chinese man in his late 30s, shaved sides, diagonal scar across left cheek, black work coat, heavy boots, carrying a short steel baton; front and 45-degree full-body views, neutral grey studio background, cinematic photorealism, no text, no watermark.

[Subject 4｜环境参考图] Abandoned passenger pier at night, rusted containers, wet metal walkway, black sea beyond, sparse sodium lamps, rain haze, red warehouse safety door and yellow roof warning line as fixed spatial anchors, empty establishing plate, cinematic photorealism, no text, no watermark.

[Subject 5｜道具参考图] Small silver evidence box with a recessed lid, two black corner screws and a blue tamper seal; closed, open and hand-held views, neutral product reference, no text, no watermark.

[Subject 6｜道具参考图] Short steel baton with a rubber grip and chipped black paint, closed prop reference, neutral grey background, no text, no watermark.

[Picture 1｜故事板参考图｜码头追逐与第一次交手] Storyboard reference panel, wide-to-medium dynamic composition on a rain-soaked pier: Shen Yan runs toward camera right holding the silver evidence box in his right hand, Lin Lan follows three meters behind, the scar-faced pursuer cuts out from between containers with a baton, wet railings form strong diagonal leading lines, sodium lamp from upper left, cold blue sea in deep background, no text, no watermark.

[Picture 2｜故事板参考图｜仓库道具交接] Storyboard reference panel, medium shot inside the warehouse: Shen Yan on camera left passes the silver evidence box into Lin Lan's left hand while turning his torso toward two incoming pursuers on camera right; red safety door centered in background, wooden crate foreground, overhead fluorescent strip, clear hand and prop visibility, no text, no watermark.

[Picture 3｜故事板参考图｜楼梯越轴桥接] Storyboard reference panel, neutral high-angle view of the red fire stairwell landing: Lin Lan above reaches down with her right hand, Shen Yan rises from the lower platform after vaulting the rail, scar-faced pursuer remains one level below; vertical railings and landing edges clearly map the new axis, cold green fluorescent light, no text, no watermark.

[Picture 4｜故事板参考图｜天台收束] Storyboard reference panel, medium-wide rooftop composition after rain: Shen Yan and Lin Lan stand beside a ventilation unit, Shen Yan holds the silver evidence box in his right hand, both face the city at camera right, yellow warning line and escape-ladder entrance at the right edge, soft blue moonlight with distant warm windows, no text, no watermark.
```

## 三、生成单元 1（00:00.000—00:12.000）

### 生成设置（中文，不复制到 H3 Prompt）

生成单元：1/4
全片时间线：00:00.000—00:48.000
本段时间线：00:00.000—00:12.000
生成时长：12.0 秒
可用时长：12.0 秒
重叠时长：0 秒
连续性模式：画面引导（rgb_guide）
连续性输入：剧本初始状态；沈砚在码头画面左侧，证物盒在右手，林岚位于后方，刀疤男从集装箱间切入。
连续性输出：沈砚与林岚进入仓库卷帘门内；沈砚仍持有证物盒，证物盒在右手；刀疤男和追兵被卷帘门隔在外侧。
状态变化：从码头三人追逐变为仓库入口内外对峙；证物盒未交接。
交接帧：00:11.6 左右，卷帘门落下后的一帧清晰画面；沈砚在画面左前景、右手持盒，林岚在其后，红色安全门尚未出现。
生成素材：Subject 1、2、3、4、5、6；Picture 1 码头追逐故事板参考图；无需上一段实际尾帧图。
参考图选择：
必选：Subject 1、2、3、5、6、Picture 1——锁定追逐人物、短棍、证物盒和码头动作构图。
可选：Subject 4——增强追兵数量感。
禁止混用：无。
声音交接：雨声、脚步声和金属碰撞声完整结束或延续；林岚台词在本段内说完。
镜头衔接输入：广角码头，沈砚向画面右侧逃跑，摄影机位于追逐轴线左侧，主光来自左上方钠灯。
镜头衔接输出：卷帘门从上方落下形成垂直遮挡，摄影机停在仓库内侧，人物左右关系不改变。
镜头过渡：跟拍沈砚撞入仓库，镜头在卷帘门落下时短暂被遮挡，切入下一段仓库内侧的同方向构图。

### 模型 Prompt，可直接复制

```text
subject_definitions:
<Subject 1> is Shen Yan, a lean Chinese man in his early 30s with short black hair, a faint cut on his right cheek, a dark waterproof jacket, charcoal shirt, black cargo trousers and worn running shoes; he carries <Subject 5> in his right hand during this unit.
<Subject 2> is Lin Lan, a Chinese woman in her late 20s with tied-back shoulder-length black hair, an olive rain shell, dark jeans and a red thread bracelet on her right wrist.
<Subject 3> is the scar-faced pursuer, a broad Chinese man with shaved sides, a diagonal scar on his left cheek, a black work coat and heavy boots; he carries <Subject 6>.
<Subject 4> is a small group of black-clad pursuers emerging around the pier and warehouse entrance.
<Subject 5> is the small silver evidence box with two black corner screws and a blue tamper seal.
<Subject 6> is the short steel baton with chipped black paint and a rubber grip.
<Subject 7> is the abandoned passenger pier and warehouse entrance at night, with rusted containers, a wet metal walkway, sodium lamps, rain haze and a rolling shutter.
<Picture 1> is the storyboard reference panel for the planned pier chase and first baton encounter.

summary:
[reference generation + image reference] From 00:00.000 to 00:12.000 of a cold blue rain-soaked chase thriller, <Subject 1> runs toward camera right across <Subject 7> with <Subject 5> in his right hand while <Subject 2> follows and <Subject 3> attacks with <Subject 6>. The planned diagonal blocking from storyboard panel <Picture 1> is followed. <Subject 1> kicks free, pulls <Subject 2> with him and reaches the warehouse before the rolling shutter closes.

retention_analysis:
<Subject 1> ([Shot 1]-[Shot 4]): fully_preserved - face mark, waterproof jacket, escape direction and right-hand evidence box remain visible.
<Subject 2> ([Shot 1]-[Shot 4]): fully_preserved - olive shell, tied hair and position behind <Subject 1> remain consistent.
<Subject 3> ([Shot 2]-[Shot 4]): fully_preserved - scar, black coat and baton remain consistent until the shutter blocks him.
<Subject 4> ([Shot 3]-[Shot 4]): partially_preserved - pursuers close the warehouse exit without changing the main axis.
<Subject 5> ([Shot 1]-[Shot 4]): fully_preserved - silver body, blue seal and holder <Subject 1> remain unchanged.
<Subject 6> ([Shot 2]-[Shot 3]): fully_preserved - baton stays in <Subject 3>'s right hand.
<Subject 7> ([Shot 1]-[Shot 4]): fully_preserved - wet pier, containers, sodium lamps and rolling shutter remain the fixed anchors.
<Picture 1> ([Shot 1]-[Shot 3]): fully_preserved - planned wide-to-medium diagonal chase composition guides the action.

detailed_description:
The target video is a realistic live-action chase in cold blue rain with sodium practical lights and controlled handheld movement. The screen direction is locked toward camera right and deeper background. At 00:00.000, a wide shot follows <Subject 1> sprinting from camera left across the wet pier of <Subject 7>, <Subject 5> clearly visible in his right hand. <Subject 2> runs three meters behind him. Rusted containers create diagonal depth matching storyboard panel <Picture 1>; rain strikes the lens lightly and the camera tracks forward at medium speed. At 00:02.800, the camera cuts to a medium side angle as <Subject 3> steps from between containers on camera left and swings <Subject 6> toward <Subject 1>. <Subject 1> brakes, pivots around the wet railing and lets the baton pass in front of his chest. At 00:04.600, <Subject 1> kicks the pursuer's knee, grabs <Subject 2>'s extended right hand and pulls her into the escape line; <Subject 5> stays locked in his right hand. <Subject 2> (S1) says in a breathless urgent voice, <d>[Chinese] 沈砚，别让他们拿到盒子！</d> At 00:07.200, two black-clad pursuers appear at the far warehouse exit, forcing the pair toward the center. <Subject 1> shoulder-checks a metal post, rebounds toward camera right and reaches the rolling shutter. At 00:10.000, he drags <Subject 2> under the shutter; <Subject 3> strikes the metal as it descends. The final 1.2 seconds hold a clear interior-side view: <Subject 1> stands left foreground with <Subject 5> still in his right hand, <Subject 2> just behind him, the shutter fully lowered between them and the pursuers. The camera settles without motion blur for the handoff frame.

overall_soundscape:
Heavy rain, hollow footsteps on wet metal, baton whooshes, a shoe scraping the railing, metal impact and the rolling shutter rumble continue as realistic diegetic sounds. The warehouse side ends with muffled rain behind the closed shutter.

non_diegetic_music:
A restrained low percussion pulse enters after the first baton swing and holds under the shutter impact, without overpowering the dialogue.
```

### 中文翻译（用于核对，不复制到模型）

本段为雨夜码头追逐。沈砚右手持银色证物盒向画面右侧逃跑，林岚在后方追赶，刀疤男持短棍从集装箱间拦截。沈砚闪避并踢退对手，拉住林岚一起冲入仓库，卷帘门落下，最终尾帧停在仓库内侧：沈砚位于左前景、证物盒仍在右手，林岚在后方，追兵被卷帘门隔开。

## 四、生成单元 2（00:12.000—00:24.000）

### 生成设置（中文，不复制到 H3 Prompt）

生成单元：2/4
全片时间线：00:00.000—00:48.000
本段时间线：00:12.000—00:24.000
生成时长：12.0 秒
可用时长：11.4 秒
重叠时长：0.6 秒
连续性模式：画面引导 + 运动上下文（rgb_guide + motion_context）
连续性输入：复现第1段实际尾帧；沈砚在仓库左前景，右手持证物盒，林岚在后方，卷帘门已落下，追兵在门外。
连续性输出：林岚冲过红色安全门并持有证物盒；沈砚留在门前用木箱挡住追兵；刀疤男从侧通道绕入。
状态变化：证物盒从沈砚右手交到林岚左手；场景从仓库入口推进至安全门前；摄影机在俯拍桥接后完成轴线转换。
交接帧：00:23.6 左右，林岚左手抱紧证物盒穿过红色安全门，沈砚在门前背向镜头，木箱横在他与追兵之间。
生成素材：Subject 1、2、3、4、5、6；Picture 2 仓库道具交接故事板参考图；第1段实际尾帧图；可选第1段尾部视频，仅用于运动趋势。
参考图选择：
必选：第1段实际尾帧图、Subject 1、2、5、Picture 2——锁定卷帘门后的真实状态、双方身份、证物盒交接和构图。
可选：Subject 3、6、第1段尾部视频——增强追兵动作和运动趋势。
禁止混用：Picture 1——码头构图与仓库空间冲突。
声音交接：卷帘门余响和雨声从上一段延续；证物盒交接时加入金属扣响；沈砚台词完整结束。
镜头衔接输入：从第1段仓库内侧尾帧开始，沈砚左前景、林岚后方，红色安全门在前方偏右。
镜头衔接输出：林岚位于安全门内侧，沈砚在门外中央，追兵从画面右侧进入。
镜头过渡：先复现卷帘门尾帧并向红色安全门推进，木箱被推入前景后短暂俯拍，俯拍作为轴线桥接，再切回正面中景。

### 模型 Prompt，可直接复制

```text
subject_definitions:
<Subject 1> is Shen Yan, identical to the man in the supplied previous-unit last-frame image: dark waterproof jacket, faint right-cheek cut, starting in the warehouse left foreground with no evidence box after the handoff.
<Subject 2> is Lin Lan, identical to the supplied reference, olive rain shell and red thread bracelet; she receives <Subject 5> in her left hand.
<Subject 3> is the scar-faced pursuer in a black work coat carrying <Subject 6>.
<Subject 4> is a group of black-clad pursuers entering from the shutter side.
<Subject 5> is the silver evidence box with blue tamper seal, transferred from <Subject 1> to <Subject 2>.
<Subject 6> is the chipped short steel baton.
<Subject 7> is the warehouse interior with wooden crates, overhead fluorescent strips and a red safety door.
<Picture 2> is the storyboard reference panel for the planned evidence-box handoff and defensive blocking.

summary:
[reference generation + image reference] From 00:12.000 to 00:24.000, the action resumes from the actual last frame of Unit 1 inside <Subject 7>. <Subject 1> turns from the closed shutter, passes <Subject 5> into <Subject 2>'s left hand as planned in <Picture 2>, then blocks the pursuers with a wooden crate while she reaches the red safety door. A brief high-angle bridge clarifies the axis change before the door crossing.

retention_analysis:
<Subject 1> ([Shot 1]-[Shot 4]): fully_preserved - opening position matches the previous last frame; jacket and cheek cut remain stable; he releases <Subject 5>.
<Subject 2> ([Shot 1]-[Shot 4]): fully_preserved - same identity, bracelet and left-hand receiving action.
<Subject 3> ([Shot 3]-[Shot 4]): fully_preserved - same scar, coat and baton, entering from the shutter side.
<Subject 4> ([Shot 2]-[Shot 4]): partially_preserved - pursuers advance but remain behind the crate.
<Subject 5> ([Shot 2]-[Shot 4]): attribute_transfer - holder changes from <Subject 1>'s right hand to <Subject 2>'s left hand and remains visible.
<Subject 6> ([Shot 3]): fully_preserved - baton remains in <Subject 3>'s hand.
<Subject 7> ([Shot 1]-[Shot 4]): fully_preserved - crates, fluorescent strips and red safety door remain fixed.
<Picture 2> ([Shot 2]-[Shot 3]): fully_preserved - planned handoff composition and prop visibility guide the exchange.

detailed_description:
At 00:00.000, begin by exactly reproducing the supplied Unit 1 last-frame image: the rolling shutter is closed behind, <Subject 1> stands in the warehouse left foreground holding no box yet, <Subject 2> is behind him, and the red safety door lies ahead to camera right. The camera pushes forward with small amplitude. At 00:01.200, <Subject 1> turns toward <Subject 2>, draws <Subject 5> from his right side and places it into her left hand, matching storyboard panel <Picture 2>; the blue seal faces camera and both hands remain visible. <Subject 1> (S1) says in a low urgent voice, <d>[Chinese] 你先走，楼梯口汇合！</d> At 00:04.000, two pursuers rush from the shutter side. <Subject 1> pivots camera-left, shoves a wooden crate across the floor and uses it as a waist-high barrier. <Subject 2> clutches <Subject 5> against her chest and runs toward the red safety door. At 00:06.800, insert a neutral high-angle shot over the crate: <Subject 2> is ahead near the door, <Subject 1> occupies the center, and the pursuers fan out behind him; this overhead bridge establishes the new axis without changing the story direction. At 00:08.400, return to a medium frontal shot as <Subject 3> enters from camera right and swings <Subject 6> over the crate. <Subject 1> catches the baton wrist with both hands, releases it and shoves the attacker backward. At 00:10.300, <Subject 2> reaches the red safety door, pushes it open and crosses into the stairwell with <Subject 5> in her left hand. The final 1.1 seconds hold on the clear handoff state: <Subject 2> is just inside the red doorway, <Subject 1> remains outside with the crate between him and the pursuers, and the fluorescent warehouse light is stable for the next last-frame extraction.

overall_soundscape:
The closed shutter vibrates, rain is muffled outside, crate wheels scrape concrete, the evidence box latch clicks, shoes pound the warehouse floor and the baton strikes wood. The stairwell door hinge squeaks at the end.

non_diegetic_music:
The low percussion pulse continues with a restrained metallic rhythm during the handoff, then drops one layer when the red door opens.
```

### 中文翻译（用于核对，不复制到模型）

本段从第1段真实尾帧开始。沈砚把证物盒交给林岚左手，随后用木箱挡住追兵。俯拍镜头交代新的轴线，林岚穿过红色安全门，沈砚留在门外阻挡追兵。尾帧必须清楚显示林岚在门内持盒、沈砚在门外、木箱位于两人和追兵之间。

## 五、生成单元 3（00:24.000—00:36.000）

### 生成设置（中文，不复制到 H3 Prompt）

生成单元：3/4
全片时间线：00:00.000—00:48.000
本段时间线：00:24.000—00:36.000
生成时长：12.0 秒
可用时长：11.4 秒
重叠时长：0.6 秒
连续性模式：画面引导 + 运动上下文（rgb_guide + motion_context）
连续性输入：复现第2段实际尾帧；林岚刚穿过红色安全门，左手持证物盒；沈砚在门外，木箱挡住追兵；消防楼梯向上延伸。
连续性输出：沈砚与林岚到达二层平台并准备冲向天台门；证物盒仍在林岚左手；刀疤男停在下层。
状态变化：从仓库门口进入消防楼梯；沈砚由门外转为追赶林岚；发生扶手翻越和抓手救援。
交接帧：00:35.6 左右，沈砚抓住林岚右手站上二层平台，林岚左手持盒，天台门位于画面右前方，刀疤男在下层。
生成素材：Subject 1、2、3、5、6、8；Picture 3 楼梯越轴故事板参考图；第2段实际尾帧图；可选第2段尾部视频，仅用于运动趋势。
参考图选择：
必选：第2段实际尾帧图、Subject 1、2、3、5、Picture 3——锁定门内状态、楼梯人物关系、证物盒和越轴桥接。
可选：Subject 6、第2段尾部视频——增强短棍运动和上楼惯性。
禁止混用：Subject 9、Picture 4——天台时间和构图尚未发生。
声音交接：安全门撞击声在开头完成；仓库追兵声逐渐变为楼梯回响；林岚喊话不能被切断。
镜头衔接输入：红色安全门内侧，林岚领先上楼，沈砚紧随其后，摄影机从下方看向上方。
镜头衔接输出：二层平台，林岚在上方右侧，沈砚居中，刀疤男位于下层中央，三人关系清楚。
镜头过渡：跟随上楼后在扶手处切入中性高角度，完成越轴，再以向上摇镜接天台门。

### 模型 Prompt，可直接复制

```text
subject_definitions:
<Subject 1> is Shen Yan, identical to the supplied Unit 2 last-frame image, now without <Subject 5>, wearing the same dark waterproof jacket and moving from the doorway up the stairs.
<Subject 2> is Lin Lan, identical to the supplied reference, carrying <Subject 5> in her left hand and leading upward.
<Subject 3> is the scar-faced pursuer in the black work coat, following from the lower landing with <Subject 6>.
<Subject 5> is the silver evidence box with blue tamper seal, held by <Subject 2>'s left hand throughout this unit.
<Subject 6> is the chipped steel baton, held by <Subject 3> but never contacting the box.
<Subject 8> is the concrete fire stairwell with red safety door, metal handrails, green fluorescent lamps and two visible landings.
<Picture 3> is the storyboard reference panel for the neutral high-angle axis bridge and the hand-reach on the upper landing.

summary:
[reference generation + image reference] From 00:24.000 to 00:36.000, the video resumes at the red stair door from Unit 2. <Subject 2> climbs with <Subject 5> while <Subject 1> follows and <Subject 3> pursues from below. The neutral high-angle bridge and upper-platform hand reach follow storyboard panel <Picture 3>; the unit ends with both allies together at the roof door and the pursuer one level below.

retention_analysis:
<Subject 1> ([Shot 1]-[Shot 4]): fully_preserved - same jacket, cheek cut and position behind <Subject 2>; no evidence box appears in his hands.
<Subject 2> ([Shot 1]-[Shot 4]): fully_preserved - same outfit and left-hand hold of <Subject 5>.
<Subject 3> ([Shot 2]-[Shot 4]): fully_preserved - same scar, coat and lower-level pursuit position.
<Subject 5> ([Shot 1]-[Shot 4]): fully_preserved - remains in <Subject 2>'s left hand with seal visible.
<Subject 6> ([Shot 2]-[Shot 3]): fully_preserved - remains in <Subject 3>'s hand.
<Subject 8> ([Shot 1]-[Shot 4]): fully_preserved - red door, handrails, green lamps and vertical depth remain stable.
<Picture 3> ([Shot 2]-[Shot 4]): fully_preserved - planned high-angle bridge, rail vault and upper-platform blocking guide the sequence.

detailed_description:
At 00:00.000, reproduce the supplied Unit 2 last frame: <Subject 2> has just crossed the red safety door with <Subject 5> in her left hand, <Subject 1> is immediately behind her, and the warehouse remains visible below. The camera follows them up the concrete stairs with a controlled upward tilt. At 00:02.000, the red door swings shut behind <Subject 1> as <Subject 3> reaches the landing below; his baton and diagonal scar are clearly visible but he remains separated by one flight. At 00:04.500, <Subject 2> climbs quickly, the blue seal on <Subject 5> catching the green fluorescent light. <Subject 2> (S1) shouts upward, <d>[Chinese] 快！</d> At 00:06.000, <Subject 3> catches <Subject 1>'s jacket at the second-floor turn. They grapple for one beat without changing the stair direction. At 00:07.200, cut to the neutral high-angle composition planned by <Picture 3>: the railings, two landings and all three positions are readable; this neutral view bridges the axis. <Subject 1> ducks under the grip, vaults the half-height handrail and drops onto the upper platform. At 00:09.500, <Subject 2> turns back from the roof door and reaches down with her right hand while keeping <Subject 5> in her left. <Subject 1> catches her hand and rises beside her. At 00:11.000, the camera tilts toward the roof door as both allies move to camera right; <Subject 3> remains one level below, looking upward with <Subject 6> lowered. The final second holds a stable platform frame with <Subject 1> holding <Subject 2>'s right wrist, <Subject 2> holding <Subject 5> in her left hand, and the roof door ahead.

overall_soundscape:
Concrete footsteps, breath, handrail rattles, the red door thump and stairwell reverberation continue. The baton scrapes the railing once, while the allies' voices echo upward.

non_diegetic_music:
The percussion pulse narrows into a tense sustained bass tone during the vault, then resumes softly as the roof door approaches.
```

### 中文翻译（用于核对，不复制到模型）

本段进入消防楼梯。林岚左手持证物盒领先上楼，沈砚随后，刀疤男从下层追来。中性高角度镜头明确交代越轴后的空间关系；沈砚翻过扶手落到上层，林岚伸右手拉他起身。结尾两人并肩到达天台门，刀疤男停在下层。

## 六、生成单元 4（00:36.000—00:48.000）

### 生成设置（中文，不复制到 H3 Prompt）

生成单元：4/4
全片时间线：00:00.000—00:48.000
本段时间线：00:36.000—00:48.000
生成时长：12.0 秒
可用时长：11.4 秒
重叠时长：0.6 秒
连续性模式：画面引导 + 运动上下文（rgb_guide + motion_context）
连续性输入：复现第3段实际尾帧；沈砚抓住林岚右手站在二层平台，林岚左手持证物盒，天台门在画面右前方，刀疤男在下层。
连续性输出：两人到达雨停天台，沈砚右手重新持有证物盒，刀疤男只在楼梯门外以脚步声存在；镜头稳定在黄色警示线和逃生梯入口。
状态变化：场景由室内楼梯切换至室外天台；证物盒从林岚左手交回沈砚右手；雨声降低，城市环境声出现。
交接帧：00:47.6 左右，沈砚右手持盒、林岚站在其左后方，两人靠通风机面向画面右侧，黄色警示线和逃生梯入口清晰可见。
生成素材：Subject 1、2、3、5、8、9；Picture 4 天台收束故事板参考图；第3段实际尾帧图；可选第3段尾部视频，仅用于运动趋势。
参考图选择：
必选：第3段实际尾帧图、Subject 1、2、5、9、Picture 4——锁定楼梯到天台的真实状态、道具交还和最终构图。
可选：Subject 8、第3段尾部视频——增强门框转场和运动趋势。
禁止混用：Picture 2、Picture 3——仓库/楼梯构图与天台收束构图冲突。
声音交接：楼梯脚步和门响在开头完成；雨声由强变弱并与天台风声交叉；对白在本段内完整结束。
镜头衔接输入：二层平台向右前方天台门推进，沈砚和林岚保持前后关系，证物盒在林岚左手。
镜头衔接输出：天台中景，沈砚右手持盒，林岚位于左后方，逃生梯入口固定在画面右边缘。
镜头过渡：镜头跟随推门穿过门框，利用门框遮挡完成室内外转换；出门后缓慢右摇，停在黄色警示线。

### 模型 Prompt，可直接复制

```text
subject_definitions:
<Subject 1> is Shen Yan, identical to the supplied Unit 3 last-frame image, dark waterproof jacket and faint cheek cut; he receives <Subject 5> back into his right hand on the rooftop.
<Subject 2> is Lin Lan, identical to the supplied reference, olive rain shell and red bracelet; she begins holding <Subject 5> in her left hand and stands to <Subject 1>'s left rear.
<Subject 3> is the scar-faced pursuer, heard and briefly seen only outside the stairwell door; he does not enter the rooftop frame.
<Subject 5> is the silver evidence box with blue tamper seal, transferred back from <Subject 2>'s left hand to <Subject 1>'s right hand.
<Subject 8> is the concrete fire stairwell leading through the roof door.
<Subject 9> is the wet rooftop at night after rain, with ventilation units, a yellow warning line, city lights and an escape-ladder entrance at camera right.
<Picture 4> is the storyboard reference panel for the rooftop arrival and final stable composition.

summary:
[reference generation + image reference] From 00:36.000 to 00:48.000, the action resumes on the upper stair landing and passes through the roof door into <Subject 9>. <Subject 2> returns <Subject 5> to <Subject 1>'s right hand as planned by <Picture 4>; they take cover beside a ventilation unit while the pursuer remains outside. The camera settles on the yellow warning line and escape-ladder entrance for a clean final handoff frame.

retention_analysis:
<Subject 1> ([Shot 1]-[Shot 4]): fully_preserved - same face, jacket and right-hand final prop hold.
<Subject 2> ([Shot 1]-[Shot 4]): fully_preserved - same olive shell, bracelet and left-to-right prop transfer.
<Subject 3> ([Shot 1]-[Shot 2]): weak_reference - only footsteps, a shadow and a partial hand at the stair door; he never appears on the open roof.
<Subject 5> ([Shot 1]-[Shot 3]): attribute_transfer - moves from <Subject 2>'s left hand back to <Subject 1>'s right hand, blue seal remains visible.
<Subject 8> ([Shot 1]-[Shot 2]): fully_preserved - red roof door and stairwell frame bridge the scene change.
<Subject 9> ([Shot 2]-[Shot 4]): fully_preserved - wet roof, ventilation unit, yellow warning line and escape-ladder entrance remain fixed.
<Picture 4> ([Shot 2]-[Shot 4]): fully_preserved - planned rooftop arrival and final composition guide the camera settle.

detailed_description:
At 00:00.000, reproduce the supplied Unit 3 last frame: <Subject 1> is on the upper platform holding <Subject 2>'s right wrist, <Subject 2> holds <Subject 5> in her left hand, the roof door is camera right and <Subject 3> is below. The camera follows their final steps toward the door. At 00:01.800, <Subject 2> pushes the roof door open; the door frame briefly fills the image and bridges the indoor stairwell to the wet rooftop. Footsteps from <Subject 3> stop on the other side. At 00:03.000, emerge into <Subject 9>, where rain has stopped and distant city lights shimmer in puddles. <Subject 2> places <Subject 5> back into <Subject 1>'s right hand, blue seal facing camera. <Subject 1> (S1) closes his fingers around it and says in a controlled but breathless voice, <d>[Chinese] 盒子里是能洗清你的证据。</d> At 00:06.800, both move beside a low ventilation unit; <Subject 1> stands slightly forward on camera left, <Subject 2> behind and left, both facing camera right toward the city. <Subject 2> (S2) replies, <d>[Chinese] 那就别再回头。</d> At 00:09.000, a shadow and one gloved hand appear behind the roof door but <Subject 3> remains off-screen; the allies turn toward the escape-ladder entrance. The camera slowly pans right following their eyeline, revealing the yellow warning line and ladder at the right edge. The final 2.0 seconds hold a stable medium-wide frame: <Subject 1> grips <Subject 5> in his right hand, <Subject 2> stays at his left rear, the roof door is behind them, and the yellow line and ladder form the next visual anchor. Add the post-production caption “凌晨一点四十七分” and the empty rooftop beat without generated text.

overall_soundscape:
Stairwell footsteps and the roof door hinge resolve into soft rooftop wind, distant harbor machinery, wet shoe taps and a faint city hum. The rain drops to a light residual drip; the pursuer's footsteps stop behind the door.

non_diegetic_music:
The tense bass releases into a restrained low string pad after the prop returns to <Subject 1>, holding a quiet unresolved note through the final frame.
```

### 中文翻译（用于核对，不复制到模型）

本段从楼梯二层进入雨停天台。林岚把证物盒交回沈砚右手，两人躲到通风机旁，刀疤男只在门后以脚步和影子存在。镜头右摇至黄色警示线和逃生梯入口，形成稳定尾帧。字幕“凌晨一点四十七分”建议后期添加。

## 七、文字版验收报告

1. 分段限制通过：4 个生成单元均为 12.0 秒，未超过 15 秒；第 2—4 段各有 0.6 秒动作重叠，可在剪辑时裁掉重复部分。
2. 故事板职责通过：Picture 1—4 只描述计划中的构图、站位和动作面板；没有把任何 Picture 写成上一段实际尾帧。
3. 尾帧交接通过：第 2—4 段的连续性输入明确要求使用上一段实际生成的稳定尾帧图，并逐项继承人物位置、道具持有者、摄影机方向和场景锚点。
4. 资产复用通过：角色、场景和证物盒使用固定 Subject 标签；证物盒在第 2 段和第 4 段分别完成两次明确的持有者交接。
5. 轴线与站位通过：仓库俯拍和楼梯高角度镜头承担中性桥接；追逐主方向保持向画面右侧/纵深，不在切点无理由反转。
6. 镜头衔接通过：每段均提供镜头衔接输入、输出和可执行过渡，且 H3 的 `detailed_description` 首镜、尾镜与其一致。
7. H3 结构通过：每个模型 Prompt 仅包含 `subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music` 六个官方字段，未混入生成设置。
8. 语言边界通过：生成设置、状态和衔接说明为中文；模型 Prompt 为英文；中文翻译单独放在模型代码块之外，不应复制进 H3。
9. 声音连续性通过：雨声、脚步、金属声和配乐均写明段间交接，台词没有在切点截断。
10. 失败诊断建议：若第 2 段道具交接失败，优先重新截取第 1 段卷帘门落下后的清晰尾帧；若第 3 段人物站位混乱，优先提高 Picture 3 的高角度空间参考强度，而不是新增角色描述。
