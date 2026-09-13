# 暴力压力测试：连续打斗 + 多人追逐 + 闪回 + 多场景转换

- 被测对象：`ai-video-shot-designer`（当前测试分支版本）
- 压力要素：2 场连续打斗、3 追 1 多人追逐、插入式短闪回 + 独立场次长闪回（冷暖色调切换）、5 个场景（内/外、夜/黄昏/雨）、道具两次易手、OS 内心独白、未出场 VO、【字幕】【空镜】、中文台词口型规避、估算时长约 64.8s（强制触发 ≤15s 分段）。
- 剧本格式：遵循《剧本格式规范.md》（场次/时间地点内外/△动作/角色台词/(语气)/OS·VO/闪回·闪回结束/【字幕】【空镜】）。

---

## 一、压测剧本《第七小时》（自造测试本，正文约 700 字）

```text
1-1 地下停车场  内  夜
人物：陆铮、周砚、阿鬼、陈默
△ 冷白钠灯频闪，水泥柱拉出长影。陆铮背靠一辆黑色轿车，右手攥着一枚U盘。
  三个方向：周砚立车头右侧，阿鬼转着折叠刀靠左侧立柱，陈默堵死后方出口。
周砚(沉声)：把东西放下，你跑不出去。
△ 陆铮不答，目光扫过头顶楼梯指示牌。阿鬼突然自左侧扑上，折叠刀直刺。
陆铮(低喝)：滚开！
△ 陆铮侧让，左手扣住阿鬼持刀手腕向外一带，右手顺势夺下折叠刀（刀易手）；
  周砚自右扑来，陆铮以刀背格开其手臂，后退，反手将刀掷向远处排水沟，撞向楼梯门。
周砚(急喝)：别让他进楼梯！阿鬼，跟上！
插入镜头（闪回·约1.5秒）
△ 暖金色光里，一只女人的手把U盘按进陆铮掌心。
苏晚(VO，极轻)：记住，别信穿制服的。
闪回结束

1-2 消防楼梯间  内  夜
人物：陆铮、周砚、阿鬼、陈默
△ 陆铮撞门冲入，沿楼梯向上狂奔，声控灯一节节亮起又熄灭。
△ 周砚、阿鬼自底层追入；陈默转身跑向另一侧楼梯，向上层反向包抄。
阿鬼(喘)：他往上跑了！
△ 二层转角，陆铮与自上而下的陈默撞个正着，短促扭打。陆铮肩被扣，借势翻上扶手，
  自两层间空隙滑落下一层平台甩开陈默（中性俯拍过渡越轴），继续向上。
陈默(怒喝)：拦住他——！

1-3 雨夜后街  外  夜/雨
人物：陆铮、周砚、阿鬼、陈默
△ 顶层防火门被撞开，陆铮踉跄冲入冷蓝雨巷，路灯在积水上抖碎。
【空镜：雨夜巷道，霓虹招牌在积水中晃动，雨幕如纱】
△ 三人先后冲出。陆铮始终沿巷道向画面深处/右侧奔逃，周砚贴右墙、阿鬼贴左墙包夹，跟拍。
△ 巷口陈默横身堵出，形成前后夹击。陆铮抓起墙边一辆铁艺推车横扫逼退陈默，
  顺势将推车推倒挡死巷道，翻上左侧矮墙。
周砚(喘息，厉声)：他往桥底去了，两边包，别跟丢！
陆铮(OS)：苏晚……你到底卷进了什么。

1-4 城西天台  外  黄昏（闪回·长回忆）
人物：陆铮、苏晚
闪回
△ 暖金色黄昏、胶片颗粒。天台风大，苏晚背对落日、侧脸隐在逆光里，把U盘放进陆铮掌心。
【字幕：三天前 · 城西天台】
苏晚(压着声，侧脸)：这里面是全部账。我要是出事，只有你能送出去。
陆铮(迟疑)：为什么是我？
苏晚：因为你不穿那身皮，也不站任何一边。
△ 陆铮握紧U盘点头，风掀起苏晚头发。
闪回结束

1-5 高架桥底  外  夜
人物：陆铮；周砚、阿鬼、陈默（画外）；广播VO
△ 硬切回冷青现实。陆铮靠水泥桥柱剧烈喘息，摊开掌心，U盘还在。远处脚步与警笛交错。
广播VO(空旷回响)：七号区域正在排查，无关人员立即撤离。
△ 桥柱贴一张褪色寻人启事，陆铮抬眼看它，又看向尽头黑着的排水通道，咬牙弓身钻进去。
△ 几道手电光柱随后扫过桥底，在湿墙上游走；陆铮屏住呼吸贴进通道最深处，
  只剩路灯缝漏下的一线冷光（暗场，仅合法可见光源）。
【字幕：追缉 · 第七小时】
△ 光柱扫过又移开，脚步渐远，只剩滴水与雨声，画面沉入黑暗。
（全片完，估算时长约 64.8 秒，21 镜，切 5 个 13.0s 生成单元）
```

---

## 二、图片资产 Prompt（逐项可复制；标用途与标签）

