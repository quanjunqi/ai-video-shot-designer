# AI Video Shot Designer

把中文或英文剧本转换为**可直接复制投喂 MiniMax H3「全能参考 / reference generation」模式**的分段视频 Prompt 的 Agent Skill：自动完成导演级镜头规划、角色/场景/道具与故事板参考图规划，并把长内容拆成不超过 15 秒、带跨段一致性交接的独立生成单元。

- **适用**：使用 MiniMax H3 全能参考模式、需要把较长剧本分段生成并保持人物/场景/道具/动作连续的场景。
- **不适用**：其他视频模型；本 Skill 的六字段、标签与时长规则均针对 H3，不向其他模型迁移。

## 它解决什么问题

视频模型单次生成有时长上限，长内容必须分段，而分段会带来人物脸/服装、道具持有者、画面左右、运动方向、光线的逐段漂移。本 Skill 用一条固定优先级链控制一致性：

> **首帧/尾帧状态 ＞ 角色场景参考图 ＞ 连续性台账文字 ＞ 风格形容词**

并明确区分四类参考：实际尾帧图锁状态、资产图锁身份、故事板图只定计划构图、上段视频只传运动趋势（故事板不得冒充实际尾帧）。

## 目录结构

```text
ai-video-shot-designer/
├── SKILL.md                     # Skill 主入口：13 步工作流 + 不可违背约束 + 输出规范
├── agents/openai.yaml           # 接口展示元数据
├── references/                  # 按需加载的专题规范（渐进披露）
│   ├── platform-spec.md         # 平台硬约束/默认值的单一事实源（改参数只改这里）
│   ├── script-parsing-schema.md # 剧本解析的标准中间表示
│   ├── output-schema.md         # H3 六字段输出规范与双区交付
│   ├── director-continuity.md   # 景别递进、轴线、镜头级交接
│   ├── continuity-workflow.md   # 分段一致性工作流与失败诊断
│   ├── asset-generation-rules.md# 角色/场景/道具/风格资产图规则
│   ├── storyboard-generation-rules.md # 故事板参考图规则
│   ├── reference-selection-rules.md   # 每镜参考图自动选择决策树
│   ├── position-map-schema.md   # 纯文字站位地图
│   ├── segment-state-schema.md  # 分段状态交接字段与精简操作卡
│   ├── terminology-map.md       # 英中字段 ↔ 是否进六字段 权威对照
│   ├── batch-ledger-schema.md   # 跨批次台账、回传清单与素材命名
│   ├── pre-delivery-checklist.md# 交付前机械+语义两层自检
│   └── worked-example.md        # 端到端黄金样例
├── scripts/
│   └── validate_h3_prompt.py    # H3 分段 Prompt 零依赖机械校验器
└── tests/                       # 人工压力测试用例
```

## 工作流概览

1. **解析剧本**：按 `references/script-parsing-schema.md` 抽取场次、角色、道具、动作、台词、闪回、画幅、声音。
2. **内部规划**：建立站位地图与导演级镜头规划（景别/轴线/运镜/动作链），内部坐标不直接投喂。
3. **资产生成**：按需规划角色资料卡、场景空镜、道具状态图与故事板参考图，并分配稳定标签。
4. **分段**：按 `platform-spec.md` 切成 ≤15 秒单元，维护每段 continuity in/out 与稳定尾帧，默认每批交付 1—3 个单元。
5. **双区交付**：块前给全中文“生成设置（不复制）”，块内给“六字段模型 Prompt（可直接复制）”，交付前过 `pre-delivery-checklist.md`。

## 快速开始

### 作为 Skill 使用

把本目录放入 Skill 目录后，直接提供剧本即可；Skill 会先交付当前批次需要的资产/故事板 Prompt，再交付分段 H3 Prompt。完整成品形态见 `references/worked-example.md`。

### 校验已写好的分段 Prompt

```bash
# 校验文件
python3 scripts/validate_h3_prompt.py draft.md
# 粘贴内容走标准输入
python3 scripts/validate_h3_prompt.py -
# 机器可读结果
python3 scripts/validate_h3_prompt.py --json draft.md
```

校验器要求六字段齐全且有序、官方标签先定义后使用、时间码单调且不超 15 秒、台词为 `<d>[Language]…</d>`、块内不混入内部字段等；存在 ERROR 时以非零码退出。它只做格式机械校验，语义一致性仍需按 `references/pre-delivery-checklist.md` 人工确认。

## 平台版本与时效

六字段、标签、15 秒上限、建议词量等以 `references/platform-spec.md` 为**单一事实源**，其中区分【平台】硬约束与【默认】经验值，并留有“官方文档核对日期”。平台升级时只改该文件并对照其 §13 清单复核。

## 版本

版本号遵循语义化版本（SemVer），变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## License

[MIT](LICENSE)
