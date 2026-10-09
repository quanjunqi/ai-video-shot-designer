// 环节提示词规则库（可管理）：mdp:prompt-rules 持久化
// 定位：规则中心「定义」（平台默认每环节只读 + 用户模板 CRUD），项目按环节「选择生效」
// 平台固定输出字段与画布结构，用户只覆盖/补充提示词内容；未启用模板不影响已引用项目（回退平台默认）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PromptRuleTemplate } from '@/types';
import { api } from '@/lib/api/client';

const now = Date.now();

const BUILTIN_PROMPT_RULES: PromptRuleTemplate[] = [
  {
    version: 1,
    id: 'pr-rule-interpretation',
    stage: 'interpretation',
    name: '导演解读 · 平台默认',
    desc: '事实提取与两层覆盖口径',
    content:
      'EV/DLG/LOCK 事实提取：场景事件第一现场、故事时间线、对白核心冲突、连续性锁定项（场景/道具状态锁定）。输出：视觉基调与情绪弧线（影调、情绪弧线、节奏曲线）、场次清单（场次号/行号跨度/预估时长）、剧本覆盖与初步单元（创作层节拍分段 + 平台层容量映射两层）。',
    builtin: true,
    enabled: true,
    createdAt: now - 6000,
    updatedAt: now - 6000,
  },
  {
    version: 1,
    id: 'pr-rule-character',
    stage: 'character',
    name: '角色与表演 · 平台默认',
    desc: '身份/外观/结构，表演基调每角色一条',
    content:
      '角色资产只解决身份、外观、结构与形态：面部特征、体型、发型、服装配色与标志物；不表达情绪瞬间（由表演基调承担）。表演基调由导演解读派生，每角色一条：情绪基准、状态变化、语气与肢体习惯。资产图不得替代镜头调度与连续性状态。',
    builtin: true,
    enabled: true,
    createdAt: now - 5000,
    updatedAt: now - 5000,
  },
  {
    version: 1,
    id: 'pr-rule-scene',
    stage: 'scene',
    name: '场景 · 平台默认',
    desc: '空间结构与形态，动作轴线与锚点',
    content:
      '场景资产只解决空间结构与形态：场地类型、固定锚点、对象位置/朝向/状态、动作轴线与摄影机侧、遮挡与可通行路线。多人或动态高风险场景登记动作轴线与路线；时间/天气/光线变化由场次状态变体承担，不在场景资产中表达。',
    builtin: true,
    enabled: true,
    createdAt: now - 4000,
    updatedAt: now - 4000,
  },
  {
    version: 1,
    id: 'pr-rule-prop',
    stage: 'prop',
    name: '道具 · 平台默认',
    desc: '形态与持有关系，关键道具进连续性台账',
    content:
      '道具资产只解决形态与持有关系：大小、材质、颜色、可辨尺度。关键道具登记状态（易手、位置变化）进入连续性台账；小道具与手部接触保持可辨尺度直到视频结束；不追加破坏关键状态可读性的远景验证镜头。',
    builtin: true,
    enabled: true,
    createdAt: now - 3000,
    updatedAt: now - 3000,
  },
  {
    version: 1,
    id: 'pr-rule-directing',
    stage: 'directing',
    name: '分镜设计 · 平台默认',
    desc: '文戏/动态判断 + 镜头卡要素 + 节奏表',
    content:
      '镜头设计先判断文戏/动态/混合：主视觉任务、连续动作链、摄影机起始/跟随/触发变化/结束动势、切镜必要性、下一镜动势继承。节奏表控制剪辑点与情绪曲线；镜头卡覆盖剧本全部场次与节拍，不得遗漏关键动作与台词。',
    builtin: true,
    enabled: true,
    createdAt: now - 2000,
    updatedAt: now - 2000,
  },
  {
    version: 1,
    id: 'pr-rule-unit-prompt',
    stage: 'unit_prompt',
    name: '视频提示词 · 平台默认',
    desc: '六字段结构固定，只覆盖内容',
    content:
      '输出字段与画布结构由平台固定：subject_definitions / summary / retention_analysis / detailed_description / overall_soundscape / non_diegetic_music 六字段。详细描述按播放顺序落实镜头卡，不得补写未经授权的剧情事实；单元切点必须是可恢复状态，不截断关键接触、道具易手或一句台词。',
    builtin: true,
    enabled: true,
    createdAt: now - 1000,
    updatedAt: now - 1000,
  },
  {
    version: 1,
    id: 'pr-rule-minimax-h3',
    stage: 'unit_prompt',
    name: 'MiniMax H3 · 六字段契约',
    desc: 'prompt_contract=minimax-h3-direct-v1，英文六字段，适配直接模型与 AutoDL API',
    content:
`【投递路由】
- Direct：用户直接把素材和 Prompt 交给 MiniMax H3 模型界面，六字段中使用 <Subject N> 标签指代素材，禁止出现 ref_image_N、工作流 ID、API 分辨率枚举
- AutoDL API：使用 minimax_h3_zm_u24，数组第一个图片映射 ref_image_0，音频从 ref_audio_0 开始，映射必须与 input_bindings 完全一致

【六字段结构（顺序固定）】
1. subject_definitions：只定义本单元实际使用的 <Subject N>/<Picture N>/<Video N>/<Audio N>，canonical 资产按真实用途绑定，导演总版/故事板/俯视规划图不得定义为标签
2. summary：以适配任务前缀开头，写明全片时间范围、本单元范围、叙事任务与相邻单元关系
3. retention_analysis：逐项列出引用标签出现在哪些镜头及其保留关系（fully_preserved/partially_preserved/attribute_transfer/weak_reference）
4. detailed_description：英文，按播放顺序每张 shot card 转译为独立 [Shot N] 段落
5. overall_soundscape：1-4 句英文概括环境声、物理动作声和非语言人声，无环境声写 N/A
6. non_diegetic_music：1-3 句英文描述配乐，无配乐写 N/A

【detailed_description 每镜必须包含（按优先级分配字符）】
1. 本镜主任务与结果：必须让观众看清什么，镜尾达到什么可见状态
2. 动作因果与时间：动作主体、手别、接触顺序、道具状态变化、接收关系和真实完成时间
3. 连续性与空间：人物位置、方向、轴线、唯一性和上一镜已发生且仍生效的后态
4. 摄影执行：景别、机位、焦点、必要运镜及有叙事作用的切点，使用标准英文术语（wide shot/medium shot/close-up shot 等）
5. 全局视觉与异常防护：只保留本镜确有漂移风险的控制项

【硬性约束】
- 台词按 Script IR 的 DLG 原文写成 <d>[Language]原文</d>，不翻译、不改写
- 不得加入 Visual:/Action:/Camera: 等自定义字段
- 不得补写 Script IR 中没有且未授权的事件
- 状态变化后的每个后续 [Shot N] 都要重申仍然生效的持有者、手别、数量、接触边界或位置后态
- 最后一镜必须把下一单元需要作为视觉输入的关键状态保持在可辨尺度直到生成结束
- 同一事实只在最合适的层级定义一次，逐镜不得重复完整角色穿着、完整房间清单或完整风格串`,
    builtin: true,
    enabled: true,
    createdAt: now - 900,
    updatedAt: now - 900,
  },
  {
    version: 1,
    id: 'pr-rule-seedance-25-direct',
    stage: 'unit_prompt',
    name: 'Seedance 2.5 Direct · 中文契约',
    desc: 'prompt_contract=seedance-2.5-direct-v1，中文结构，4-30秒，支持多镜头与一镜到底',
    content:
`【固定结构（有素材时字段顺序）】
1. 【全局声音与字幕约束】默认写"不要BGM、不要字幕，只保留音效"，用户明确要求时以用户要求为准，对白不受默认禁令影响
2. 【素材说明】按真实上传顺序使用 @图片1、@图片2 等连续句柄，每项同时说明"参考什么"和"不参考什么"，未上传素材不得出现
3. 【一句话概述】包含人物、地点、核心事件或情绪变化、拍摄形式和预计总时长
4. 【全局视觉设定】固定包含全局风格、关键材质与受光表现、灯光基线，不写具体镜头动作或运镜
5. 【详细情节】连续整数秒时间段，覆盖完整单元，不重叠、不留空洞
6. 【全局连续性与结尾约束】锁定人物、空间、道具、轴线、结束画面和必要防错项

【多镜头格式】
每段标题使用 {开始}-{结束}秒｜镜头N，每镜字段顺序固定：
- 画面动作概述
- 画面构图
- 机位（写清起始状态、跟随对象、触发变化和结束动势）
- 动作/表演
- 对白
- 声音
- 转场（除最后一镜外必须交代，切镜必须有信息、表演、空间或节奏职责）

【单镜头一镜到底格式】
【详细情节】首先声明"全程单镜头、无剪辑、不中断、不跳轴"，时间段使用"路径节点""阶段"或"节拍"，不得使用"镜头N"，不得出现硬切、跳切、换机位或瞬移

【硬性约束】
- 所有事件和对白回溯到 EV/DLG/LOCK，对白逐字保留说话人、字词和顺序
- 多人、道具与摄影机几何继承 scene map
- 情绪转译为可见、可表演事件
- 每份可提交 Prompt 只对应一个生成单元
- 不使用 H3 六字段、<Subject N> 与 ref_image_N`,
    builtin: true,
    enabled: true,
    createdAt: now - 800,
    updatedAt: now - 800,
  },
];