```text
[Subject 1 · identity] Lu Zheng, protagonist. Character reference, front + 3/4 side full-body views, lean Chinese man early 30s, short black hair, tired sharp eyes, faint scar on left brow, dark-grey zip-up jacket over black T-shirt, black trousers, scuffed leather shoes; tense athletic stance; plain light-grey seamless backdrop, soft neutral studio light, feet fully in frame, no crop, no text, no watermark, photoreal cinematic concept.

[Subject 2 · identity] Zhou Yan, lead pursuer. Chinese man late 30s, short crew cut, hard square jaw, fitted black tactical jacket, dark cargo pants, gloves; cold controlled expression; same neutral full-body reference sheet, light-grey backdrop, no text, no watermark.

[Subject 3 · identity] A-Gui, knife-hand pursuer. wiry Chinese man late 20s, small earring, unzipped layered dark hoodie, hunched agile posture, one hand habitually low; neutral full-body reference sheet, light-grey backdrop, no text, no watermark.

[Subject 4 · identity] Chen Mo, blocker. stocky broad-shoulder Chinese man mid 30s, buzz cut, dark padded bomber jacket, heavy boots; neutral full-body reference sheet, light-grey backdrop, no text, no watermark.

[Subject 5 · identity / flashback] Su Wan. Chinese woman late 20s, shoulder-length hair, beige trench coat over cream knit; reference shown mainly in profile and back, calm sorrowful expression; two lighting variants noted: warm golden for flashback; neutral full-body sheet, light-grey backdrop, no text, no watermark.

[Subject 6 · environment] Underground parking garage, low cold-white sodium lamps flickering, raw concrete columns, painted floor lines, a black sedan, distant drainage gutter, deep green-cyan shadows, empty of people, wide establishing plate, cinematic, no text, no watermark.

[Subject 7 · environment] Concrete fire-escape stairwell, motion-sensor ceiling lamps lighting section by section, metal handrail, landings, cold fluorescent green-cyan tone, vertical depth, empty of people, architectural plate, no text, no watermark.

[Subject 8 · environment] Rainy back alley at night, cold-blue street lamps, wet cobblestone mirroring blurred neon signage, low left-side wall, a rusty iron wheeled cart against the wall, falling rain, empty of people, atmospheric plate, no text, no watermark.

[Subject 9 · environment + flashback style anchor] Rooftop at golden-hour dusk, warm amber sunlight, gentle film grain, low concrete parapet, city skyline rim-lit, wind, noticeably warmer/softer palette contrasting the cold present timeline, empty of people, style-reference plate, no text, no watermark.

[Subject 10 · environment] Under a concrete viaduct at night, cold cyan dark, wet walls, a faded missing-person notice on a pillar, a black drainage tunnel mouth at the far end, thin slit of distant street light, empty of people, no text, no watermark.

[Subject 11 · prop] A small worn dark-metal USB flash drive, slightly scratched surface, neutral product reference, three-quarter and top views, light-grey backdrop, no text, no watermark.

[Subject 12 · prop] A black folding pocket knife shown both closed and half-open, matte handle, neutral prop reference, light-grey backdrop, no text, no watermark.

[Subject 13 · prop] A rusty iron four-wheel utility cart, worn push bar, heavy metal frame, neutral prop reference, light-grey backdrop, no text, no watermark.

[Picture 1｜故事板参考图｜第3镜头夺刀动作] Cinematic storyboard reference panel, medium-close shot in the cold garage: Lu Zheng's left hand clamps A-Gui's knife-wrist while his right hand seizes the folding knife mid-thrust; Zhou Yan lunges in from 画面右侧; strong diagonal tension, sodium rim light, storyboard composition, no text, no watermark.

[Picture 2｜故事板参考图｜记忆插入] Extreme close-up storyboard reference panel of a woman's hand pressing the worn USB drive into a man's open palm, warm golden light, very shallow depth of field, soft film grain, a single isolated memory frame, no text, no watermark.

[Picture 3｜故事板参考图｜天台闪回] Golden-hour rooftop storyboard reference panel: backlit Su Wan in profile handing the USB drive to Lu Zheng facing her, wind lifting her hair, warm amber grade and film grain, storyboard composition anchor, no text, no watermark.
```

---

## 三、历史长 Prompt 基线（仅用于回归比对，不属于当前交付）

以下长 Prompt 保留作为修改前基线，用于确认当前 Skill 已改为只交付不超过 15 秒的独立生成单元；不得将本节复制到模型。

