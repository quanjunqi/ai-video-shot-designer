// 角色提取规则库（可管理）：mdp:character-extraction-rules 持久化
// 定位：规则中心「定义」（平台默认只读 + 用户模板 CRUD），角色资产页面「选择生效」
// 控制从分镜提取角色资产的过滤逻辑（群体角色关键词、无台词过滤等）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CharacterExtractionRule, DEFAULT_GROUP_CHARACTER_KEYWORDS } from '@/types';

const now = Date.now();

const BUILTIN_RULES: CharacterExtractionRule[] = [
  {
    version: 1,
    id: 'cer-default',
    name: '标准提取 · 平台默认',
    desc: '过滤群体角色（队友/敌人/路人等），保留具体人名',
    groupKeywords: [
      '若干', '群', '众', '们', '路人', '观众', '士兵',
      '队友', '对手', '敌人', '敌方', '我方', '群众', '行人',
      '背景', 'NPC', 'npc', '路人甲', '路人乙', '配角',
      '其他', '其余', '剩下', '旁边', '周围',
    ],
    filterNoDialog: false,
    builtin: true,
    enabled: true,
    createdAt: now - 3000,
    updatedAt: now - 3000,
  },
  {
    version: 1,
    id: 'cer-strict',
    name: '严格提取 · 仅主要角色',
    desc: '更严格的群体角色过滤 + 过滤无台词角色',
    groupKeywords: [
      '若干', '群', '众', '们', '路人', '观众', '士兵',
      '队友', '对手', '敌人', '敌方', '我方', '群众', '行人',
      '背景', 'NPC', 'npc', '路人甲', '路人乙', '配角',
      '其他', '其余', '剩下', '旁边', '周围',
      '随从', '手下', '弟子', '学生', '员工', '同事',
    ],
    filterNoDialog: true,
    builtin: true,
    enabled: true,
    createdAt: now - 2000,
    updatedAt: now - 2000,
  },
  {
    version: 1,
    id: 'cer-all',
    name: '全量提取 · 不过滤',
    desc: '不过滤任何角色，分镜中出现的所有名字都生成资产',
    groupKeywords: [],
    filterNoDialog: false,
    builtin: true,
    enabled: true,
    createdAt: now - 1000,
    updatedAt: now - 1000,
  },
];

interface State {
  rules: CharacterExtractionRule[];
  activeRuleId: string;
  upsertRule: (rule: Omit<CharacterExtractionRule, 'createdAt' | 'updatedAt' | 'version'> & { version?: number }) => void;
  removeRule: (id: string) => void;
  toggleEnabled: (id: string) => void;
  setActiveRule: (id: string) => void;
  getActiveRule: () => CharacterExtractionRule | undefined;
  isGroupCharacter: (name: string) => boolean;
}

export const useCharacterExtractionRuleStore = create<State>()(
  persist(
    (set, get) => ({
      rules: BUILTIN_RULES,
      activeRuleId: 'cer-default',

      upsertRule: (input) => {
        set((s) => {
          const exists = s.rules.some((r) => r.id === input.id);
          if (exists) {
            return {
              rules: s.rules.map((r) =>
                r.id === input.id
                  ? { ...r, ...input, version: (input.version ?? r.version) + 1, updatedAt: Date.now() }
                  : r,
              ),
            };
          }
          const newRule: CharacterExtractionRule = {
            ...input,
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          return { rules: [newRule, ...s.rules] };
        });
      },

      removeRule: (id) => {
        set((s) => ({
          rules: s.rules.filter((r) => r.id !== id || r.builtin),
          activeRuleId: s.activeRuleId === id ? 'cer-default' : s.activeRuleId,
        }));
      },

      toggleEnabled: (id) => {
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
        }));
      },

      setActiveRule: (id) => set({ activeRuleId: id }),

      getActiveRule: () => {
        const { rules, activeRuleId } = get();
        return rules.find((r) => r.id === activeRuleId) ?? rules[0];
      },

      isGroupCharacter: (name) => {
        const rule = get().getActiveRule();
        if (!rule) return false;
        return rule.groupKeywords.some((kw) => name.includes(kw));
      },
    }),
    {
      name: 'mdp:character-extraction-rules',
    },
  ),
);