interface PromptRuleState {
  templates: PromptRuleTemplate[];
  upsertTemplate(input: Omit<PromptRuleTemplate, 'createdAt' | 'updatedAt' | 'version'> & { createdAt?: number }, opts?: { note?: string }): void;
  /** 恢复历史版本：把该版本快照写回当前模板并生成新版本（历史保留，链不中断） */
  restoreVersion(id: string, version: number): void;
  removeTemplate(id: string): void;
  toggleEnabled(id: string): void;
  // 后端同步
  loadFromServer(): Promise<void>;
}

export const usePromptRuleStore = create<PromptRuleState>()(
  persist(
    (set, get) => ({
      templates: BUILTIN_PROMPT_RULES,

      upsertTemplate(input, opts) {
        const t = input as PromptRuleTemplate;
        if (t.builtin) {
          // 平台内置模板只读，仅允许启停；内容由平台维护
          set((s) => ({
            templates: s.templates.map((x) => (x.id === t.id ? { ...x, enabled: t.enabled } : x)),
          }));
          return;
        }
        set((s) => {
          const exists = s.templates.some((x) => x.id === t.id);
          if (!exists) {
            return {
              templates: [{ ...t, version: 1, createdAt: Date.now(), updatedAt: Date.now() }, ...s.templates],
            };
          }
          return {
            templates: s.templates.map((x) => {
              if (x.id !== t.id) return x;
              const now = Date.now();
              const version = (x.version ?? 1) + 1;
              const history = x.versionHistory ?? [];
              history.push({
                version: version - 1,
                savedAt: x.updatedAt || now,
                note: opts?.note,
                snapshot: { name: x.name, desc: x.desc, content: x.content },
              });
              return { ...x, ...t, version, versionHistory: history, createdAt: x.createdAt, updatedAt: now };
            }),
          };
        });
        // 同步到后端（内置模板不同步）
        if (!t.builtin) {
          const updated = get().templates.find((x) => x.id === t.id);
          if (updated) {
            const exists = get().templates.some((x) => x.id === t.id && x.version > 1);
            if (exists) {
              api.updateRuleTemplate(t.id, promptTemplateToServerPatch(updated)).catch(() => {});
            } else {
              api.createRuleTemplate(promptTemplateToServer(updated)).catch(() => {});
            }
          }
        }
      },

      restoreVersion(id, version) {
        set((s) => ({
          templates: s.templates.map((x) => {
            if (x.id !== id) return x;
            const v = (x.versionHistory ?? []).find((h) => h.version === version);
            if (!v) return x;
            const now = Date.now();
            const nextVersion = (x.version ?? 1) + 1;
            const history = [...(x.versionHistory ?? [])];
            history.push({
              version: x.version ?? 1,
              savedAt: x.updatedAt || now,
              note: `恢复至 v${version}`,
              snapshot: { name: x.name, desc: x.desc, content: x.content },
            });
            return { ...x, ...v.snapshot, version: nextVersion, versionHistory: history, updatedAt: now };
          }),
        }));
        // 同步到后端
        const updated = get().templates.find((x) => x.id === id);
        if (updated && !updated.builtin) {
          api.updateRuleTemplate(id, promptTemplateToServerPatch(updated)).catch(() => {});
        }
      },

      removeTemplate(id) {
        set((s) => ({ templates: s.templates.filter((x) => x.id !== id) }));
        // 同步到后端（内置模板不同步）
        const t = get().templates.find((x) => x.id === id);
        if (!t?.builtin) {
          api.deleteRuleTemplate(id).catch(() => {});
        }
      },

      toggleEnabled(id) {
        set((s) => ({
          templates: s.templates.map((x) =>
            x.id === id ? { ...x, enabled: !x.enabled, updatedAt: Date.now() } : x,
          ),
        }));
        // 同步到后端
        const t = get().templates.find((x) => x.id === id);
        if (t && !t.builtin) {
          api.updateRuleTemplate(id, { enabled: t.enabled }).catch(() => {});
        }
      },

      // 后端同步：从服务器加载用户模板（内置模板保留在前端）
      async loadFromServer() {
        try {
          const { items } = await api.listRuleTemplates('prompt');
          if (items && items.length > 0) {
            const serverTemplates = items.map(promptTemplateFromServer);
            set((s) => {
              // 保留内置模板，合并后端用户模板
              const builtin = s.templates.filter((t) => t.builtin);
              const userIds = new Set(serverTemplates.map((t) => t.id));
              const localUser = s.templates.filter((t) => !t.builtin && !userIds.has(t.id));
              return { templates: [...builtin, ...serverTemplates, ...localUser] };
            });
          } else {
            // 后端为空但 localStorage 有用户模板：自动迁移
            const userTemplates = get().templates.filter((t) => !t.builtin);
            userTemplates.forEach((t) => {
              api.createRuleTemplate(promptTemplateToServer(t)).catch(() => {});
            });
          }
        } catch (err) {
          console.warn('[promptRuleStore] loadFromServer failed:', err);
        }
      },
    }),
    { name: 'mdp:prompt-rules' },
  ),
);