<!-- h3-validator: ignore -->
```text
subject_definitions:
<Subject 1> is Lu Zheng, a lean Chinese man in his early 30s with short black hair, a faint scar on his left brow, a dark-grey zip-up jacket over a black T-shirt, black trousers and scuffed leather shoes; he holds <Subject 11> and is the single person being chased.
<Subject 2> is Zhou Yan, the lead pursuer, late 30s, crew cut, fitted black tactical jacket and gloves, positioned on the camera-right side of the chase axis.
<Subject 3> is A-Gui, the wiry knife-hand pursuer in a layered dark hoodie, initially carrying <Subject 12>, positioned on the camera-left side.
<Subject 4> is Chen Mo, the stocky blocker in a dark padded bomber, used for the reverse pincer and the alley-head cut-off.
<Subject 5> is Su Wan, a woman in a beige trench coat who appears only inside flashbacks, shown in profile or backlit to avoid front lip-sync; her appearance comes from warm memory light.
<Subject 6> is the cold-green underground parking garage with flickering sodium lamps and concrete columns.
<Subject 7> is the cold cyan concrete fire-escape stairwell with section-by-section sensor lamps and a metal handrail.
<Subject 8> is the cold-blue rainy back alley with wet reflective ground, blurred neon and a low left wall.
<Subject 9> is the warm golden-hour rooftop, which also anchors the softer film-grain flashback visual style that contrasts the present timeline.
<Subject 10> is the cold dark viaduct underpass with a black drainage tunnel and a single slit of distant street light.
<Subject 11> is the small worn dark-metal USB drive, the through-line object, kept in <Subject 1>'s grip except during the rooftop hand-off memory.
<Subject 12> is the black folding knife: held by <Subject 3>, seized by <Subject 1> in the disarm, then thrown away and never held again.
<Subject 13> is the rusty iron wheeled cart in <Subject 8>, swept sideways and tipped over to block the alley.
<Picture 1> is the garage disarm storyboard reference panel, fixing the wrist-clamp/seize composition and the camera-right lunge of <Subject 2>.
<Picture 2> is the warm insert storyboard reference panel of a woman's hand pressing <Subject 11> into a man's palm.
<Picture 3> is the golden rooftop storyboard reference panel that anchors the long flashback blocking and warm grade.

summary:
[reference generation + image reference] An estimated 64.8-second (unconfirmed, inferred from dialogue and action density) cold-toned live-action chase thriller. In <Subject 6>, <Subject 1>, clutching <Subject 11>, is cornered by <Subject 2>, <Subject 3> and <Subject 4>, disarms <Subject 3> of <Subject 12> at the beat fixed by storyboard panel <Picture 1>, discards the knife and breaks into <Subject 7>, where a vertical pincer is shaken off. The chase pours into the rainy <Subject 8>, a second close-quarters scuffle ends with <Subject 13> tipped over as a barrier, and two flashbacks (the warm insert <Picture 2> and the long rooftop memory <Picture 3> in <Subject 9>) interrupt the present before <Subject 1> vanishes into the dark <Subject 10>. Identity and environment references guide generation, while the three storyboard panels guide planned composition and action beats.

retention_analysis:
<Subject 1> (appears in [Shot 1]-[Shot 4], [Shot 6], [Shot 8]-[Shot 14], [Shot 15]-[Shot 16] in memory, [Shot 18]-[Shot 21]): fully_preserved - face, scar, dark-grey jacket and athletic movement stay identical across every present scene and the warm flashback.
<Subject 2> ([Shot 1]-[Shot 4], [Shot 7], [Shot 11]-[Shot 14]): fully_preserved - crew cut, black tactical jacket and his camera-right relationship to the chase axis are retained.
<Subject 3> ([Shot 1]-[Shot 3], [Shot 7], [Shot 11]-[Shot 13]): fully_preserved - wiry build, layered hoodie and camera-left starting side retained.
<Subject 4> ([Shot 1], [Shot 7]-[Shot 8], [Shot 12]-[Shot 13]): fully_preserved - stocky build and bomber retained in the pincer and alley block.
<Subject 5> ([Shot 5] insert, [Shot 15]-[Shot 16]): fully_preserved - same face and beige coat across both separated flashbacks, always profile/backlit.
<Subject 6> ([Shot 1]-[Shot 4]): fully_preserved - sodium lamps, columns and the black sedan layout retained.
<Subject 7> ([Shot 6]-[Shot 9]): fully_preserved - sensor-lamp rhythm, handrail and vertical concrete structure retained.
<Subject 8> ([Shot 10]-[Shot 14]): fully_preserved - cold-blue wet alley, neon reflection and left low wall retained.
<Subject 9> ([Shot 15]-[Shot 16]): fully_preserved - warm golden grade and film grain retained for the whole flashback and never leak into present scenes.
<Subject 10> ([Shot 18]-[Shot 21]): fully_preserved - viaduct pillars, drainage mouth and single cold light slit retained.
<Subject 11> (through-line, [Shot 1], [Shot 5], [Shot 15]-[Shot 16], [Shot 18]): fully_preserved - same worn USB drive; holder is <Subject 1> in the present and <Subject 5> only inside the hand-off memory.
<Subject 12> ([Shot 2]-[Shot 4]): partially_preserved - the same knife changes holder from <Subject 3> to <Subject 1> during the disarm and is then thrown off-screen in [Shot 4], after which it never reappears.
<Subject 13> ([Shot 13]-[Shot 14]): partially_preserved - the same cart is first swept sideways then tipped onto its side as a barrier and stays down.
<Picture 1> ([Shot 3] disarm storyboard panel): fully_preserved - the shot converges on this planned wrist-clamp/seize composition and camera-right lunge.
<Picture 2> ([Shot 5] insert storyboard panel): fully_preserved - the insert follows this planned warm hand-off composition.
<Picture 3> ([Shot 15]-[Shot 16] rooftop storyboard panel): fully_preserved - the rooftop flashback blocking and warm grade match this planned reference.

detailed_description:
The target video is a handheld, cinematic live-action chase thriller in a cold desaturated green-cyan grade with hard practical sodium and neon sources; only the flashbacks shift to a warm amber, grainy memory grade. The chase keeps one consistent screen-direction axis: <Subject 1> always flees toward 画面右侧 / deeper background, <Subject 2> tracks the right side and <Subject 3> the left side, and any axis crossing is bridged by a neutral overhead or motion transition.
[Shot 1] A wide cold establishing shot inside <Subject 6>, the camera dollies forward with small amplitude at slow speed. <Subject 1> presses his back against the black sedan, his right hand closed around <Subject 11>. <Subject 2> stands at the car nose on 画面右侧, <Subject 3> idles by a column on 画面左侧 flipping <Subject 12>, and <Subject 4> blocks the rear exit in the background, completing a three-point enclosure. <Subject 2> (S1) says in a low, controlled voice, <d>[Chinese] 把东西放下，你跑不出去。</d> He closes his lips and keeps stepping in.
[Shot 2] At 00:03.200, the shot cuts to a medium-close view as <Subject 3> suddenly lunges from 画面左侧, <Subject 12> thrusting forward in a short diagonal stab. <Subject 1> pivots his torso off the line and, with a sharp exhale, <Subject 1> (S2) says, <d>[Chinese] 滚开！</d> His left hand begins to rise toward the knife wrist to set up the next beat.
[Shot 3] At 00:05.800, the shot cuts to the disarm composition planned by storyboard panel <Picture 1>, tight medium-close, the camera handheld with small amplitude at medium speed. Picking up from the raised left hand, <Subject 1> clamps <Subject 3>'s knife-wrist and twists it outward while his right hand seizes <Subject 12>; holder of the knife passes from <Subject 3> to <Subject 1>. <Subject 2> lunges in from 画面右侧, preserving the axis.
[Shot 4] At 00:08.400, the shot cuts to a medium shot continuing the same motion: <Subject 1> uses the flat of <Subject 12> to block <Subject 2>'s incoming arm, back-pedals two steps toward 画面右侧, then throws the knife overhand toward the far drainage gutter; <Subject 12> leaves frame and is no longer held by anyone. <Subject 1> turns and drives his shoulder toward the stairwell door. <Subject 2> (S1) shouts, <d>[Chinese] 别让他进楼梯！阿鬼，跟上！</d>
[Shot 5] At 00:10.800, the image jumps into a roughly two-second warm insert matching <Picture 2>, an extreme close-up with shallow focus and gentle film grain: a woman's hand presses <Subject 11> into a man's palm. <Subject 5> (S3) says in an off-screen voiceover, barely above a whisper, her lips not visible, <d>[Chinese] 记住，别信穿制服的。</d> The warm frame flickers out.
[Shot 6] At 00:13.000, the shot cuts hard back to cold cyan as the stairwell door slams open and <Subject 1> bursts into <Subject 7>. The camera tilts upward with medium amplitude at medium speed, following him sprinting up the stairs while sensor lamps ignite section by section and die behind him; he keeps <Subject 11> clenched in his right hand.
[Shot 7] At 00:15.600, the shot cuts to a lower landing where <Subject 2> and <Subject 3> rush in from the bottom, still right/left of the axis, while <Subject 4> peels off toward the opposite stair to loop above, establishing a vertical pincer. <Subject 3> (S4) pants between breaths, <d>[Chinese] 他往上跑了！</d>
[Shot 8] At 00:18.800, at the second-floor turn <Subject 1> collides head-on with <Subject 4> descending from above and they grapple at close quarters; <Subject 4> grabs his shoulder. A brief neutral overhead shot bridges the axis crossing, then <Subject 1> vaults the handrail and drops through the gap to the next landing down, breaking the hold, and immediately resumes climbing. <Subject 4> (S5) roars, <d>[Chinese] 拦住他——！</d>
[Shot 9] At 00:22.400, the shot cuts to <Subject 1> slamming the top fire door open, light flaring as he crosses from interior toward exterior, the camera pushing through behind him with small amplitude at fast speed.
[Shot 10] At 00:25.800, the shot cuts outside to <Subject 8> for a short atmospheric beat: cold-blue rain, neon trembling on the standing water; <Subject 1> staggers into frame from 画面左侧 and runs toward the deeper right end of the alley, rain soaking his jacket.
[Shot 11] At 00:28.200, the shot cuts to a longer backward-tracking shot, medium amplitude at medium speed, as <Subject 2>, <Subject 3> and then <Subject 4> spill out in pursuit; <Subject 2> hugs the right wall and <Subject 3> the left while <Subject 1> holds his rightward/deeper escape line, all runners moving in consistent screen direction.
[Shot 12] At 00:31.600, the shot cuts to the alley mouth where <Subject 4> steps squarely across the path, creating a front-and-back trap with the pursuers closing from behind. <Subject 1> checks for half a beat, eyes locking on <Subject 13> against the wall.
[Shot 13] At 00:33.800, the shot cuts into the second close fight, handheld at fast speed with small amplitude. <Subject 1> grabs <Subject 13> and sweeps it horizontally to force <Subject 4> back, then shoves the cart onto its side to barricade the narrow lane; <Subject 13> stays tipped on the ground. Using the block, <Subject 1> leaps for the low left wall.
[Shot 14] At 00:36.600, the shot cuts to <Subject 1> clambering over the low wall as the pursuers lunge late into the empty space below it. <Subject 2> (S1) barks between heavy breaths, <d>[Chinese] 他往桥底去了，两边包，别跟丢！</d> In a close profile that hides his mouth against the raised collar, <Subject 1> (S2) thinks as an inner-monologue voiceover, lips closed, <d>[Chinese] 苏晚……你到底卷进了什么。</d> He drops out of frame toward the viaduct.
[Shot 15] At 00:38.800, the grade melts into warm amber with film grain as the long flashback begins in <Subject 9>, matching the rooftop two-shot of <Picture 3>. Backlit by the setting sun and shown in profile so her lips are partly hidden, <Subject 5> places <Subject 11> into <Subject 1>'s palm, wind lifting her hair. An on-screen caption added in post-production reads "三天前 · 城西天台".
[Shot 16] At 00:44.200, the shot holds on the warm rooftop two-shot. Still in profile against the light, <Subject 5> (S3) says softly, <d>[Chinese] 这里面是全部账。我要是出事，只有你能送出去。</d> Facing her, <Subject 1> (S2) answers hesitantly, <d>[Chinese] 为什么是我？</d> Keeping her face turned away from a frontal lip read, <Subject 5> (S3) replies, <d>[Chinese] 因为你不穿那身皮，也不站任何一边。</d> <Subject 1> closes his fingers around <Subject 11> and nods.
[Shot 17] At 00:49.600, the warm image hard-cuts back to cold cyan present reality, rain sound bridging in a fraction before the picture; the rooftop, <Subject 5> and the warm grade disappear entirely.
[Shot 18] At 00:51.800, the shot cuts to <Subject 10>, where <Subject 1> sags against a concrete viaduct pillar, breathing hard, and opens his palm to show <Subject 11> still there; distant footsteps and a faint siren layer underneath.
[Shot 19] At 00:55.000, the shot cuts to a wider underpass view as a detached public-address voice (S6), with no visible speaker, says in an off-screen echoing voiceover, <d>[Chinese] 七号区域正在排查，无关人员立即撤离。</d> <Subject 1> glances at a faded paper notice on the pillar (its visible characters left for post, not generated as dialogue), then at the black drainage tunnel mouth, and makes his decision, crouching toward it.
[Shot 20] At 00:58.600, the shot cuts to several flashlight beams sweeping across the wet underpass wall. In this dark beat the only legitimate light is the moving flashlight beams and one thin slit of distant street lamp; no flat fill light is added. <Subject 1> holds his breath and presses into the deepest darkness of the tunnel, barely rim-lit.
[Shot 21] At 01:02.200, the shot cuts to a final static empty plate of <Subject 10>; an on-screen caption added in post-production reads "追缉 · 第七小时". The beams sweep past and withdraw, footsteps recede, only dripping water and rain remain, and the frame slowly sinks into black. Continuity lock for the whole piece: keep <Subject 1>'s face, scar and dark-grey jacket, every pursuer's build and outfit, the rightward/deeper escape direction, the camera-right <Subject 2> versus camera-left <Subject 3> relationship, the holder and presence of <Subject 11> and <Subject 12>, the cold practical-light direction of present scenes versus the warm rooftop light of the flashback, and the structure of all five locations identical across every shot; do not reveal who is behind the manhunt or the meaning of the ledger before the ending.

overall_soundscape:
Cold present scenes carry echoing concrete footsteps and faint sodium-lamp hum in the garage, hollow stairwell reverberation and sensor-light clicks, steady rain with neon-sign buzz and the metallic scrape-and-topple of the wheeled cart in the alley, and underpass drips with a distant siren and sweeping flashlight static. The flashback instead carries open rooftop wind and city air. No dialogue is repeated here.

non_diegetic_music:
A restrained low-frequency tension pulse with a slow ticking motif drives the present-time chase, thinning during the stairwell and swelling slightly in the fight beats. The two flashbacks use a sparse, warm solo-piano line with soft sustained strings, audible only to the audience, which cuts off abruptly on the return to cold reality.
```

