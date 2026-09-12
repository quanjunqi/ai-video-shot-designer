# 纯文字站位地图规范

站位地图是剧本解析和分段衔接的规划附件，不替代 MiniMax H3 六字段，也不作为模型 Prompt 的自定义字段。只有用户明确要求站位地图、机位图或空间预演时才输出。

## 输出结构

```text
scene_map:
Scene: <场景名称>
Time / interior-exterior: <时间与内外>
Fixed anchors:
- <anchor>: <位置、功能、可见特征>
Camera side and primary axis:
- Camera side: <摄影机位于轴线哪一侧>
- Primary axis: <人物/动作从哪里到哪里>
- Allowed transition: <允许的中性过渡或越轴方式>

Initial state:
- <Character / prop>: <相对锚点的位置>
- Facing: <朝向>
- Layer: <foreground / middle ground / background>
- Distance / relation: <与谁近、远、遮挡或高低>
- Held object: <持有物及手>

Beat states:
- Beat <N> / [Shot <N>] / <time>: <动作发生后的站位和朝向变化>

Unit handoff:
- Unit <N> tail frame: <人物位置、姿态、朝向、道具、摄影机侧、主光方向>
- Unit <N+1> first frame: <必须与上一尾帧一致的状态>
- Continuity locks: <服装、伤势、道具、背景锚点、运动方向、声音>

Camera coverage:
- [Shot <N>]: <景别、机位、摄影机侧、运动方向>
- Axis rule: <是否保持同侧，如何过渡>
```

## 规划规则

- 先写固定锚点，再写人物；每个位置必须相对于锚点或另一主体描述。
- 每个动作 beat 更新位置、朝向、层次、距离和道具持有者；不能只复述动作名称。
- 摄影机侧是相对主动作轴线定义的，不是简单的画面左/右；最终投喂 Prompt 时再转为 `camera left/right` 或 `foreground/background`。
- 首帧和尾帧必须是可截取、可复现的稳定姿态；高速动作应在落点或动作停顿处建立交接。
- 时空转换、闪回或明确越轴时，重建新的 scene_map，不把两个空间强行放在同一张地图中。
- 多人打斗至少标记：攻击者、被攻击者、第三方阻挡者、摄影机侧和可通行出口。