// ==================== 类型转换（前端 PromptRuleTemplate ↔ 后端 ServerRuleTemplate）====================

function promptTemplateFromServer(server: import('@/lib/api/client').ServerRuleTemplate): PromptRuleTemplate {
  return {
    id: server.id,
    version: server.version,
    stage: server.stage || '',
    name: server.name,
    desc: server.description,
    content: server.content,
    enabled: server.enabled,
    builtin: server.builtin,
    createdAt: server.created_at ? new Date(server.created_at).getTime() : Date.now(),
    updatedAt: server.updated_at ? new Date(server.updated_at).getTime() : Date.now(),
    versionHistory: (server.version_history || []).map((h) => ({
      version: h.version,
      savedAt: h.savedAt,
      note: h.note,
      snapshot: h.snapshot as PromptRuleTemplate['versionHistory'][number]['snapshot'],
    })),
  };
}

function promptTemplateToServer(t: PromptRuleTemplate): import('@/lib/api/client').CreateRuleTemplateRequest {
  return {
    id: t.id,
    kind: 'prompt',
    name: t.name,
    description: t.desc,
    stage: t.stage,
    content: t.content,
    builtin: t.builtin,
    enabled: t.enabled,
  };
}

function promptTemplateToServerPatch(t: PromptRuleTemplate): Partial<import('@/lib/api/client').ServerRuleTemplate> {
  return {
    name: t.name,
    description: t.desc,
    stage: t.stage,
    content: t.content,
    version: t.version,
    enabled: t.enabled,
    version_history: (t.versionHistory || []).map((h) => ({
      version: h.version,
      savedAt: h.savedAt,
      note: h.note,
      snapshot: h.snapshot,
    })),
  };
}