---

## 四、独立生成单元（导演级复测版：每段 ≤15s；生成设置与模型 Prompt 分离）

### Unit 1 ｜全片 00:00.000–00:13.000（局部 0:00–13:0）车库围堵→夺刀→掷刀→插入闪回

【生成设置（中文，不复制到模型 Prompt）】
```text
生成单元： 1
全片时间线： 00:00.000–01:04.800
本段时间线： 00:00.000–00:13.000
生成时长： 13.0s
可用时长： 13.0s
重叠时长： 0.0s
连续性模式：画面引导（rgb_guide）
连续性输入： 初始车库宽景；陆铮背靠黑色轿车，右手握 U 盘；周砚在 画面右侧，阿鬼在 画面左侧 持刀，陈默堵后方出口；冷白钠灯从画面上方偏右频闪。
连续性输出： 陆铮右手仍握 U 盘，肩部撞向消防楼梯门，门缝露出冷青楼梯光；追兵落后约一拍；刀已落入远处排水沟。
状态变化： 折叠刀持有者 阿鬼→陆铮→无人；陆铮从轿车前退到楼梯门；插入一段暖色记忆但主时间线位置不变。
交接帧： 00:12.7–00:13.0，陆铮肩撞门、右手 U 盘清晰、刀不在画面、冷青门缝可见的稳定帧。
生成素材： Subject 1–6, 11–12 角色与场景参考图；Picture 1 夺刀故事板参考图；Picture 2 记忆插入故事板参考图；无需上一段视频。
声音交接： 车库脚步/钠灯嗡鸣持续；刀落地声完整；苏晚 VO 完整结束；门撞击声落在本段尾部，不截断。
镜头1衔接输入：镜头从轿车后方围堵构图开始，陆铮右手和U盘清晰可见。
镜头1衔接输出：阿鬼的持刀手臂蓄势扑刺，三名追兵仍在各自固定侧。
镜头1镜头过渡：摄影机沿车库动作轴缓慢前推，进入持刀扑刺准备。
镜头2衔接输入：从抬起的刀腕和陆铮转身开始。
镜头2衔接输出：陆铮左手触及持刀腕，尚未完成扣握。
镜头2过渡：沿动作切镜，保持同一轴线和屏幕方向。
镜头3衔接输入：从扣腕接触开始，匹配Picture 1的对角构图。
镜头3衔接输出：刀完全转到陆铮右手，周砚从画面右侧冲入。
镜头3过渡：小幅度手持跟随对角动作朝排水沟方向移动。
镜头4衔接输入：陆铮以刀背挡在自己与周砚之间。
镜头4衔接输出：刀离开画面，陆铮肩膀对准楼梯门。
镜头4过渡：摄影机向右摇移，直到楼梯门边缘填入出口侧画面。
镜头5衔接输入：从Picture 2的暖色交接插入帧开始。
镜头5衔接输出：冷色楼梯门撞击，门缝清晰可见。
镜头5过渡：从暖色记忆硬切到门缝，与下一段首帧匹配。
```

