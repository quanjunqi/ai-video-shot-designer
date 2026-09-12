# 导演级镜头衔接规范

本规范用于连续动作、追逐、对话和时空转换的镜头规划。它补充段级 `continuity_in/out`，不改变 MiniMax H3 六字段结构；镜头衔接元数据写在 Prompt 代码块之前，具体过渡动作写入 `detailed_description` 的自然语言段落。

## 1. 景别递进

景别按以下顺序管理：

```text
大远景 → 远景 → 全景 → 中全景 → 中景 → 中近景 → 近景 → 特写 → 大特写
```

- 相邻镜头默认最多跨越两个层级。
- 跨越超过两个层级时，加入交代空间、人物反应、道具特写或运动过渡的桥梁镜头。
- 漫画式跳切只有在冲击、惊吓、喜剧节奏或主观感受有明确动机时才允许，并在镜头衔接说明中注明动机。
- 景别变化不能同时无理由改变摄影机侧、视线方向和主光方向。

## 2. 视线、轴线和构图

每个镜头内部记录以下状态：

```text
subject_screen_side: 人物处于画面左/右或前/中/后景
eyeline_direction: 人物视线方向
look_at_target: 被注视对象及其空间位置
camera_side_of_axis: 摄影机位于主动作轴线哪一侧
perspective: 透视角度和前后层次
```

- 同一观察方向下，人物、目标和屏幕方向保持一致。
- 正反打可以使用相反视线，但必须仍在同一轴线两侧。
- 越轴前使用正面中性镜头、环绕镜头或跟随运动完成空间交代。
- 最终投喂模型时使用 `camera left/right`、`foreground/background` 等自然语言，不直接使用内部坐标缩写。

## 3. 镜头级交接

每个镜头维护三项交接信息：

```text
shot_handoff_in: 构图、位置、视线、透视、光线和动作起点
shot_handoff_out: 构图、位置、视线、透视、光线和动作终点
shot_transition: 摄影机运动、承接方向和下一镜进入方式
```

`shot_transition` 必须是可执行的镜头动作，例如：

```text
The camera pans slowly to camera right, following the character's eyeline until the stairwell frame enters from the right edge, matching the next shot's doorway composition.
```

不得只写“自然过渡”或“保持连贯”。每次移动、交手、跌倒、起身、转身和道具交接后，都要更新交接状态。

## 4. 资产基准

主要角色至少生成一套可复用资料卡：正面全身、左/右 45 度半身、面部特写、服装与配饰细节；动作主角可增加常用姿态参考。主要场景至少生成标准空镜、主视角空镜和关键光线方向参考。连续性关键道具生成外观、持握和变化状态参考。

- 同一资产固定一个标签和一套描述，所有分段显式重复引用。
- 主角色和关键场景使用完整资料卡；群众、临时角色和不影响连续性的道具可使用精简参考。
- 场景空镜用于锁定空间锚点，不代替当前段首帧。
- 尾帧图用于锁定当前状态，尾部视频或 latent context 用于传递运动趋势。

## 5. 动作与声音交接

动作使用“上一镜终点 → 下一镜起点 → 运动方向 → 速度 → 道具状态 → 新落点”的链条。高速动作可让下一段重复 `0.3—1.0s` 的承接动作，生成后裁掉重复内容。

声音单独记录 `audio_handoff`：对白完整性、呼吸、脚步落点、冲击声、环境底噪和配乐位置。对白或爆发音不能在切点截断；连续环境声和配乐应跨段保持，必要时使用声音桥或短交叉淡化。

## 6. 分段输出映射

以下字段写在每个 H3 代码块之前，不写入六字段内部：

```text
shot_handoff_in
shot_handoff_out
shot_transition
continuity_mode
state_diff
audio_handoff
```

`detailed_description` 中的第一镜复现 `shot_handoff_in`，最后一镜落到 `shot_handoff_out`；过渡动作以自然英文句子出现。生成前检查景别跨级、视线/轴线、构图/透视/光线、资产标签、动作方向和音频边界。