```text
subject_definitions:
<Subject 1> Lu Zheng, lean early-30s Chinese man, scar on left brow, dark-grey zip jacket, holds <Subject 11>.
<Subject 2> Zhou Yan, crew-cut lead pursuer in black tactical jacket, camera-right of the axis.
<Subject 3> A-Gui, wiry hooded pursuer initially holding <Subject 12>, camera-left.
<Subject 4> Chen Mo, stocky blocker in dark bomber, holds the rear exit in the background.
<Subject 5> Su Wan, voice-only in this unit's warm insert, lips not visible.
<Subject 6> cold-green flickering-sodium parking garage.
<Subject 11> worn dark-metal USB drive held by <Subject 1>.
<Subject 12> black folding knife, holder passes <Subject 3>→<Subject 1>, then thrown away.
<Picture 1> disarm storyboard reference panel.
<Picture 2> warm hand-off insert storyboard reference panel.

summary:
[reference generation + image reference] Unit 1 of 5, 全片 00:00.000-00:13.000 (局部 13.0s). Opens the cold garage three-point enclosure, the lunge and disarm at storyboard panel <Picture 1>, the knife discarded, and a 2s warm insert <Picture 2>; ends on <Subject 1> driving into the stairwell door. Hand-off to Unit 2: the door slams open into the cyan stairwell while he is still mid-charge, <Subject 11> in his right hand, pursuers 1 beat behind.

retention_analysis:
<Subject 1>-<Subject 4>, <Subject 6>, <Subject 11>: fully_preserved. <Subject 12>: partially_preserved (holder changes, then discarded at the end). <Picture 1>, <Picture 2>: fully_preserved frame anchors.

detailed_description:
Cold green-cyan grade, hard sodium sources; <Subject 1> flees toward 画面右侧, <Subject 2> right / <Subject 3> left of the axis.
[Shot 1] At 00:00.000, wide slow dolly into <Subject 6>: <Subject 1> backs against the black sedan gripping <Subject 11>; <Subject 2> at the right car nose, <Subject 3> at the left column flipping <Subject 12>, <Subject 4> blocking the rear. <Subject 2> (S1), <d>[Chinese] 把东西放下，你跑不出去。</d>
[Shot 2] At 00:03.200, medium-close: <Subject 3> lunges from 画面左侧 with a diagonal stab; <Subject 1> pivots off-line. <Subject 1> (S2), <d>[Chinese] 滚开！</d>
[Shot 3] At 00:05.800, tight disarm matching <Picture 1>: left hand clamps the knife wrist, right hand seizes <Subject 12> (holder passes to <Subject 1>); <Subject 2> lunges from 画面右侧.
[Shot 4] At 00:08.400, medium: <Subject 1> blocks with the knife flat, back-pedals right, throws <Subject 12> to the far gutter (no longer held), turns for the door. <Subject 2> (S1), <d>[Chinese] 别让他进楼梯！阿鬼，跟上！</d>
[Shot 5] At 00:10.800, a memory/flashback insert in warm grain matching <Picture 2>: a hand presses <Subject 11> into a palm. <Subject 5> (S3) off-screen whisper, lips unseen, <d>[Chinese] 记住，别信穿制服的。</d> Warm frame flickers out as the shoulder hits the stairwell door at 局部 00:13.000.

overall_soundscape:
Echoing concrete footsteps, faint sodium hum, a short scuffle and fabric strain, one thrown knife clatter; the brief insert is wrapped in soft warm room tone.
non_diegetic_music:
Low-frequency tension pulse with a slow tick; it thins to a single warm piano note only inside the insert and snaps back cold at the door hit.
```

### Unit 2 ｜全片 00:13.000–00:25.800（局部 0:0–12.8）消防楼梯垂直钳形→翻越→冲出内外门

【生成设置（中文，不复制到模型 Prompt）】
```text
生成单元： 2
全片时间线： 00:00.000–01:04.800
本段时间线： 00:13.000–00:25.800
生成时长： 12.8s
可用时长： 12.8s
重叠时长： 0.0s
连续性模式：运动上下文（motion_context）
连续性输入： 复现第1段尾帧：陆铮肩撞开消防楼梯门，右手 U 盘，冷青门缝和门框位置不变。
连续性输出： 陆铮穿过顶层防火门，脚已落到雨巷入口，身体仍向 画面右侧及纵深；门在身后打开，追兵尚未完全出门。
状态变化： 场景由停车场转为消防楼梯；陆铮从门口上行至顶层；陈默由后方改为上层反向包抄；U 盘持有者不变。
交接帧： 00:25.4–00:25.8，陆铮在外门阈值、雨光打在右肩、楼梯门框仍占画面左侧的清晰帧。
生成素材： Subject 1–4, 7, 11 角色与场景参考图; 第1段交接帧; 第1段尾部视频 仅在平台支持时作为运动参考.
声音交接： 门撞击、金属扶手摩擦和陈默喊声完整；脚步由楼梯混响自然转为雨巷湿地脚步；雨声在门开时提前进入。
镜头6衔接输入：从上一段继承的冷色楼梯门撞击和门槛开始。
镜头6衔接输出：陆铮上到一层楼，U盘仍在右手，身后感应灯依次亮起。
镜头6过渡：摄影机中速上仰，保持机位侧和垂直轴线。
镜头7衔接输入：周砚在画面右侧、阿鬼在画面左侧进入下层平台。
镜头7衔接输出：陈默转入相反楼梯，形成上方夹击。
镜头7过渡：向上跟拍，不反转屏幕方向。
镜头8衔接输入：二层转角处，陈默下行进入陆铮路线。
镜头8衔接输出：翻越并下落后，陆铮双脚落在下层平台，抓握解除。
镜头8过渡：翻越前插入中性俯拍，桥接越轴。
镜头9衔接输入：从下层平台落地继续上行逃跑。
镜头9衔接输出：陆铮穿过顶层防火门，门外雨蓝环境清晰可见。
镜头9过渡：摄影机跟随穿门，显露下一段雨巷光线。
```

```text
subject_definitions:
<Subject 1> Lu Zheng (same face/scar/dark-grey jacket), still holding <Subject 11>.
<Subject 2> Zhou Yan (camera-right).
<Subject 3> A-Gui (camera-left).
<Subject 4> Chen Mo (loops above to block).
<Subject 7> cold cyan concrete fire-escape stairwell, section sensor lamps, metal handrail.
<Subject 11> worn USB drive kept in <Subject 1>'s right hand.

summary:
[reference generation] Unit 2 of 5, 全片 00:13.000-00:25.800 (局部 12.8s). Picks up exactly as Unit 1 ends: the door slams open into <Subject 7>, a vertical pincer forms, a neutral overhead bridges the axis during the grapple, and <Subject 1> vaults the rail and breaks the top fire door. Hand-off to Unit 3: he staggers from interior into cold-blue rainy alley at the same rightward/deeper line.

retention_analysis:
<Subject 1>-<Subject 4>, <Subject 7>, <Subject 11>: fully_preserved; costumes, builds and the right/left chase relationship are unchanged from Unit 1.

detailed_description:
Same cold cyan grade; escape direction stays toward 画面右侧 / upward-and-deeper; axis crossing during the grapple uses a neutral overhead.
[Shot 6] At 00:00.000, [Shot opens on 局部 00:00.000 = 全片 00:13.000] The door slams into <Subject 7>; camera tilts up at medium speed following <Subject 1> sprinting upstairs, sensor lamps lighting and dying section by section, <Subject 11> in his right fist.
[Shot 7] At 00:02.600, lower landing: <Subject 2> and <Subject 3> rush in from the bottom on their fixed right/left sides while <Subject 4> peels to the opposite stair to loop above. <Subject 3> (S4), <d>[Chinese] 他往上跑了！</d>
[Shot 8] At 00:05.800, second-floor turn: <Subject 1> collides with descending <Subject 4> and they grapple; a neutral overhead bridges the axis; <Subject 1> vaults the handrail, drops through to the next landing, breaks the grip and keeps climbing. <Subject 4> (S5), <d>[Chinese] 拦住他——！</d>
[Shot 9] At 00:09.400, <Subject 1> slams the top fire door, light flaring interior-to-exterior, camera pushes through behind him at fast speed; he reaches the rainy threshold by 局部 00:12.800.

overall_soundscape:
Hollow stairwell reverb, footsteps on concrete and metal, sensor-lamp clicks, a brief grapple thud and the fire-door crash.
non_diegetic_music:
Tension pulse continues, tightening with a rising riser through the vault and releasing at the door flare.
```

### Unit 3 ｜全片 00:25.800–00:38.800（局部 0:0–13.0）雨夜追逐→巷口夹击→二次打斗→翻墙

【生成设置（中文，不复制到模型 Prompt）】
```text
生成单元： 3
全片时间线： 00:00.000–01:04.800
本段时间线： 00:25.800–00:38.800
生成时长： 13.0s
可用时长： 12.3s
重叠时长： 0.7s
连续性模式：运动上下文 + 画面引导（motion_context + rgb_guide）
连续性输入： 复现第2段尾帧：陆铮从消防门冲入冷蓝雨巷，右手 U 盘，身体向 画面右侧及纵深；门框在画面左后方。
连续性输出： 铁艺推车已倒地横挡巷道；陆铮翻过左侧矮墙并落到墙后，追兵在墙前刹停；雨夜冷蓝光和运动方向保持。
状态变化： 由门口奔跑变为雨巷追逐；陈默从追兵队列变为巷口阻挡者；推车由靠墙直立→横扫→倒地；陆铮越过矮墙。
交接帧： 00:38.3–00:38.8，陆铮落地后背部/右肩仍可见，墙顶和倒地推车清晰，追兵被墙隔开。
生成素材： Subject 1–4, 8, 11, 13 角色与场景参考图; 第2段尾帧图和尾部视频; 重复0.7秒翻墙动作，后期剪掉重复部分.
声音交接： 雨声、霓虹电流声和奔跑呼吸连续；推车刮擦/撞击完整；周砚喊声完整；陆铮 OS 结束后再进入暖色记忆声音桥。
镜头10衔接输入：从防火门门槛开始，先保留一个可辨识停顿。
镜头10衔接输出：陆铮建立向画面右侧及纵深逃跑的路线。
镜头10过渡：门槛停顿后开始后退跟拍，保持外景轴线。
镜头11衔接输入：三名追兵从陆铮身后冲出。
镜头11衔接输出：周砚贴右墙，阿鬼贴左墙。
镜头11过渡：后退跟拍并保持固定左右追逐轴线。
镜头12衔接输入：陈默正面横挡巷口。
镜头12衔接输出：陆铮视线落到墙边直立推车。
镜头12过渡：焦点从陈默移到推车，明确可执行的逃生目标。
镜头13衔接输入：推车直立并处于陆铮可触及范围。
镜头13衔接输出：推车侧翻横挡巷道，陆铮开始翻墙。
镜头13过渡：小幅度快速手持跟随横向推撞，推车保持倒地。
镜头14衔接输入：从翻墙起跳开始。
镜头14衔接输出：陆铮落到墙后，追兵停在近侧。
镜头14过渡：在本段交接处重复0.7秒翻墙动作，后期剪掉重复部分。
```

```text
subject_definitions:
<Subject 1> Lu Zheng (now rain-soaked same outfit), holding <Subject 11>.
<Subject 2> Zhou Yan right wall.
<Subject 3> A-Gui left wall.
<Subject 4> Chen Mo blocks the alley mouth.
<Subject 8> cold-blue rainy back alley, neon on wet ground, low left wall.
<Subject 13> rusty iron wheeled cart, swept then tipped as a barrier.
<Subject 11> USB drive kept by <Subject 1>.

summary:
[reference generation] Unit 3 of 5, 全片 00:25.800-00:38.800 (局部 13.0s). Continues Unit 2's exterior threshold into the rainy alley: backward-track pursuit, a front-back trap at the mouth, a second close fight using <Subject 13> as a swept then toppled barrier, and a wall escape with an inner-monologue line. Hand-off to Unit 4: as <Subject 1> drops beyond the wall, the image melts into the warm rooftop flashback.

retention_analysis:
<Subject 1>-<Subject 4>, <Subject 8>, <Subject 11>: fully_preserved; <Subject 13>: partially_preserved (swept then tipped and left down). Right/left chase axis unchanged across Units 1-3.

detailed_description:
Cold-blue rainy grade, neon practical reflection; <Subject 1> keeps running right/deeper, <Subject 2> right, <Subject 3> left.
[Shot 10] At 00:00.000, [局部 00:00.000 = 全片 00:25.800] Short atmospheric plate of <Subject 8>, then <Subject 1> staggers in from 画面左侧 into the rain toward the deeper right end.
[Shot 11] At 00:02.400, backward-tracking medium shot: the three pursuers spill out, <Subject 2> hugging the right wall, <Subject 3> the left, all moving in consistent screen direction.
[Shot 12] At 00:05.800, alley mouth: <Subject 4> steps across the path to form a front-back trap; <Subject 1> checks half a beat and eyes <Subject 13>.
[Shot 13] At 00:08.000, handheld fast close fight: he sweeps <Subject 13> horizontally to force <Subject 4> back, shoves it onto its side as a barrier (it stays down), and leaps for the low left wall.
[Shot 14] At 00:10.800, he clambers over the wall as pursuers lunge late into empty space. <Subject 2> (S1), <d>[Chinese] 他往桥底去了，两边包，别跟丢！</d> In profile against his raised collar, <Subject 1> (S2) inner-monologue voiceover, lips closed, <d>[Chinese] 苏晚……你到底卷进了什么。</d> He drops beyond the wall by 局部 00:13.000.

overall_soundscape:
Steady rain and neon buzz, splashing footsteps in puddles, the cart's metallic scrape and clang as it tips, heavy pursuit breathing.
non_diegetic_music:
Tension pulse drives the chase and spikes in the brief fight, then dims to make room for the inward line before the warm transition.
```

### Unit 4 ｜全片 00:38.800–00:51.800（局部 0:0–13.0）暖金天台长闪回（独立回忆场次）→硬切回冷现实

【生成设置（中文，不复制到模型 Prompt）】
```text
生成单元： 4
全片时间线： 00:00.000–01:04.800
本段时间线： 00:38.800–00:51.800
生成时长： 13.0s
可用时长： 13.0s
重叠时长： 0.0s
连续性模式：画面引导（rgb_guide）
连续性输入： 明确进入记忆/闪回（memory/flashback）；不复现上一段雨巷几何。以暖金天台 Picture 3 作为独立回忆首帧，字幕“ 三天前 · 城西天台 ”后期叠加。
连续性输出： 回忆结束时陆铮手指收紧握住 U 盘、苏晚仍为逆光侧脸；在 局部 00:13.0 硬切回冷青现实，雨声先于画面进入第5段。
状态变化： 时态由现在切到三天前；色调由冷蓝变暖金并带胶片颗粒；U 盘持有者苏晚→陆铮；不把回忆时间码当作主时间线时间。
交接帧： 局部 00:12.5–00:13.0，陆铮握紧 U 盘的稳定暖色帧；回切点独立标记，不把暖帧作为 第5段首帧。
生成素材：Subject 1、5、9、11 角色与场景参考图；Picture 3 天台故事板参考图；无需上一段视频；可选第3段尾部视频，仅用于剪辑时序，不用于画面条件。
声音交接： 天台风和对白完整；雨声在最后 0.3s 做声音桥；配乐在硬切点停止，不截断对白。
镜头15衔接输入：从Picture 3的天台交接构图开始。
镜头15衔接输出：U盘进入陆铮张开的手掌，两人侧脸清晰。
镜头15过渡：暖色逆光中轻微停留后进入双人对白。
镜头16衔接输入：同一侧脸逆光双人构图，U盘在陆铮掌中。
镜头16衔接输出：陆铮手指收紧握住U盘并保持点头。
镜头16过渡：保持两人侧脸逆光，降低口型漂移。
镜头17衔接输入：从保持的点头和天台风声开始。
镜头17衔接输出：本段局部00:13.0结束，紧接冷色现实切回。
镜头17过渡：0.3秒雨声桥后硬切下一段，不做画面溶解。
```

```text
subject_definitions:
<Subject 1> Lu Zheng as he was three days earlier, same face/scar, dry version of the dark-grey jacket.
<Subject 5> Su Wan in a beige trench coat, shown profile/backlit to avoid frontal lip-sync.
<Subject 9> warm golden-hour rooftop with film grain; also the flashback style anchor (warm, soft, contrasting the cold present).
<Subject 11> USB drive handed from <Subject 5> to <Subject 1> in this memory.
<Picture 3> golden rooftop two-shot storyboard reference panel.

summary:
[reference generation + image reference] Unit 4 of 5, 全片 00:38.800-00:51.800 (局部 13.0s). A self-contained long flashback matching storyboard panel <Picture 3>, warm grade throughout, in which <Subject 5> hands <Subject 11> to <Subject 1> with two dialogue exchanges; it hard-cuts back to cold cyan at the end. Hand-off to Unit 5: rain sound bridges in just before the picture, returning to <Subject 1> under the viaduct with <Subject 11> back in his own hand.

retention_analysis:
<Subject 1>, <Subject 5>, <Subject 9>, <Subject 11>: fully_preserved inside the memory; <Picture 3>: fully_preserved. Warm grade must not leak into adjacent cold units. <Subject 5> is the same person as the insert voice in Unit 1 and keeps speaker ID (S3).

detailed_description:
Warm amber grade, gentle film grain, rooftop wind; this whole unit is a memory and visually differs from the cold present timeline.
[Shot 15] At 00:00.000, [局部 00:00.000 = 全片 00:38.800] Matching <Picture 3>, backlit profile <Subject 5> places <Subject 11> into <Subject 1>'s palm, wind in her hair; post caption "三天前 · 城西天台".
[Shot 16] At 00:05.400, hold the warm two-shot: profile <Subject 5> (S3), <d>[Chinese] 这里面是全部账。我要是出事，只有你能送出去。</d> <Subject 1> (S2), <d>[Chinese] 为什么是我？</d> Face turned from a frontal read, <Subject 5> (S3), <d>[Chinese] 因为你不穿那身皮，也不站任何一边。</d> He closes his fingers on <Subject 11> and nods.
[Shot 17] At 00:10.800, hold the nod and wind for a beat, then at 局部 00:13.000 hard-cut to cold cyan as rain sound bridges in first; the rooftop and warm grade vanish.

overall_soundscape:
Open rooftop wind and distant city air, soft clothing movement; no rain until the final bridge where present rain fades in.
non_diegetic_music:
Sparse warm solo piano with sustained soft strings for the whole memory, cut abruptly on the hard cut back to reality.
```

### Unit 5 ｜全片 00:51.800–01:04.800（局部 0:0–13.0）桥底暗场躲避→广播VO→手电搜索→沉入黑暗

【生成设置（中文，不复制到模型 Prompt）】
```text
生成单元： 5
全片时间线： 00:00.000–01:04.800
本段时间线： 00:51.800–01:04.800
生成时长： 13.0s
可用时长： 13.0s
重叠时长： 0.0s
连续性模式：画面引导（rgb_guide）
连续性输入： 复现第4段硬切后的冷青桥底，不复现暖色天台画面；陆铮靠水泥桥柱喘息，右手 U 盘，唯一固定光源为远处路灯缝和移动手电。
连续性输出： 陆铮完全隐入排水通道深处；手电光柱离开，脚步远去，仅滴水/雨声持续；最后稳定空镜沉入黑场。
状态变化： 场景由天台记忆回到高架桥底；陆铮由墙后落地状态变为桥柱后躲藏；广播 VO 和寻人启事信息出现；U 盘持有者不变。
交接帧： 本段无下一单元；使用 局部 00:10.4–00:13.0 的静态空镜作为结尾，不用运动模糊帧。
生成素材： Subject 1, 10, 11 角色与场景参考图; 第4段声音桥时序; 追兵不需参考图，因为始终不出镜.
声音交接： 雨声和滴水贯穿；广播 VO 完整；手电扫过时保留脚步和布料摩擦；末尾不切断环境底噪。
镜头18衔接输入：冷色切回，陆铮靠在高架桥柱上。
镜头18衔接输出：陆铮打开右手露出U盘，视线转向通道。
镜头18过渡：先保留一个可辨识的喘息停顿，再拉开景别。
镜头19衔接输入：同一冷光下承接U盘展示和桥柱启事。
镜头19衔接输出：陆铮蹲下并朝向通道入口。
镜头19过渡：沿启事视线向右摇至通道口，同时保留广播回响。
镜头20衔接输入：第一束手电光扫过湿墙。
镜头20衔接输出：陆铮完全贴入最深阴影，仅保留轮廓光。
镜头20过渡：曝光跟随移动手电，不加入均匀补光。
镜头21衔接输入：手电光束从墙面撤离。
镜头21衔接输出：静止高架桥底空镜并完全黑场。
镜头21过渡：保持空镜，脚步远去后缓慢沉入黑场，无下一镜依赖。
```

```text
subject_definitions:
<Subject 1> Lu Zheng, rain-soaked again, holding <Subject 11>.
<Subject 10> cold dark viaduct underpass, wet walls, faded pillar notice, black drainage tunnel, one slit of distant street light.
<Subject 11> USB drive confirmed still in <Subject 1>'s hand.
Pursuers are heard off-screen but not framed; no new subjects are introduced.

summary:
[reference generation] Unit 5 of 5, 全片 00:51.800-01:04.800 (局部 13.0s), the finale. Resumes on the cold cut-back from Unit 4: <Subject 1> hides in <Subject 10>, an unseen PA voice echoes, flashlight search sweeps a legitimately dark space, and an empty final plate with a post caption sinks to black. No follow-up unit; this resolves the sequence.

retention_analysis:
<Subject 1>, <Subject 10>, <Subject 11>: fully_preserved, matching the cold present look of Units 1-3; <Subject 11> holder remains <Subject 1>. Do not reveal the manhunt's mastermind or the ledger's meaning.

detailed_description:
Cold cyan near-dark; the only legitimate light is moving flashlight beams and one distant street-lamp slit, with no flat fill.
[Shot 18] At 00:00.000, [局部 00:00.000 = 全片 00:51.800] <Subject 1> sags against a viaduct pillar, breathing hard, opens his palm to show <Subject 11>; distant footsteps and a faint siren underlay.
[Shot 19] At 00:03.200, wider underpass: an unseen public-address voice (S6) says in an off-screen echoing voiceover with no speaker on screen, <d>[Chinese] 七号区域正在排查，无关人员立即撤离。</d> He glances at the faded pillar notice (visible characters handled in post), then the black tunnel mouth, and crouches toward it.
[Shot 20] At 00:06.800, flashlight beams sweep the wet wall; <Subject 1> holds his breath and presses into the tunnel's deepest dark, only rim-lit by the moving beams.
[Shot 21] At 00:10.400, static empty plate of <Subject 10>, post caption "追缉 · 第七小时"; beams withdraw, footsteps recede, only drips and rain remain, and the frame slowly sinks to black by 局部 00:13.000.

overall_soundscape:
Underpass drips, distant siren, echoing PA reverberation, sweeping flashlight static and receding footsteps; rain bed continues to the end.
non_diegetic_music:
The tension pulse thins to a single low drone and then fades out completely as the image turns black.
```

---

## 五、压测结果（文字验收报告）

本次压力测试使用约 64.8 秒、21 镜、5 个场景、5 个生成单元的动作追逐剧本。验收以当前 Skill 的交付边界为准，结果如下。

六字段结构通过。5 个生成单元均按 `subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music` 顺序输出，连续性字段只出现在代码块前的生成设置中，没有混入 H3 Prompt。

分段约束通过。5 个单元分别为 13.0、12.8、13.0、13.0、13.0 秒，均不超过 15 秒；词量按单元控制，不再把整片长 Prompt 当作一次生成输入。

动作链和状态交接通过。夺刀、掷刀、翻越、推车倒地、门内到门外等关键动作都写明起点、终点、运动方向、道具持有者和稳定尾帧；Unit 3 使用 0.7 秒重叠并注明后期裁剪。

镜头语言通过。每个 Unit 的生成设置记录了首尾状态、摄影机侧、景别变化、构图/透视、主光方向和 `shot_handoff_in/out/transition`；消防楼梯的越轴使用中性俯拍桥接，追逐维持陆铮向 画面右侧及纵深 的主方向。

闪回规则通过。插入式短闪回和独立长闪回均显式标记 `memory/flashback`，局部时间码与全片时间码分开，暖色/胶片颗粒只在回忆中出现，雨声在回切前作为声音桥进入；回忆时间没有覆盖主时间线。

参考资产通过。角色、场景、U 盘、折叠刀和推车均有固定标签；后续单元重复引用相同资产，并将上一单元尾帧图作为状态锚点、尾部视频作为可选运动参考，未用视频替代尾帧图。

声音与文字通过。对白逐字保留在 `<d>[Chinese]... </d>` 中，OS/VO 标明嘴唇不可见或无出场说话人；广播、字幕和寻人启事均按后期文字处理；环境声、动作声和配乐在段间有明确交接。

任务前缀和编号空间已修正。故事板参考图统一使用 `[reference generation + image reference]`；`<Subject N>` 与 `S1/S2` 独立编号，苏晚在插入闪回和长闪回中稳定复用 `S3`。

结论：当前 Skill 通过本次暴力测试。保留的运行风险是不同平台对视频续写、首尾帧和参考强度的支持不同，实际生成时仍需按平台能力把 `continuity_mode` 降级为最接近的首帧或视频续写选项；这不改变 Prompt 结构和状态台账。
