// ┌─────────────────────────────────────────────────────────────────────────┐
// │ 由 scripts/ui-inventory.mjs 生成 —— 禁止手改；改代码或注记后跑 `npm run ui:generate`。 │
// └─────────────────────────────────────────────────────────────────────────┘
export type UiVariant = { name: string; values: string[]; defaultValue?: string; classes?: Record<string, string> };
export type UiNotes = { when: string; avoid: string; antiPatterns: string[]; related: string[] };
export type UiComponent = {
  name: string; file: string; lines: number; exports: string[]; primitives: string[];
  slots: string[]; props: string[]; asChild: boolean; variants: UiVariant[];
  usage: { count: number; files: string[] }; dead: boolean; tokens: string[];
  category: string; notes: UiNotes;
};
export type UiToken = { name: string; light: string; dark: string | null; group: string; utilities: string[] };
export type UiThemeUtility = { name: string; value: string; group: string };
export type UiTypography = { plugin: string | null; prose: { name: string; value: string }[] };
export type UiScaleStep = { value: string; count: number };
export type UiScales = {
  scannedFiles: number; text: UiScaleStep[]; textArbitrary: UiScaleStep[];
  spacing: UiScaleStep[]; spacingArbitrary: UiScaleStep[];
  radius: UiScaleStep[]; radiusArbitrary: UiScaleStep[]; shadow: UiScaleStep[]; shadowArbitrary: UiScaleStep[];
  leading: UiScaleStep[]; tracking: UiScaleStep[];
};
export type UiCatalog = {
  stats: { components: number; lines: number; dead: number; tokens: number; withNotes: number; withDemo: number };
  categories: string[]; components: UiComponent[]; tokens: UiToken[];
  missingNotes: string[]; missingDemos: string[]; unknownNotes: string[];
  themeUtilities: UiThemeUtility[]; typography: UiTypography; themeUtilityCount: number; scales: UiScales;
};

export const UI_CATALOG: UiCatalog = {
  "stats": {
    "components": 42,
    "lines": 5081,
    "dead": 20,
    "tokens": 76,
    "withNotes": 42,
    "withDemo": 42
  },
  "categories": [
    "基础",
    "布局",
    "导航",
    "数据录入",
    "数据展示",
    "反馈",
    "其他"
  ],
  "components": [
    {
      "name": "accordion",
      "file": "apps/web/src/components/ui/accordion.tsx",
      "lines": 67,
      "exports": [
        "Accordion",
        "AccordionItem",
        "AccordionTrigger",
        "AccordionContent"
      ],
      "primitives": [
        "@radix-ui/react-accordion"
      ],
      "slots": [
        "accordion",
        "accordion-item",
        "accordion-trigger",
        "accordion-content"
      ],
      "props": [
        "React.ComponentProps<typeof AccordionPrimitive.Root>",
        "React.ComponentProps<typeof AccordionPrimitive.Item>",
        "React.ComponentProps<typeof AccordionPrimitive.Trigger>",
        "React.ComponentProps<typeof AccordionPrimitive.Content>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据展示",
      "notes": {
        "when": "同组多条可折叠内容、一次只看一条时（FAQ、分段设置）",
        "avoid": "单条短内容别折叠；折叠用 collapsible；业务零引用（UC-006）",
        "antiPatterns": [
          "关键规则默认折叠藏起来（R7）",
          "把 accordion 当 tabs 做页面主切换（UC-006）"
        ],
        "related": [
          "collapsible",
          "card",
          "tabs"
        ]
      }
    },
    {
      "name": "alert",
      "file": "apps/web/src/components/ui/alert.tsx",
      "lines": 72,
      "exports": [
        "Alert",
        "AlertTitle",
        "AlertDescription"
      ],
      "primitives": [],
      "slots": [
        "alert",
        "alert-title",
        "alert-description"
      ],
      "props": [
        "React.ComponentProps<\"div\">",
        "VariantProps<typeof alertVariants>"
      ],
      "asChild": false,
      "variants": [
        {
          "name": "variant",
          "values": [
            "default",
            "destructive",
            "success",
            "warning"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "bg-card text-card-foreground",
            "destructive": "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
            "success": "bg-success text-success-foreground border-success/50 [&>svg]:text-success-foreground *:data-[slot=alert-description]:text-success-foreground/90",
            "warning": "bg-warning text-warning-foreground border-warning/50 [&>svg]:text-warning-foreground *:data-[slot=alert-description]:text-warning-foreground/90"
          }
        }
      ],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [
        "--spacing"
      ],
      "category": "反馈",
      "notes": {
        "when": "页面内常驻的说明或结果块（错误、警告、成功提示）",
        "avoid": "提示用 sonner；确认用alert-dialog；业务零引用（UC-006）",
        "antiPatterns": [
          "失败只写操作失败不透传根因（R4）",
          "危险场景误用 success variant（FE-STYLE-004）"
        ],
        "related": [
          "sonner",
          "alert-dialog",
          "empty"
        ]
      }
    },
    {
      "name": "alert-dialog",
      "file": "apps/web/src/components/ui/alert-dialog.tsx",
      "lines": 158,
      "exports": [
        "AlertDialog",
        "AlertDialogPortal",
        "AlertDialogOverlay",
        "AlertDialogTrigger",
        "AlertDialogContent",
        "AlertDialogHeader",
        "AlertDialogFooter",
        "AlertDialogTitle",
        "AlertDialogDescription",
        "AlertDialogAction",
        "AlertDialogCancel"
      ],
      "primitives": [
        "@radix-ui/react-alert-dialog"
      ],
      "slots": [
        "alert-dialog",
        "alert-dialog-trigger",
        "alert-dialog-portal",
        "alert-dialog-overlay",
        "alert-dialog-content",
        "alert-dialog-header",
        "alert-dialog-footer",
        "alert-dialog-title",
        "alert-dialog-description"
      ],
      "props": [
        "React.ComponentProps<typeof AlertDialogPrimitive.Root>",
        "React.ComponentProps<typeof AlertDialogPrimitive.Trigger>",
        "React.ComponentProps<typeof AlertDialogPrimitive.Portal>",
        "React.ComponentProps<typeof AlertDialogPrimitive.Overlay>",
        "React.ComponentProps<typeof AlertDialogPrimitive.Content>",
        "React.ComponentProps<\"div\">",
        "React.ComponentProps<typeof AlertDialogPrimitive.Title>",
        "React.ComponentProps<typeof AlertDialogPrimitive.Description>",
        "React.ComponentProps<typeof AlertDialogPrimitive.Action>",
        "React.ComponentProps<typeof AlertDialogPrimitive.Cancel>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 9,
        "files": [
          "apps/web/src/features/comic/EpisodeAnalysisRun.tsx",
          "apps/web/src/features/comic/EpisodeCard.tsx",
          "apps/web/src/features/comic/ProjectCharacterLibrary.tsx",
          "apps/web/src/features/comic/ProjectPropLibrary.tsx",
          "apps/web/src/features/comic/ProjectSceneLibrary.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx",
          "apps/web/src/features/settings/LogicalModelCandidatesPanel.tsx",
          "apps/web/src/pages/ComicProjectDetail.tsx",
          "apps/web/src/pages/ComicProjects.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "反馈",
      "notes": {
        "when": "破坏性/不可逆操作的二次确认（删除渠道、模型、项目）",
        "avoid": "普通表单弹窗用 dialog；只提示结果用 sonner，别都做成确认框",
        "antiPatterns": [
          "删除无确认直接执行（清单 1）",
          "确认按钮只写确定不说清后果（UC-004）"
        ],
        "related": [
          "dialog",
          "sonner",
          "button"
        ]
      }
    },
    {
      "name": "avatar",
      "file": "apps/web/src/components/ui/avatar.tsx",
      "lines": 54,
      "exports": [
        "Avatar",
        "AvatarImage",
        "AvatarFallback"
      ],
      "primitives": [
        "@radix-ui/react-avatar"
      ],
      "slots": [
        "avatar",
        "avatar-image",
        "avatar-fallback"
      ],
      "props": [
        "React.ComponentProps<typeof AvatarPrimitive.Root>",
        "React.ComponentProps<typeof AvatarPrimitive.Image>",
        "React.ComponentProps<typeof AvatarPrimitive.Fallback>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 1,
        "files": [
          "apps/web/src/layouts/TopBar.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "基础",
      "notes": {
        "when": "展示用户或角色小头像，加载失败回退首字母或图标",
        "avoid": "作品封面等大图用 image 配 aspect-ratio，别用 avatar",
        "antiPatterns": [
          "手写 img 拼头像缺 fallback（UC-006）",
          "用 avatar 承载非人物图片（UC-006）"
        ],
        "related": [
          "image",
          "badge",
          "item"
        ]
      }
    },
    {
      "name": "badge",
      "file": "apps/web/src/components/ui/badge.tsx",
      "lines": 43,
      "exports": [
        "Badge",
        "badgeVariants"
      ],
      "primitives": [],
      "slots": [],
      "props": [
        "VariantProps<typeof badgeVariants>"
      ],
      "asChild": false,
      "variants": [
        {
          "name": "variant",
          "values": [
            "default",
            "secondary",
            "destructive",
            "outline"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "border-transparent bg-primary text-primary-foreground shadow-xs",
            "secondary": "border-transparent bg-secondary text-secondary-foreground",
            "destructive": "border-transparent bg-destructive text-destructive-foreground shadow-xs",
            "outline": "border [border-color:var(--badge-outline)] shadow-xs"
          }
        }
      ],
      "usage": {
        "count": 44,
        "files": [
          "apps/web/src/components/ParamEditor.tsx",
          "apps/web/src/components/ProtocolEvidence.tsx",
          "apps/web/src/components/ProtocolPreview.tsx",
          "apps/web/src/components/common/DemoBadge.tsx",
          "apps/web/src/components/common/ResourceList.tsx",
          "apps/web/src/features/comic/BlockingStage.tsx",
          "apps/web/src/features/comic/CharacterStage.tsx",
          "apps/web/src/features/comic/EpisodeScriptDialog.tsx",
          "apps/web/src/features/comic/InterpretStage.tsx",
          "apps/web/src/features/comic/NewProjectDialog.tsx",
          "apps/web/src/features/comic/ProductionStage.tsx",
          "apps/web/src/features/comic/ProjectAssetsPanel.tsx",
          "apps/web/src/features/comic/ProjectCharacterLibrary.tsx",
          "apps/web/src/features/comic/ProjectPropLibrary.tsx",
          "apps/web/src/features/comic/ProjectSceneLibrary.tsx",
          "apps/web/src/features/comic/PropStage.tsx",
          "apps/web/src/features/comic/SceneStage.tsx",
          "apps/web/src/features/comic/ScriptReview.tsx",
          "apps/web/src/features/comic/UnitsStage.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx",
          "apps/web/src/features/home/RecentProjects.tsx",
          "apps/web/src/features/rules/PromptRulesTab.tsx",
          "apps/web/src/features/rules/RuleVersionList.tsx",
          "apps/web/src/features/settings/BudgetRulesSection.tsx",
          "apps/web/src/features/settings/CurationPanel.tsx",
          "apps/web/src/features/settings/LogicalModelCandidatesPanel.tsx",
          "apps/web/src/layouts/TopBar.tsx",
          "apps/web/src/pages/Assets.tsx",
          "apps/web/src/pages/ComicProjectDetail.tsx",
          "apps/web/src/pages/ComicProjects.tsx",
          "apps/web/src/pages/EpisodeWorkbench.tsx",
          "apps/web/src/pages/ModelCatalog.tsx",
          "apps/web/src/pages/ModelChannels.tsx",
          "apps/web/src/pages/ModelMarket.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx",
          "apps/web/src/pages/SettingsAbout.tsx",
          "apps/web/src/pages/SettingsAccount.tsx",
          "apps/web/src/pages/SettingsAppearance.tsx",
          "apps/web/src/pages/SettingsData.tsx",
          "apps/web/src/pages/SettingsNotifications.tsx",
          "apps/web/src/pages/SettingsWorkspace.tsx",
          "apps/web/src/pages/ShotLanguage.tsx",
          "apps/web/src/pages/StyleLibraryPage.tsx",
          "apps/web/src/pages/Tasks.tsx"
        ]
      },
      "dead": false,
      "tokens": [
        "--badge-outline"
      ],
      "category": "基础",
      "notes": {
        "when": "展示简短状态或分类标签（已发布、草稿、失败），不承载操作",
        "avoid": "可点击标签用 toggle；长文案用 item-description",
        "antiPatterns": [
          "用 badge 当按钮点（应换 button、toggle）（UC-006）",
          "长文本不截断撑破卡片（R-UI-006）"
        ],
        "related": [
          "separator",
          "kbd",
          "item"
        ]
      }
    },
    {
      "name": "breadcrumb",
      "file": "apps/web/src/components/ui/breadcrumb.tsx",
      "lines": 110,
      "exports": [
        "Breadcrumb",
        "BreadcrumbList",
        "BreadcrumbItem",
        "BreadcrumbLink",
        "BreadcrumbPage",
        "BreadcrumbSeparator",
        "BreadcrumbEllipsis"
      ],
      "primitives": [
        "@radix-ui/react-slot"
      ],
      "slots": [
        "breadcrumb",
        "breadcrumb-list",
        "breadcrumb-item",
        "breadcrumb-link",
        "breadcrumb-page",
        "breadcrumb-separator",
        "breadcrumb-ellipsis"
      ],
      "props": [
        "React.ComponentProps<\"nav\">",
        "React.ComponentProps<\"ol\">",
        "React.ComponentProps<\"li\">",
        "React.ComponentProps<\"a\">",
        "React.ComponentProps<\"span\">"
      ],
      "asChild": true,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "导航",
      "notes": {
        "when": "展示三级以上页面层级路径，供用户回跳上级",
        "avoid": "一级页面或返回键足够时别加；业务零引用（UC-006）",
        "antiPatterns": [
          "用 breadcrumb 充当主站导航（应换 navigation-menu）（UC-006）",
          "末级当前页做成可点链接（UC-005）"
        ],
        "related": [
          "navigation-menu",
          "tabs",
          "pagination"
        ]
      }
    },
    {
      "name": "button",
      "file": "apps/web/src/components/ui/button.tsx",
      "lines": 70,
      "exports": [
        "Button",
        "buttonVariants"
      ],
      "primitives": [
        "@radix-ui/react-slot"
      ],
      "slots": [
        "button"
      ],
      "props": [
        "React.ComponentProps<\"button\">",
        "VariantProps<typeof buttonVariants>"
      ],
      "asChild": true,
      "variants": [
        {
          "name": "variant",
          "values": [
            "default",
            "destructive",
            "outline",
            "secondary",
            "ghost"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "bg-primary text-primary-foreground border border-primary-border",
            "destructive": "bg-destructive text-destructive-foreground border border-destructive-border",
            "outline": "border [border-color:var(--button-outline)] shadow-xs active:shadow-none",
            "secondary": "bg-secondary text-secondary-foreground border border-secondary-border",
            "ghost": "border border-transparent"
          }
        },
        {
          "name": "size",
          "values": [
            "default",
            "sm",
            "lg",
            "icon"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "min-h-9 px-4 py-2",
            "sm": "min-h-8 rounded-md px-3 text-xs",
            "lg": "min-h-10 rounded-md px-8",
            "icon": "h-9 w-9"
          }
        }
      ],
      "usage": {
        "count": 51,
        "files": [
          "apps/web/src/components/ParamEditor.tsx",
          "apps/web/src/components/ProtocolParamOverrides.tsx",
          "apps/web/src/components/common/EmptyState.tsx",
          "apps/web/src/components/common/ResourceList.tsx",
          "apps/web/src/components/ui/alert-dialog.tsx",
          "apps/web/src/components/ui/calendar.tsx",
          "apps/web/src/components/ui/input-group.tsx",
          "apps/web/src/components/ui/pagination.tsx",
          "apps/web/src/components/ui/sidebar.tsx",
          "apps/web/src/features/comic/AddEpisodeDialog.tsx",
          "apps/web/src/features/comic/BlockingStage.tsx",
          "apps/web/src/features/comic/CharacterStage.tsx",
          "apps/web/src/features/comic/EpisodeAnalysisRun.tsx",
          "apps/web/src/features/comic/EpisodeScriptDialog.tsx",
          "apps/web/src/features/comic/InterpretStage.tsx",
          "apps/web/src/features/comic/NewProjectDialog.tsx",
          "apps/web/src/features/comic/ProductionStage.tsx",
          "apps/web/src/features/comic/ProjectCharacterLibrary.tsx",
          "apps/web/src/features/comic/ProjectParams.tsx",
          "apps/web/src/features/comic/ProjectPropLibrary.tsx",
          "apps/web/src/features/comic/ProjectSceneLibrary.tsx",
          "apps/web/src/features/comic/PropStage.tsx",
          "apps/web/src/features/comic/SceneStage.tsx",
          "apps/web/src/features/comic/ScriptReview.tsx",
          "apps/web/src/features/comic/SourceVersionDialog.tsx",
          "apps/web/src/features/comic/SplitRulePicker.tsx",
          "apps/web/src/features/comic/StylePickerDialog.tsx",
          "apps/web/src/features/comic/UnitsStage.tsx",
          "apps/web/src/features/comic/asset/AssetPromptCard.tsx",
          "apps/web/src/features/comic/asset/BatchGenerateBar.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx",
          "apps/web/src/features/rules/PromptRulesTab.tsx",
          "apps/web/src/features/rules/RuleVersionList.tsx",
          "apps/web/src/features/settings/BudgetRulesSection.tsx",
          "apps/web/src/features/settings/CurationPanel.tsx",
          "apps/web/src/features/settings/LogicalModelCandidatesPanel.tsx",
          "apps/web/src/layouts/TopBar.tsx",
          "apps/web/src/pages/Assets.tsx",
          "apps/web/src/pages/Canvas.tsx",
          "apps/web/src/pages/ComicProjectDetail.tsx",
          "apps/web/src/pages/ComicProjects.tsx",
          "apps/web/src/pages/EpisodeWorkbench.tsx",
          "apps/web/src/pages/ModelCatalog.tsx",
          "apps/web/src/pages/ModelChannels.tsx",
          "apps/web/src/pages/ModelMarket.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx",
          "apps/web/src/pages/SettingsAppearance.tsx",
          "apps/web/src/pages/SettingsData.tsx",
          "apps/web/src/pages/ShotLanguage.tsx",
          "apps/web/src/pages/StyleLibraryPage.tsx",
          "apps/web/src/pages/Tasks.tsx"
        ]
      },
      "dead": false,
      "tokens": [
        "--button-outline"
      ],
      "category": "基础",
      "notes": {
        "when": "触发一次明确动作（提交、打开弹窗、删除），页面主要操作入口",
        "avoid": "跳转用 asChild 包 Link；别用 div 手写按钮（UC-006）",
        "antiPatterns": [
          "用 button 做链接导航（该用 asChild + Link）（UC-006）",
          "自写颜色类不走 variant（UC-002）",
          "请求中不禁用致重复提交（FE-API-005）"
        ],
        "related": [
          "button-group",
          "toggle",
          "spinner"
        ]
      }
    },
    {
      "name": "calendar",
      "file": "apps/web/src/components/ui/calendar.tsx",
      "lines": 214,
      "exports": [
        "Calendar",
        "CalendarDayButton"
      ],
      "primitives": [
        "react-day-picker"
      ],
      "slots": [
        "calendar"
      ],
      "props": [
        "React.ComponentProps<typeof DayPicker>",
        "React.ComponentProps<typeof Button>",
        "React.ComponentProps<typeof DayButton>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "需要日历视图选日期或区间（报表、审计筛选）",
        "avoid": "只需年/月/日三个下拉时用 select；业务零引用（UC-006）",
        "antiPatterns": [
          "calendar 直接铺满表单整行（应包 popover 触发）（R3）",
          "日期区间无预设只能逐个点（UC-006）"
        ],
        "related": [
          "popover",
          "input",
          "select"
        ]
      }
    },
    {
      "name": "card",
      "file": "apps/web/src/components/ui/card.tsx",
      "lines": 83,
      "exports": [
        "Card",
        "CardContent",
        "CardDescription",
        "CardFooter",
        "CardHeader",
        "CardTitle"
      ],
      "primitives": [],
      "slots": [],
      "props": [],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 3,
        "files": [
          "apps/web/src/features/rules/PromptRulesTab.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx",
          "apps/web/src/pages/SettingsAbout.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "基础",
      "notes": {
        "when": "把一块相关信息（标题、内容、操作）聚合成独立区块",
        "avoid": "纯列表项用 item；仅作留白容器时别套 card（会卡片套卡片）",
        "antiPatterns": [
          "卡片套卡片导致层级混乱（R3）",
          "CardTitle 长文本不截断溢出（R-UI-006）",
          "卡片内 grid 列缺 min-w-0 挤爆（R2）"
        ],
        "related": [
          "item",
          "separator",
          "empty"
        ]
      }
    },
    {
      "name": "chart",
      "file": "apps/web/src/components/ui/chart.tsx",
      "lines": 358,
      "exports": [
        "ChartContainer",
        "ChartTooltip",
        "ChartTooltipContent",
        "ChartLegend",
        "ChartLegendContent",
        "ChartStyle"
      ],
      "primitives": [
        "recharts"
      ],
      "slots": [
        "chart"
      ],
      "props": [
        "React.ComponentProps<\"div\">",
        "React.ComponentProps<\n    typeof RechartsPrimitive.ResponsiveContainer\n  >",
        "React.ComponentProps<typeof RechartsPrimitive.Tooltip>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据展示",
      "notes": {
        "when": "用柱/线/饼图展示指标趋势或占比（成本看板）",
        "avoid": "单一数值用文本卡片；业务零引用（UC-006）",
        "antiPatterns": [
          "图表颜色硬编码十六进制不走 token（FE-STYLE-004）",
          "无数据时不显示空态只留白（R-UI-004）"
        ],
        "related": [
          "card",
          "empty",
          "skeleton"
        ]
      }
    },
    {
      "name": "checkbox",
      "file": "apps/web/src/components/ui/checkbox.tsx",
      "lines": 33,
      "exports": [
        "Checkbox"
      ],
      "primitives": [
        "@radix-ui/react-checkbox"
      ],
      "slots": [
        "checkbox",
        "checkbox-indicator"
      ],
      "props": [
        "React.ComponentProps<typeof CheckboxPrimitive.Root>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 2,
        "files": [
          "apps/web/src/features/comic/CharacterStage.tsx",
          "apps/web/src/features/settings/LogicalModelCandidatesPanel.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "独立多选、批量选择与全选（配合列表批量删除）",
        "avoid": "互斥单选用 radio-group；即时生效的设置开关用 switch",
        "antiPatterns": [
          "批量列表无全选入口（R-CRUD-001）",
          "用 checkbox 当设置开关状态含义不清（UC-004）"
        ],
        "related": [
          "radio-group",
          "switch",
          "label"
        ]
      }
    },
    {
      "name": "collapsible",
      "file": "apps/web/src/components/ui/collapsible.tsx",
      "lines": 34,
      "exports": [
        "Collapsible",
        "CollapsibleTrigger",
        "CollapsibleContent"
      ],
      "primitives": [
        "@radix-ui/react-collapsible"
      ],
      "slots": [
        "collapsible",
        "collapsible-trigger",
        "collapsible-content"
      ],
      "props": [
        "React.ComponentProps<typeof CollapsiblePrimitive.Root>",
        "React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>",
        "React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 1,
        "files": [
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "布局",
      "notes": {
        "when": "折叠次要详情（高级设置、原始 JSON），由用户主动展开",
        "avoid": "关键信息必须默认可见，别折叠（R7）；组内多项互斥折叠用 accordion",
        "antiPatterns": [
          "把生效规则全文默认折叠（R7）",
          "折叠无过渡动画瞬间跳变（R-UI-005）"
        ],
        "related": [
          "accordion",
          "card",
          "field"
        ]
      }
    },
    {
      "name": "command",
      "file": "apps/web/src/components/ui/command.tsx",
      "lines": 209,
      "exports": [
        "Command",
        "CommandDialog",
        "CommandInput",
        "CommandList",
        "CommandEmpty",
        "CommandGroup",
        "CommandItem",
        "CommandShortcut",
        "CommandSeparator"
      ],
      "primitives": [
        "cmdk"
      ],
      "slots": [
        "command",
        "command-input-wrapper",
        "command-input",
        "command-list",
        "command-empty",
        "command-group",
        "command-separator",
        "command-item",
        "command-shortcut"
      ],
      "props": [
        "React.ComponentProps<typeof CommandPrimitive>",
        "React.ComponentProps<typeof Dialog>",
        "React.ComponentProps<typeof CommandPrimitive.Input>",
        "React.ComponentProps<typeof CommandPrimitive.List>",
        "React.ComponentProps<typeof CommandPrimitive.Empty>",
        "React.ComponentProps<typeof CommandPrimitive.Group>",
        "React.ComponentProps<typeof CommandPrimitive.Separator>",
        "React.ComponentProps<typeof CommandPrimitive.Item>",
        "React.ComponentProps<\"span\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 1,
        "files": [
          "apps/web/src/layouts/TopBar.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "导航",
      "notes": {
        "when": "命令面板或全局搜索（⌘K），带过滤与分组结果",
        "avoid": "二选一的下拉用 select 或 radio-group，别都塞命令面板",
        "antiPatterns": [
          "用 command 替代普通下拉选择多一次交互（UC-006）",
          "把 command 当 tabs 切换页面（UC-006）"
        ],
        "related": [
          "popover",
          "input",
          "dropdown-menu"
        ]
      }
    },
    {
      "name": "dialog",
      "file": "apps/web/src/components/ui/dialog.tsx",
      "lines": 144,
      "exports": [
        "Dialog",
        "DialogClose",
        "DialogContent",
        "DialogDescription",
        "DialogFooter",
        "DialogHeader",
        "DialogOverlay",
        "DialogPortal",
        "DialogTitle",
        "DialogTrigger"
      ],
      "primitives": [
        "@radix-ui/react-dialog"
      ],
      "slots": [
        "dialog",
        "dialog-trigger",
        "dialog-portal",
        "dialog-close",
        "dialog-overlay",
        "dialog-content",
        "dialog-header",
        "dialog-footer",
        "dialog-title",
        "dialog-description"
      ],
      "props": [
        "React.ComponentProps<typeof DialogPrimitive.Root>",
        "React.ComponentProps<typeof DialogPrimitive.Trigger>",
        "React.ComponentProps<typeof DialogPrimitive.Portal>",
        "React.ComponentProps<typeof DialogPrimitive.Close>",
        "React.ComponentProps<typeof DialogPrimitive.Overlay>",
        "React.ComponentProps<typeof DialogPrimitive.Content>",
        "React.ComponentProps<\"div\">",
        "React.ComponentProps<typeof DialogPrimitive.Title>",
        "React.ComponentProps<typeof DialogPrimitive.Description>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 25,
        "files": [
          "apps/web/src/components/ui/command.tsx",
          "apps/web/src/features/comic/AddEpisodeDialog.tsx",
          "apps/web/src/features/comic/CharacterStage.tsx",
          "apps/web/src/features/comic/EpisodeScriptDialog.tsx",
          "apps/web/src/features/comic/NewProjectDialog.tsx",
          "apps/web/src/features/comic/ProjectCharacterLibrary.tsx",
          "apps/web/src/features/comic/ProjectPropLibrary.tsx",
          "apps/web/src/features/comic/ProjectSceneLibrary.tsx",
          "apps/web/src/features/comic/PropStage.tsx",
          "apps/web/src/features/comic/SceneStage.tsx",
          "apps/web/src/features/comic/SourceVersionDialog.tsx",
          "apps/web/src/features/comic/StylePickerDialog.tsx",
          "apps/web/src/features/genworkbench/MentionTextarea.tsx",
          "apps/web/src/features/genworkbench/ReferenceBar.tsx",
          "apps/web/src/features/rules/PromptRulesTab.tsx",
          "apps/web/src/features/settings/BudgetRulesSection.tsx",
          "apps/web/src/features/settings/CurationPanel.tsx",
          "apps/web/src/pages/Assets.tsx",
          "apps/web/src/pages/Canvas.tsx",
          "apps/web/src/pages/EpisodeWorkbench.tsx",
          "apps/web/src/pages/ModelChannels.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx",
          "apps/web/src/pages/SettingsData.tsx",
          "apps/web/src/pages/ShotLanguage.tsx",
          "apps/web/src/pages/StyleLibraryPage.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "反馈",
      "notes": {
        "when": "需要用户聚焦完成的模态内容（表单、详情、选择器）",
        "avoid": "只做二次确认用 alert-dialog；大表单用 sheet 或 drawer",
        "antiPatterns": [
          "用 dialog 做破坏性确认（应换 alert-dialog）（UC-006）",
          "缺 DialogTitle 致 a11y 缺失（UC-005）",
          "弹窗内容不滚动致底部按钮不可达（清单 2）"
        ],
        "related": [
          "alert-dialog",
          "sheet",
          "drawer"
        ]
      }
    },
    {
      "name": "dropdown-menu",
      "file": "apps/web/src/components/ui/dropdown-menu.tsx",
      "lines": 330,
      "exports": [
        "DropdownMenu",
        "DropdownMenuPortal",
        "DropdownMenuTrigger",
        "DropdownMenuContent",
        "DropdownMenuGroup",
        "DropdownMenuLabel",
        "DropdownMenuItem",
        "DropdownMenuCheckboxItem",
        "DropdownMenuRadioGroup",
        "DropdownMenuRadioItem",
        "DropdownMenuSeparator",
        "DropdownMenuShortcut",
        "DropdownMenuSub",
        "DropdownMenuSubTrigger",
        "DropdownMenuSubContent"
      ],
      "primitives": [
        "@radix-ui/react-dropdown-menu"
      ],
      "slots": [
        "dropdown-menu",
        "dropdown-menu-portal",
        "dropdown-menu-trigger",
        "dropdown-menu-content",
        "dropdown-menu-group",
        "dropdown-menu-item",
        "dropdown-menu-checkbox-item",
        "dropdown-menu-radio-group",
        "dropdown-menu-radio-item",
        "dropdown-menu-label",
        "dropdown-menu-separator",
        "dropdown-menu-shortcut",
        "dropdown-menu-sub",
        "dropdown-menu-sub-trigger",
        "dropdown-menu-sub-content"
      ],
      "props": [
        "React.ComponentProps<typeof DropdownMenuPrimitive.Root>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.Portal>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.Content>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.Group>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.Item>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.Label>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.Separator>",
        "React.ComponentProps<\"span\">",
        "React.ComponentProps<typeof DropdownMenuPrimitive.Sub>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>",
        "React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 2,
        "files": [
          "apps/web/src/features/genworkbench/ReferenceBar.tsx",
          "apps/web/src/layouts/TopBar.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "导航",
      "notes": {
        "when": "点击触发的操作集合（行内更多菜单、用户菜单），支持分组与子菜单",
        "avoid": "右键上下文用 context-menu；表单取值用 select",
        "antiPatterns": [
          "用 dropdown-menu 选表单值（应换 select）（UC-006）",
          "危险项不用 destructive 样式易误点（UC-004）"
        ],
        "related": [
          "context-menu",
          "select",
          "menubar"
        ]
      }
    },
    {
      "name": "empty",
      "file": "apps/web/src/components/ui/empty.tsx",
      "lines": 105,
      "exports": [
        "Empty",
        "EmptyHeader",
        "EmptyTitle",
        "EmptyDescription",
        "EmptyContent",
        "EmptyMedia"
      ],
      "primitives": [],
      "slots": [
        "empty",
        "empty-header",
        "empty-icon",
        "empty-title",
        "empty-description",
        "empty-content"
      ],
      "props": [
        "React.ComponentProps<\"div\">",
        "VariantProps<typeof emptyMediaVariants>",
        "React.ComponentProps<\"p\">"
      ],
      "asChild": false,
      "variants": [
        {
          "name": "variant",
          "values": [
            "default",
            "icon"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "bg-transparent",
            "icon": "bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6"
          }
        }
      ],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "布局",
      "notes": {
        "when": "列表或区域无数据时的空态（图标 + 说明 + 行动按钮）",
        "avoid": "加载中用 skeleton；筛选无结果要区分文案；业务零引用（UC-006）",
        "antiPatterns": [
          "空态只写暂无数据无行动引导（R-UI-004）",
          "加载态与空态混用致误判（R7）",
          "与 common/EmptyState 重复自建（UC-006）"
        ],
        "related": [
          "skeleton",
          "spinner",
          "table"
        ]
      }
    },
    {
      "name": "field",
      "file": "apps/web/src/components/ui/field.tsx",
      "lines": 249,
      "exports": [
        "Field",
        "FieldLabel",
        "FieldDescription",
        "FieldError",
        "FieldGroup",
        "FieldLegend",
        "FieldSeparator",
        "FieldSet",
        "FieldContent",
        "FieldTitle"
      ],
      "primitives": [],
      "slots": [
        "field-set",
        "field-legend",
        "field-group",
        "field",
        "field-content",
        "field-label",
        "field-description",
        "field-separator",
        "field-separator-content",
        "field-error"
      ],
      "props": [
        "React.ComponentProps<\"fieldset\">",
        "React.ComponentProps<\"legend\">",
        "React.ComponentProps<\"div\">",
        "VariantProps<typeof fieldVariants>",
        "React.ComponentProps<typeof Label>",
        "React.ComponentProps<\"p\">"
      ],
      "asChild": false,
      "variants": [
        {
          "name": "orientation",
          "values": [],
          "defaultValue": "vertical",
          "classes": {}
        }
      ],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "不用 react-hook-form 时组织标签、控件、说明与错误的表单行",
        "avoid": "用 react-hook-form 时改 form；业务零引用（UC-006）",
        "antiPatterns": [
          "手写 div 加 label 拼表单行不复用 field（UC-006）",
          "错误态不设 data-invalid 红字不显（UC-004）"
        ],
        "related": [
          "form",
          "input",
          "label"
        ]
      }
    },
    {
      "name": "form",
      "file": "apps/web/src/components/ui/form.tsx",
      "lines": 168,
      "exports": [
        "useFormField",
        "Form",
        "FormItem",
        "FormLabel",
        "FormControl",
        "FormDescription",
        "FormMessage",
        "FormField"
      ],
      "primitives": [
        "@radix-ui/react-label",
        "@radix-ui/react-slot"
      ],
      "slots": [
        "form-item",
        "form-label",
        "form-control",
        "form-description",
        "form-message"
      ],
      "props": [
        "React.ComponentProps<\"div\">",
        "React.ComponentProps<typeof LabelPrimitive.Root>",
        "React.ComponentProps<typeof Slot>",
        "React.ComponentProps<\"p\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "用 react-hook-form 的表单，字段用 FormField 包裹",
        "avoid": "字段少时直接 useState 配 field；业务零引用（UC-006）",
        "antiPatterns": [
          "在 FormField 外调用 useFormContext 报错（UC-002）",
          "同一表单混用 store 与 RHF 两套状态（FE-STATE-004）"
        ],
        "related": [
          "field",
          "input",
          "label"
        ]
      }
    },
    {
      "name": "image",
      "file": "apps/web/src/components/ui/image.tsx",
      "lines": 184,
      "exports": [
        "Image"
      ],
      "primitives": [],
      "slots": [],
      "props": [
        "React.ComponentPropsWithoutRef<'img'>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "基础",
      "notes": {
        "when": "渲染对象存储白名单内的图片，需 srcSet、质量与格式优化时",
        "avoid": "非白名单或外链图直接用原生 img；业务零引用（UC-006）",
        "antiPatterns": [
          "给白名单外图片套 Image 期待优化（不生效）",
          "不给 width 与 sizes 却依赖 srcSet（选错档位）（R2）"
        ],
        "related": [
          "aspect-ratio",
          "avatar",
          "skeleton"
        ]
      }
    },
    {
      "name": "input",
      "file": "apps/web/src/components/ui/input.tsx",
      "lines": 22,
      "exports": [
        "Input"
      ],
      "primitives": [],
      "slots": [
        "input"
      ],
      "props": [
        "React.ComponentProps<\"input\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 27,
        "files": [
          "apps/web/src/components/ParamEditor.tsx",
          "apps/web/src/components/ProtocolParamOverrides.tsx",
          "apps/web/src/components/ui/input-group.tsx",
          "apps/web/src/components/ui/sidebar.tsx",
          "apps/web/src/features/comic/AddEpisodeDialog.tsx",
          "apps/web/src/features/comic/CharacterStage.tsx",
          "apps/web/src/features/comic/EpisodeAnalysisRun.tsx",
          "apps/web/src/features/comic/NewProjectDialog.tsx",
          "apps/web/src/features/comic/ProjectCharacterLibrary.tsx",
          "apps/web/src/features/comic/ProjectPropLibrary.tsx",
          "apps/web/src/features/comic/ProjectSceneLibrary.tsx",
          "apps/web/src/features/comic/StylePickerDialog.tsx",
          "apps/web/src/features/comic/asset/AssetPromptCard.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx",
          "apps/web/src/features/home/CreationSquare.tsx",
          "apps/web/src/features/rules/PromptRulesTab.tsx",
          "apps/web/src/features/settings/BudgetRulesSection.tsx",
          "apps/web/src/features/settings/CurationPanel.tsx",
          "apps/web/src/features/settings/LogicalModelCandidatesPanel.tsx",
          "apps/web/src/pages/Assets.tsx",
          "apps/web/src/pages/Canvas.tsx",
          "apps/web/src/pages/ComicProjects.tsx",
          "apps/web/src/pages/ModelCatalog.tsx",
          "apps/web/src/pages/ModelChannels.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx",
          "apps/web/src/pages/ShotLanguage.tsx",
          "apps/web/src/pages/StyleLibraryPage.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "单行文本、数字或密码输入，配合 label 使用",
        "avoid": "多行用 textarea；选项多用 select；前缀用 input-group",
        "antiPatterns": [
          "只有 placeholder 没有 label 与 htmlFor（FE-A11Y-002）",
          "错误态不置 aria-invalid（UC-004）",
          "自写输入框替代 input（UC-006）"
        ],
        "related": [
          "label",
          "textarea",
          "field"
        ]
      }
    },
    {
      "name": "input-group",
      "file": "apps/web/src/components/ui/input-group.tsx",
      "lines": 167,
      "exports": [
        "InputGroup",
        "InputGroupAddon",
        "InputGroupButton",
        "InputGroupText",
        "InputGroupInput",
        "InputGroupTextarea"
      ],
      "primitives": [],
      "slots": [
        "input-group",
        "input-group-addon",
        "input-group-control"
      ],
      "props": [
        "React.ComponentProps<\"div\">",
        "VariantProps<typeof inputGroupAddonVariants>",
        "React.ComponentProps<typeof Button>",
        "VariantProps<typeof inputGroupButtonVariants>",
        "React.ComponentProps<\"span\">",
        "React.ComponentProps<\"input\">",
        "React.ComponentProps<\"textarea\">"
      ],
      "asChild": false,
      "variants": [
        {
          "name": "align",
          "values": [
            "inline-start",
            "inline-end",
            "block-start",
            "block-end"
          ],
          "defaultValue": "inline-start",
          "classes": {
            "inline-start": "order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]",
            "inline-end": "order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]",
            "block-start": "order-first w-full justify-start px-3 pt-3 [.border-b]:pb-3 group-has-[>input]/input-group:pt-2.5",
            "block-end": "order-last w-full justify-start px-3 pb-3 [.border-t]:pt-3 group-has-[>input]/input-group:pb-2.5"
          }
        }
      ],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [
        "--radius"
      ],
      "category": "数据录入",
      "notes": {
        "when": "输入框需要前缀图标、后缀单位或内嵌按钮时（金额、搜索）",
        "avoid": "普通输入直接用 input；业务零引用（UC-006）",
        "antiPatterns": [
          "绝对定位手写后缀图标（应换 input-group）（UC-006）",
          "内嵌图标按钮缺 aria-label（FE-A11Y-001）"
        ],
        "related": [
          "input",
          "button",
          "field"
        ]
      }
    },
    {
      "name": "item",
      "file": "apps/web/src/components/ui/item.tsx",
      "lines": 194,
      "exports": [
        "Item",
        "ItemMedia",
        "ItemContent",
        "ItemActions",
        "ItemGroup",
        "ItemSeparator",
        "ItemTitle",
        "ItemDescription",
        "ItemHeader",
        "ItemFooter"
      ],
      "primitives": [
        "@radix-ui/react-slot"
      ],
      "slots": [
        "item-group",
        "item-separator",
        "item",
        "item-media",
        "item-content",
        "item-title",
        "item-description",
        "item-actions",
        "item-header",
        "item-footer"
      ],
      "props": [
        "React.ComponentProps<\"div\">",
        "React.ComponentProps<typeof Separator>",
        "VariantProps<typeof itemVariants>",
        "VariantProps<typeof itemMediaVariants>",
        "React.ComponentProps<\"p\">"
      ],
      "asChild": true,
      "variants": [
        {
          "name": "variant",
          "values": [
            "default",
            "outline",
            "muted"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "bg-transparent",
            "outline": "border-border",
            "muted": "bg-muted/50"
          }
        },
        {
          "name": "size",
          "values": [
            "default",
            "sm"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "p-4 gap-4",
            "sm": "py-3 px-4 gap-2.5"
          }
        },
        {
          "name": "variant",
          "values": [
            "default",
            "icon",
            "image"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "bg-transparent",
            "icon": "size-8 border rounded-sm bg-muted [&_svg:not([class*='size-'])]:size-4",
            "image": "size-10 rounded-sm overflow-hidden [&_img]:size-full [&_img]:object-cover"
          }
        }
      ],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "布局",
      "notes": {
        "when": "列表中的单条记录行（图标或头像 + 标题 + 描述 + 操作）",
        "avoid": "结构化多列表格用 table；业务零引用（UC-006）",
        "antiPatterns": [
          "每处手写 li 与 flex 拼列表项（应复用 item）（UC-006）",
          "ItemDescription 不截断撑破行（R-UI-006）"
        ],
        "related": [
          "table",
          "avatar",
          "badge"
        ]
      }
    },
    {
      "name": "label",
      "file": "apps/web/src/components/ui/label.tsx",
      "lines": 25,
      "exports": [
        "Label"
      ],
      "primitives": [
        "@radix-ui/react-label"
      ],
      "slots": [
        "label"
      ],
      "props": [
        "React.ComponentProps<typeof LabelPrimitive.Root>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 21,
        "files": [
          "apps/web/src/components/ui/field.tsx",
          "apps/web/src/components/ui/form.tsx",
          "apps/web/src/features/comic/NewProjectDialog.tsx",
          "apps/web/src/features/comic/ProjectParams.tsx",
          "apps/web/src/features/comic/SourceVersionDialog.tsx",
          "apps/web/src/features/comic/SplitRulePicker.tsx",
          "apps/web/src/features/comic/asset/AssetPromptCard.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx",
          "apps/web/src/features/rules/PromptRulesTab.tsx",
          "apps/web/src/features/settings/BudgetRulesSection.tsx",
          "apps/web/src/features/settings/CurationPanel.tsx",
          "apps/web/src/features/settings/LogicalModelCandidatesPanel.tsx",
          "apps/web/src/pages/Assets.tsx",
          "apps/web/src/pages/Canvas.tsx",
          "apps/web/src/pages/ModelCatalog.tsx",
          "apps/web/src/pages/ModelChannels.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx",
          "apps/web/src/pages/SettingsAppearance.tsx",
          "apps/web/src/pages/SettingsNotifications.tsx",
          "apps/web/src/pages/ShotLanguage.tsx",
          "apps/web/src/pages/StyleLibraryPage.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "为表单控件提供可点击文字标签，用 htmlFor 关联控件",
        "avoid": "只做视觉说明时用 field-description，避免误关联焦点",
        "antiPatterns": [
          "label 无 htmlFor 仅靠视觉对齐（FE-A11Y-002）",
          "把 label 当区块标题用（应换 field-legend）（UC-005）"
        ],
        "related": [
          "input",
          "field",
          "form"
        ]
      }
    },
    {
      "name": "native-select",
      "file": "apps/web/src/components/ui/native-select.tsx",
      "lines": 49,
      "exports": [
        "NativeSelect",
        "NativeSelectOptGroup",
        "NativeSelectOption"
      ],
      "primitives": [],
      "slots": [
        "native-select-wrapper",
        "native-select",
        "native-select-icon",
        "native-select-option",
        "native-select-optgroup"
      ],
      "props": [
        "React.ComponentProps<\"select\">",
        "React.ComponentProps<\"option\">",
        "React.ComponentProps<\"optgroup\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "选项少、需要移动端原生选择器或简单表单提交时",
        "avoid": "需要搜索、分组或自定义渲染用 select；业务零引用（UC-006）",
        "antiPatterns": [
          "20 个以上选项仍用 native-select 不可搜索（UC-006）",
          "控件无 label 关联（FE-A11Y-002）"
        ],
        "related": [
          "select",
          "input",
          "field"
        ]
      }
    },
    {
      "name": "pagination",
      "file": "apps/web/src/components/ui/pagination.tsx",
      "lines": 128,
      "exports": [
        "Pagination",
        "PaginationContent",
        "PaginationLink",
        "PaginationItem",
        "PaginationPrevious",
        "PaginationNext",
        "PaginationEllipsis"
      ],
      "primitives": [],
      "slots": [
        "pagination",
        "pagination-content",
        "pagination-item",
        "pagination-link",
        "pagination-ellipsis"
      ],
      "props": [
        "React.ComponentProps<\"nav\">",
        "React.ComponentProps<\"ul\">",
        "React.ComponentProps<\"li\">",
        "React.ComponentProps<typeof Button>",
        "React.ComponentProps<\"a\">",
        "React.ComponentProps<typeof PaginationLink>",
        "React.ComponentProps<\"span\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "导航",
      "notes": {
        "when": "长列表或表格分页，含页码与上一页下一页",
        "avoid": "几十条内的短列表用滚动或筛选；业务零引用（UC-006）",
        "antiPatterns": [
          "分页项用 div 加 onClick 代替 PaginationLink（键盘不可用）（FE-A11Y-002）",
          "当前页缺 aria-current（UC-005）"
        ],
        "related": [
          "table",
          "select",
          "button"
        ]
      }
    },
    {
      "name": "popover",
      "file": "apps/web/src/components/ui/popover.tsx",
      "lines": 49,
      "exports": [
        "Popover",
        "PopoverTrigger",
        "PopoverContent",
        "PopoverAnchor"
      ],
      "primitives": [
        "@radix-ui/react-popover"
      ],
      "slots": [
        "popover",
        "popover-trigger",
        "popover-content",
        "popover-anchor"
      ],
      "props": [
        "React.ComponentProps<typeof PopoverPrimitive.Root>",
        "React.ComponentProps<typeof PopoverPrimitive.Trigger>",
        "React.ComponentProps<typeof PopoverPrimitive.Content>",
        "React.ComponentProps<typeof PopoverPrimitive.Anchor>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "反馈",
      "notes": {
        "when": "点击后浮出的轻量面板（筛选、迷你表单、详细说明）",
        "avoid": "一句提示用 tooltip；模态阻塞用 dialog；业务零引用（UC-006）",
        "antiPatterns": [
          "用 popover 装完整表单当弹窗（应换 dialog）（UC-006）",
          "浮层内容不设宽度约束溢出（R2）"
        ],
        "related": [
          "tooltip",
          "hover-card",
          "dialog"
        ]
      }
    },
    {
      "name": "progress",
      "file": "apps/web/src/components/ui/progress.tsx",
      "lines": 32,
      "exports": [
        "Progress"
      ],
      "primitives": [
        "@radix-ui/react-progress"
      ],
      "slots": [
        "progress",
        "progress-indicator"
      ],
      "props": [
        "React.ComponentProps<typeof ProgressPrimitive.Root>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 4,
        "files": [
          "apps/web/src/features/comic/ProjectProgress.tsx",
          "apps/web/src/features/home/RecentProjects.tsx",
          "apps/web/src/pages/ComicProjects.tsx",
          "apps/web/src/pages/Tasks.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "反馈",
      "notes": {
        "when": "展示可量化进度的长任务（生成、上传、批量处理）",
        "avoid": "不可量化的等待用 spinner；纯状态标注用 badge",
        "antiPatterns": [
          "无真实进度却写死百分比动画（应换 spinner）（R4）",
          "不显示当前值与总数文案（UC-004）"
        ],
        "related": [
          "spinner",
          "badge",
          "skeleton"
        ]
      }
    },
    {
      "name": "radio-group",
      "file": "apps/web/src/components/ui/radio-group.tsx",
      "lines": 46,
      "exports": [
        "RadioGroup",
        "RadioGroupItem"
      ],
      "primitives": [
        "@radix-ui/react-radio-group"
      ],
      "slots": [
        "radio-group",
        "radio-group-item",
        "radio-group-indicator"
      ],
      "props": [
        "React.ComponentProps<typeof RadioGroupPrimitive.Root>",
        "React.ComponentProps<typeof RadioGroupPrimitive.Item>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "少量选项互斥单选（2–5 项，需同时看到全部选项）",
        "avoid": "选项超过 5–7 条用 select；业务零引用（UC-006）",
        "antiPatterns": [
          "用 radio 铺 20 个模型选项（应换 select）（UC-006）",
          "无默认选中造成空白占位（R7）"
        ],
        "related": [
          "checkbox",
          "select",
          "field"
        ]
      }
    },
    {
      "name": "scroll-area",
      "file": "apps/web/src/components/ui/scroll-area.tsx",
      "lines": 59,
      "exports": [
        "ScrollArea",
        "ScrollBar"
      ],
      "primitives": [
        "@radix-ui/react-scroll-area"
      ],
      "slots": [
        "scroll-area",
        "scroll-area-viewport",
        "scroll-area-scrollbar",
        "scroll-area-thumb"
      ],
      "props": [
        "React.ComponentProps<typeof ScrollAreaPrimitive.Root>",
        "React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "布局",
      "notes": {
        "when": "局部区域需要独立滚动条并保持统一细滚动条风格",
        "avoid": "整页或简单容器用原生滚动；业务零引用（UC-006）",
        "antiPatterns": [
          "多栏整面板不滚动致底部按钮截断（清单 2）",
          "滚动区缺 min-h-0 撑破父容器（R2）"
        ],
        "related": [
          "resizable",
          "sidebar",
          "table"
        ]
      }
    },
    {
      "name": "select",
      "file": "apps/web/src/components/ui/select.tsx",
      "lines": 244,
      "exports": [
        "Select",
        "SelectContent",
        "SelectGroup",
        "SelectItem",
        "SelectLabel",
        "SelectScrollDownButton",
        "SelectScrollUpButton",
        "SelectSeparator",
        "SelectTrigger",
        "SelectValue"
      ],
      "primitives": [
        "@radix-ui/react-select"
      ],
      "slots": [
        "select",
        "select-group",
        "select-value",
        "select-trigger",
        "select-content",
        "select-label",
        "select-item",
        "select-separator",
        "select-scroll-up-button",
        "select-scroll-down-button"
      ],
      "props": [
        "React.ComponentProps<typeof SelectPrimitive.Root>",
        "React.ComponentProps<typeof SelectPrimitive.Group>",
        "React.ComponentProps<typeof SelectPrimitive.Value>",
        "React.ComponentProps<typeof SelectPrimitive.Trigger>",
        "React.ComponentProps<typeof SelectPrimitive.Content>",
        "React.ComponentProps<typeof SelectPrimitive.Label>",
        "React.ComponentProps<typeof SelectPrimitive.Item>",
        "React.ComponentProps<typeof SelectPrimitive.Separator>",
        "React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>",
        "React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>"
      ],
      "asChild": true,
      "variants": [],
      "usage": {
        "count": 23,
        "files": [
          "apps/web/src/components/ParamEditor.tsx",
          "apps/web/src/components/common/FilterBar.tsx",
          "apps/web/src/features/comic/NewProjectDialog.tsx",
          "apps/web/src/features/comic/ProjectAssetsPanel.tsx",
          "apps/web/src/features/comic/ProjectCharacterLibrary.tsx",
          "apps/web/src/features/comic/ProjectParams.tsx",
          "apps/web/src/features/comic/SplitRulePicker.tsx",
          "apps/web/src/features/comic/StageModelPicker.tsx",
          "apps/web/src/features/comic/asset/AssetPromptCard.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx",
          "apps/web/src/features/home/CreationSquare.tsx",
          "apps/web/src/features/settings/BudgetRulesSection.tsx",
          "apps/web/src/features/settings/CurationPanel.tsx",
          "apps/web/src/pages/Assets.tsx",
          "apps/web/src/pages/Canvas.tsx",
          "apps/web/src/pages/ComicProjects.tsx",
          "apps/web/src/pages/ModelCatalog.tsx",
          "apps/web/src/pages/ModelChannels.tsx",
          "apps/web/src/pages/ModelMarket.tsx",
          "apps/web/src/pages/SettingsAppearance.tsx",
          "apps/web/src/pages/SettingsNotifications.tsx",
          "apps/web/src/pages/ShotLanguage.tsx",
          "apps/web/src/pages/Tasks.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "从固定选项中单选，选项较多且需受控值（模型、风格、渠道）",
        "avoid": "选项多且需搜索时用 command 配 popover（P0 缺口）",
        "antiPatterns": [
          "SelectTrigger 显式 w-fit 致同行重叠（R2）",
          "用 select 做多选（应换 checkbox）（UC-006）",
          "选项长文本不截断挤出容器（R-UI-006）"
        ],
        "related": [
          "command",
          "popover",
          "radio-group"
        ]
      }
    },
    {
      "name": "separator",
      "file": "apps/web/src/components/ui/separator.tsx",
      "lines": 29,
      "exports": [
        "Separator"
      ],
      "primitives": [
        "@radix-ui/react-separator"
      ],
      "slots": [
        "separator"
      ],
      "props": [
        "React.ComponentProps<typeof SeparatorPrimitive.Root>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 3,
        "files": [
          "apps/web/src/components/ui/field.tsx",
          "apps/web/src/components/ui/item.tsx",
          "apps/web/src/components/ui/sidebar.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "基础",
      "notes": {
        "when": "分隔同级内容块或菜单分组，表达这里换了一组",
        "avoid": "需要间距时用 gap 或 padding；业务零引用（UC-006）",
        "antiPatterns": [
          "用 separator 替代布局间距（应改 gap 或 padding）（R3）",
          "垂直分隔未设 orientation 高度塌陷（R2）"
        ],
        "related": [
          "card",
          "item",
          "badge"
        ]
      }
    },
    {
      "name": "sheet",
      "file": "apps/web/src/components/ui/sheet.tsx",
      "lines": 140,
      "exports": [
        "Sheet",
        "SheetTrigger",
        "SheetClose",
        "SheetContent",
        "SheetHeader",
        "SheetFooter",
        "SheetTitle",
        "SheetDescription"
      ],
      "primitives": [
        "@radix-ui/react-dialog"
      ],
      "slots": [
        "sheet",
        "sheet-trigger",
        "sheet-close",
        "sheet-portal",
        "sheet-overlay",
        "sheet-content",
        "sheet-header",
        "sheet-footer",
        "sheet-title",
        "sheet-description"
      ],
      "props": [
        "React.ComponentProps<typeof SheetPrimitive.Root>",
        "React.ComponentProps<typeof SheetPrimitive.Trigger>",
        "React.ComponentProps<typeof SheetPrimitive.Close>",
        "React.ComponentProps<typeof SheetPrimitive.Portal>",
        "React.ComponentProps<typeof SheetPrimitive.Overlay>",
        "React.ComponentProps<typeof SheetPrimitive.Content>",
        "React.ComponentProps<\"div\">",
        "React.ComponentProps<typeof SheetPrimitive.Title>",
        "React.ComponentProps<typeof SheetPrimitive.Description>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 5,
        "files": [
          "apps/web/src/components/ui/sidebar.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx",
          "apps/web/src/features/tasks/TaskDetailSheet.tsx",
          "apps/web/src/pages/ModelCatalog.tsx",
          "apps/web/src/pages/ModelMarket.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "反馈",
      "notes": {
        "when": "从边侧滑出的辅助面板（详情、设置、移动端菜单），保留上下文",
        "avoid": "需居中聚焦的短表单用 dialog；底部手势抽屉用 drawer",
        "antiPatterns": [
          "用 sheet 承载需全神贯注的长表单（宽度不足）",
          "缺 SheetTitle 与 Description 致 a11y 警告（UC-005）"
        ],
        "related": [
          "dialog",
          "drawer",
          "sidebar"
        ]
      }
    },
    {
      "name": "sidebar",
      "file": "apps/web/src/components/ui/sidebar.tsx",
      "lines": 728,
      "exports": [
        "Sidebar",
        "SidebarContent",
        "SidebarFooter",
        "SidebarGroup",
        "SidebarGroupAction",
        "SidebarGroupContent",
        "SidebarGroupLabel",
        "SidebarHeader",
        "SidebarInput",
        "SidebarInset",
        "SidebarMenu",
        "SidebarMenuAction",
        "SidebarMenuBadge",
        "SidebarMenuButton",
        "SidebarMenuItem",
        "SidebarMenuSkeleton",
        "SidebarMenuSub",
        "SidebarMenuSubButton",
        "SidebarMenuSubItem",
        "SidebarProvider",
        "SidebarRail",
        "SidebarSeparator",
        "SidebarTrigger",
        "useSidebar"
      ],
      "primitives": [
        "@radix-ui/react-slot"
      ],
      "slots": [
        "sidebar-wrapper",
        "sidebar",
        "sidebar-gap",
        "sidebar-container",
        "sidebar-inner",
        "sidebar-trigger",
        "sidebar-rail",
        "sidebar-inset",
        "sidebar-input",
        "sidebar-header",
        "sidebar-footer",
        "sidebar-separator",
        "sidebar-content",
        "sidebar-group",
        "sidebar-group-label",
        "sidebar-group-action",
        "sidebar-group-content",
        "sidebar-menu",
        "sidebar-menu-item",
        "sidebar-menu-button",
        "sidebar-menu-action",
        "sidebar-menu-badge",
        "sidebar-menu-skeleton",
        "sidebar-menu-sub",
        "sidebar-menu-sub-item",
        "sidebar-menu-sub-button"
      ],
      "props": [
        "React.ComponentProps<\"div\">",
        "React.ComponentProps<typeof Button>",
        "React.ComponentProps<\"button\">",
        "React.ComponentProps<\"main\">",
        "React.ComponentProps<typeof Input>",
        "React.ComponentProps<typeof Separator>",
        "React.ComponentProps<\"ul\">",
        "React.ComponentProps<\"li\">",
        "React.ComponentProps<typeof TooltipContent>",
        "VariantProps<typeof sidebarMenuButtonVariants>",
        "React.ComponentProps<\"a\">"
      ],
      "asChild": true,
      "variants": [
        {
          "name": "variant",
          "values": [
            "default",
            "outline"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "not-disabled:hover:bg-sidebar-accent not-disabled:hover:text-sidebar-accent-foreground",
            "outline": "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] not-disabled:hover:bg-sidebar-accent not-disabled:hover:text-sidebar-accent-foreground not-disabled:hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]"
          }
        },
        {
          "name": "size",
          "values": [
            "default",
            "sm",
            "lg"
          ],
          "defaultValue": "default",
          "classes": {
            "default": "h-8 text-sm",
            "sm": "h-7 text-xs",
            "lg": "h-12 text-sm group-data-[collapsible=icon]:p-0!"
          }
        }
      ],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [
        "--sidebar-accent",
        "--sidebar-border"
      ],
      "category": "布局",
      "notes": {
        "when": "应用级主导航（多级菜单、可折叠图标条），桌面固定移动抽屉",
        "avoid": "页内二级导航用 tabs；业务零引用（UC-006）",
        "antiPatterns": [
          "自写 div 侧栏替代 sidebar（失去移动端适配）（UC-006）",
          "侧栏标题缺 whitespace-nowrap 竖排（R-UI-001）",
          "侧栏内用 grid-cols-3 挤压（R-UI-002）"
        ],
        "related": [
          "navigation-menu",
          "tabs",
          "breadcrumb"
        ]
      }
    },
    {
      "name": "skeleton",
      "file": "apps/web/src/components/ui/skeleton.tsx",
      "lines": 14,
      "exports": [
        "Skeleton"
      ],
      "primitives": [],
      "slots": [
        "skeleton"
      ],
      "props": [
        "React.ComponentProps<\"div\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 1,
        "files": [
          "apps/web/src/components/ui/sidebar.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "基础",
      "notes": {
        "when": "已知结构的内容加载占位（列表、卡片首屏），防布局跳动",
        "avoid": "极短加载别闪骨架，按钮内用 spinner；业务零引用（UC-006）",
        "antiPatterns": [
          "用 skeleton 替代空态（无数据也闪骨架）（R-UI-004）",
          "请求失败后永远停在骨架不展示错误（R4）"
        ],
        "related": [
          "spinner",
          "empty",
          "card"
        ]
      }
    },
    {
      "name": "slider",
      "file": "apps/web/src/components/ui/slider.tsx",
      "lines": 88,
      "exports": [
        "Slider"
      ],
      "primitives": [
        "@radix-ui/react-slider"
      ],
      "slots": [
        "slider",
        "slider-track",
        "slider-range",
        "slider-thumb"
      ],
      "props": [
        "React.ComponentProps<typeof SliderPrimitive.Root>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "在连续区间内粗调数值（强度、阈值、权重）",
        "avoid": "需要精确输入数字用 input；业务零引用（UC-006）",
        "antiPatterns": [
          "用 slider 选值却不回显当前数字（UC-004）",
          "无 aria-label 致读屏不可用（UC-005）"
        ],
        "related": [
          "input",
          "progress",
          "field"
        ]
      }
    },
    {
      "name": "sonner",
      "file": "apps/web/src/components/ui/sonner.tsx",
      "lines": 68,
      "exports": [
        "Toaster"
      ],
      "primitives": [
        "sonner"
      ],
      "slots": [],
      "props": [],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 1,
        "files": [
          "apps/web/src/layouts/AppShell.tsx"
        ]
      },
      "dead": false,
      "tokens": [
        "--border",
        "--popover",
        "--popover-foreground",
        "--radius"
      ],
      "category": "反馈",
      "notes": {
        "when": "操作结果的瞬时反馈（保存成功、复制完成、请求失败）",
        "avoid": "需要用户确认或输入用 alert-dialog；常驻状态用 alert",
        "antiPatterns": [
          "用 toast 代替危险操作确认提示（易错过）（R4）",
          "错误 toast 写死文案不透传根因（R4）"
        ],
        "related": [
          "alert",
          "alert-dialog",
          "spinner"
        ]
      }
    },
    {
      "name": "spinner",
      "file": "apps/web/src/components/ui/spinner.tsx",
      "lines": 17,
      "exports": [
        "Spinner"
      ],
      "primitives": [],
      "slots": [],
      "props": [
        "React.ComponentProps<\"svg\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "基础",
      "notes": {
        "when": "局部、无固定结构的等待指示（按钮提交中、小区域刷新）",
        "avoid": "已知结构的首屏加载用 skeleton；业务零引用（UC-006）",
        "antiPatterns": [
          "整页只用 spinner 无文案说明在等什么（UC-008）",
          "spinner 期间按钮不禁用致重复提交（FE-API-005）"
        ],
        "related": [
          "skeleton",
          "progress",
          "button"
        ]
      }
    },
    {
      "name": "switch",
      "file": "apps/web/src/components/ui/switch.tsx",
      "lines": 32,
      "exports": [
        "Switch"
      ],
      "primitives": [
        "@radix-ui/react-switch"
      ],
      "slots": [
        "switch",
        "switch-thumb"
      ],
      "props": [
        "React.ComponentProps<typeof SwitchPrimitive.Root>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 4,
        "files": [
          "apps/web/src/features/rules/PromptRulesTab.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx",
          "apps/web/src/pages/SettingsAppearance.tsx",
          "apps/web/src/pages/SettingsNotifications.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "即时生效的二元设置（启用、停用），点击立即改变状态",
        "avoid": "需提交后才生效的表单字段用 checkbox 加保存按钮",
        "antiPatterns": [
          "切换后不落库不请求致刷新丢失（R-DATA-001）",
          "无 label 只有图形（FE-A11Y-002）"
        ],
        "related": [
          "checkbox",
          "field",
          "label"
        ]
      }
    },
    {
      "name": "table",
      "file": "apps/web/src/components/ui/table.tsx",
      "lines": 117,
      "exports": [
        "Table",
        "TableHeader",
        "TableBody",
        "TableFooter",
        "TableHead",
        "TableRow",
        "TableCell",
        "TableCaption"
      ],
      "primitives": [],
      "slots": [
        "table-container",
        "table",
        "table-header",
        "table-body",
        "table-footer",
        "table-row",
        "table-head",
        "table-cell",
        "table-caption"
      ],
      "props": [
        "React.ComponentProps<\"table\">",
        "React.ComponentProps<\"thead\">",
        "React.ComponentProps<\"tbody\">",
        "React.ComponentProps<\"tfoot\">",
        "React.ComponentProps<\"tr\">",
        "React.ComponentProps<\"th\">",
        "React.ComponentProps<\"td\">",
        "React.ComponentProps<\"caption\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 0,
        "files": []
      },
      "dead": true,
      "tokens": [],
      "category": "数据展示",
      "notes": {
        "when": "行列对齐的结构化数据展示（审计日志、模型、协议列表）",
        "avoid": "少量卡片式数据用 item 列表；业务零引用（UC-006）",
        "antiPatterns": [
          "长文本列不截断把表格撑宽溢出（R2、R-UI-006）",
          "表格外层缺 min-w-0 挤坏同行控件（R2）",
          "分页排序空态各页手写（应封装 DataTable）（UC-006）"
        ],
        "related": [
          "pagination",
          "empty",
          "item"
        ]
      }
    },
    {
      "name": "tabs",
      "file": "apps/web/src/components/ui/tabs.tsx",
      "lines": 67,
      "exports": [
        "Tabs",
        "TabsList",
        "TabsTrigger",
        "TabsContent"
      ],
      "primitives": [
        "@radix-ui/react-tabs"
      ],
      "slots": [
        "tabs",
        "tabs-list",
        "tabs-trigger",
        "tabs-content"
      ],
      "props": [
        "React.ComponentProps<typeof TabsPrimitive.Root>",
        "React.ComponentProps<typeof TabsPrimitive.List>",
        "React.ComponentProps<typeof TabsPrimitive.Trigger>",
        "React.ComponentProps<typeof TabsPrimitive.Content>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 2,
        "files": [
          "apps/web/src/features/comic/NewProjectDialog.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "导航",
      "notes": {
        "when": "同一页内平级视图切换（规则、版本、任务队列），内容互斥",
        "avoid": "需要同时对比多视图用并排布局；分步流程用向导",
        "antiPatterns": [
          "用 tabs 做路由级页面切换",
          "把关键信息藏进非默认 tab（R7）"
        ],
        "related": [
          "breadcrumb",
          "navigation-menu",
          "card"
        ]
      }
    },
    {
      "name": "textarea",
      "file": "apps/web/src/components/ui/textarea.tsx",
      "lines": 19,
      "exports": [
        "Textarea"
      ],
      "primitives": [],
      "slots": [
        "textarea"
      ],
      "props": [
        "React.ComponentProps<\"textarea\">"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 14,
        "files": [
          "apps/web/src/components/ui/input-group.tsx",
          "apps/web/src/features/comic/CharacterStage.tsx",
          "apps/web/src/features/comic/NewProjectDialog.tsx",
          "apps/web/src/features/comic/ProjectCharacterLibrary.tsx",
          "apps/web/src/features/comic/ProjectPropLibrary.tsx",
          "apps/web/src/features/comic/ProjectSceneLibrary.tsx",
          "apps/web/src/features/comic/StylePickerDialog.tsx",
          "apps/web/src/features/comic/asset/AssetPromptCard.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx",
          "apps/web/src/features/genworkbench/MentionTextarea.tsx",
          "apps/web/src/features/rules/PromptRulesTab.tsx",
          "apps/web/src/pages/RulesCenterPage.tsx",
          "apps/web/src/pages/ShotLanguage.tsx",
          "apps/web/src/pages/StyleLibraryPage.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "数据录入",
      "notes": {
        "when": "多行文本录入（提示词、剧情文本、备注）",
        "avoid": "单行短文本用 input；只读长文本用普通段落",
        "antiPatterns": [
          "用 input 装长提示词致横向滚动（UC-006）",
          "固定 rows 过小且不可自适应（UC-004）"
        ],
        "related": [
          "input",
          "field",
          "label"
        ]
      }
    },
    {
      "name": "tooltip",
      "file": "apps/web/src/components/ui/tooltip.tsx",
      "lines": 62,
      "exports": [
        "Tooltip",
        "TooltipTrigger",
        "TooltipContent",
        "TooltipProvider"
      ],
      "primitives": [
        "@radix-ui/react-tooltip"
      ],
      "slots": [
        "tooltip-provider",
        "tooltip",
        "tooltip-trigger",
        "tooltip-content"
      ],
      "props": [
        "React.ComponentProps<typeof TooltipPrimitive.Provider>",
        "React.ComponentProps<typeof TooltipPrimitive.Root>",
        "React.ComponentProps<typeof TooltipPrimitive.Trigger>",
        "React.ComponentProps<typeof TooltipPrimitive.Content>"
      ],
      "asChild": false,
      "variants": [],
      "usage": {
        "count": 2,
        "files": [
          "apps/web/src/components/ui/sidebar.tsx",
          "apps/web/src/features/genworkbench/CreateWorkbench.tsx"
        ]
      },
      "dead": false,
      "tokens": [],
      "category": "反馈",
      "notes": {
        "when": "为图标按钮或缩写补充一句短说明或快捷键提示",
        "avoid": "内容多行或需交互时用 popover（tooltip 不可交互）",
        "antiPatterns": [
          "把必读长文案塞进 tooltip（移动端触发不到）（UC-005）",
          "用 tooltip 替代 label 标注表单（FE-A11Y-002）"
        ],
        "related": [
          "popover",
          "kbd",
          "button"
        ]
      }
    }
  ],
  "tokens": [
    {
      "name": "--button-outline",
      "light": "rgba(0,0,0, .10)",
      "dark": "rgba(255,255,255, .14)",
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--badge-outline",
      "light": "rgba(0,0,0, .05)",
      "dark": "rgba(255,255,255, .08)",
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--opaque-button-border-intensity",
      "light": "-8",
      "dark": null,
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--elevate-1",
      "light": "rgba(0,0,0, .03)",
      "dark": "rgba(255,255,255, .045)",
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--elevate-2",
      "light": "rgba(0,0,0, .08)",
      "dark": "rgba(255,255,255, .09)",
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--background",
      "light": "hsl(40 33% 97%)",
      "dark": "hsl(222 18% 7%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-background"
      ]
    },
    {
      "name": "--foreground",
      "light": "hsl(24 12% 12%)",
      "dark": "hsl(220 12% 90%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-foreground"
      ]
    },
    {
      "name": "--card",
      "light": "hsl(0 0% 100%)",
      "dark": "hsl(222 15% 10%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-card"
      ]
    },
    {
      "name": "--card-foreground",
      "light": "hsl(24 12% 12%)",
      "dark": "hsl(220 12% 90%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-card-foreground"
      ]
    },
    {
      "name": "--card-border",
      "light": "hsl(40 12% 87%)",
      "dark": "hsl(222 10% 18%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-card-border"
      ]
    },
    {
      "name": "--popover",
      "light": "hsl(0 0% 100%)",
      "dark": "hsl(222 15% 10%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-popover"
      ]
    },
    {
      "name": "--popover-foreground",
      "light": "hsl(24 12% 12%)",
      "dark": "hsl(220 12% 90%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-popover-foreground"
      ]
    },
    {
      "name": "--primary",
      "light": "hsl(28 88% 50%)",
      "dark": "hsl(32 95% 56%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-primary"
      ]
    },
    {
      "name": "--primary-foreground",
      "light": "hsl(40 40% 98%)",
      "dark": "hsl(222 18% 8%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-primary-foreground"
      ]
    },
    {
      "name": "--secondary",
      "light": "hsl(40 18% 93%)",
      "dark": "hsl(222 12% 16%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-secondary"
      ]
    },
    {
      "name": "--secondary-foreground",
      "light": "hsl(24 12% 16%)",
      "dark": "hsl(220 12% 92%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-secondary-foreground"
      ]
    },
    {
      "name": "--muted",
      "light": "hsl(40 16% 94%)",
      "dark": "hsl(222 12% 15%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-muted"
      ]
    },
    {
      "name": "--muted-foreground",
      "light": "hsl(26 8% 45%)",
      "dark": "hsl(220 8% 60%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-muted-foreground"
      ]
    },
    {
      "name": "--accent",
      "light": "hsl(38 85% 91%)",
      "dark": "hsl(222 12% 17%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-accent"
      ]
    },
    {
      "name": "--accent-foreground",
      "light": "hsl(28 55% 28%)",
      "dark": "hsl(32 90% 62%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-accent-foreground"
      ]
    },
    {
      "name": "--info",
      "light": "hsl(221 83% 53%)",
      "dark": "hsl(210 80% 58%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-info"
      ]
    },
    {
      "name": "--info-foreground",
      "light": "hsl(230 100% 98%)",
      "dark": "hsl(230 100% 98%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-info-foreground"
      ]
    },
    {
      "name": "--destructive",
      "light": "hsl(4 78% 56%)",
      "dark": "hsl(4 74% 56%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-destructive"
      ]
    },
    {
      "name": "--destructive-foreground",
      "light": "hsl(0 0% 100%)",
      "dark": "hsl(0 0% 100%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-destructive-foreground"
      ]
    },
    {
      "name": "--success",
      "light": "hsl(140 48% 40%)",
      "dark": "hsl(140 45% 52%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-success"
      ]
    },
    {
      "name": "--success-foreground",
      "light": "hsl(115 77% 97%)",
      "dark": "hsl(115 77% 97%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-success-foreground"
      ]
    },
    {
      "name": "--warning",
      "light": "hsl(32 92% 46%)",
      "dark": "hsl(32 90% 55%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-warning"
      ]
    },
    {
      "name": "--warning-foreground",
      "light": "hsl(33 100% 96%)",
      "dark": "hsl(33 100% 96%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-warning-foreground"
      ]
    },
    {
      "name": "--border",
      "light": "hsl(40 12% 87%)",
      "dark": "hsl(222 10% 18%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-border"
      ]
    },
    {
      "name": "--input",
      "light": "hsl(40 12% 87%)",
      "dark": "hsl(222 10% 18%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-input"
      ]
    },
    {
      "name": "--ring",
      "light": "hsl(28 88% 50%)",
      "dark": "hsl(32 95% 56%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-ring"
      ]
    },
    {
      "name": "--chart-1",
      "light": "hsl(28 88% 50%)",
      "dark": "hsl(32 95% 56%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-chart-1"
      ]
    },
    {
      "name": "--chart-2",
      "light": "hsl(200 70% 46%)",
      "dark": "hsl(210 70% 56%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-chart-2"
      ]
    },
    {
      "name": "--chart-3",
      "light": "hsl(140 48% 40%)",
      "dark": "hsl(140 45% 52%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-chart-3"
      ]
    },
    {
      "name": "--chart-4",
      "light": "hsl(320 60% 52%)",
      "dark": "hsl(320 60% 60%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-chart-4"
      ]
    },
    {
      "name": "--chart-5",
      "light": "hsl(45 90% 48%)",
      "dark": "hsl(45 90% 55%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-chart-5"
      ]
    },
    {
      "name": "--sidebar",
      "light": "hsl(40 30% 96%)",
      "dark": "hsl(222 16% 9%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-sidebar"
      ]
    },
    {
      "name": "--sidebar-foreground",
      "light": "hsl(24 12% 14%)",
      "dark": "hsl(220 12% 90%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-sidebar-foreground"
      ]
    },
    {
      "name": "--sidebar-primary",
      "light": "hsl(28 88% 50%)",
      "dark": "hsl(32 95% 56%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-sidebar-primary"
      ]
    },
    {
      "name": "--sidebar-primary-foreground",
      "light": "hsl(40 40% 98%)",
      "dark": "hsl(222 18% 8%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-sidebar-primary-foreground"
      ]
    },
    {
      "name": "--sidebar-accent",
      "light": "hsl(40 20% 90%)",
      "dark": "hsl(222 12% 15%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-sidebar-accent"
      ]
    },
    {
      "name": "--sidebar-accent-foreground",
      "light": "hsl(28 60% 32%)",
      "dark": "hsl(32 90% 62%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-sidebar-accent-foreground"
      ]
    },
    {
      "name": "--sidebar-border",
      "light": "hsl(40 12% 87%)",
      "dark": "hsl(222 10% 16%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-sidebar-border"
      ]
    },
    {
      "name": "--sidebar-ring",
      "light": "hsl(28 88% 50%)",
      "dark": "hsl(32 95% 56%)",
      "group": "色彩 / 表面",
      "utilities": [
        "--color-sidebar-ring"
      ]
    },
    {
      "name": "--primary-border",
      "light": "hsl(from hsl(221 83% 53%) h s calc(l + var(--opaque-button-border-intensity)))",
      "dark": null,
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--secondary-border",
      "light": "hsl(from hsl(220 14% 96%) h s calc(l + var(--opaque-button-border-intensity)))",
      "dark": null,
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--destructive-border",
      "light": "hsl(from hsl(2 84% 62%) h s calc(l + var(--opaque-button-border-intensity)))",
      "dark": null,
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--accent-border",
      "light": "hsl(from hsl(220 14% 96%) h s calc(l + var(--opaque-button-border-intensity)))",
      "dark": null,
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--muted-border",
      "light": "hsl(from hsl(220 14% 96%) h s calc(l + var(--opaque-button-border-intensity)))",
      "dark": null,
      "group": "色彩 / 表面",
      "utilities": []
    },
    {
      "name": "--font-sans",
      "light": "'LarkHackSafariFont', 'LarkEmojiFont', 'LarkChineseQuote', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'Tahoma', 'PingFang SC', 'Microsoft Yahei', 'Arial', 'Hiragino Sans GB', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
      "dark": null,
      "group": "字体 / 排版",
      "utilities": [
        "--font-sans"
      ]
    },
    {
      "name": "--font-serif",
      "light": "'Geist', 'Geist Fallback', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
      "dark": null,
      "group": "字体 / 排版",
      "utilities": [
        "--font-serif"
      ]
    },
    {
      "name": "--font-mono",
      "light": "'IBM Plex Mono', 'Source Code Pro', monospace",
      "dark": null,
      "group": "字体 / 排版",
      "utilities": [
        "--font-mono"
      ]
    },
    {
      "name": "--radius",
      "light": "0.5rem",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--radius-sm",
        "--radius-md",
        "--radius-lg",
        "--radius-xl"
      ]
    },
    {
      "name": "--shadow-x",
      "light": "0px",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": []
    },
    {
      "name": "--shadow-y",
      "light": "2px",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": []
    },
    {
      "name": "--shadow-blur",
      "light": "12px",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": []
    },
    {
      "name": "--shadow-spread",
      "light": "0px",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": []
    },
    {
      "name": "--shadow-opacity",
      "light": "0.02",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": []
    },
    {
      "name": "--shadow-color",
      "light": "#000000",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": []
    },
    {
      "name": "--duration-instant",
      "light": "80ms",
      "dark": null,
      "group": "动效",
      "utilities": [
        "--duration-instant"
      ]
    },
    {
      "name": "--duration-fast",
      "light": "150ms",
      "dark": null,
      "group": "动效",
      "utilities": [
        "--duration-fast"
      ]
    },
    {
      "name": "--duration-base",
      "light": "200ms",
      "dark": null,
      "group": "动效",
      "utilities": [
        "--duration-base"
      ]
    },
    {
      "name": "--duration-slow",
      "light": "250ms",
      "dark": null,
      "group": "动效",
      "utilities": [
        "--duration-slow"
      ]
    },
    {
      "name": "--ease-standard",
      "light": "cubic-bezier(0.2, 0, 0, 1)",
      "dark": null,
      "group": "动效",
      "utilities": [
        "--ease-standard"
      ]
    },
    {
      "name": "--ease-decelerate",
      "light": "cubic-bezier(0, 0, 0, 1)",
      "dark": null,
      "group": "动效",
      "utilities": [
        "--ease-decelerate"
      ]
    },
    {
      "name": "--ease-accelerate",
      "light": "cubic-bezier(0.3, 0, 1, 1)",
      "dark": null,
      "group": "动效",
      "utilities": [
        "--ease-accelerate"
      ]
    },
    {
      "name": "--shadow-2xs",
      "light": "0px 2px 12px 0px hsl(0 0% 0% / 0.01)",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--shadow-2xs"
      ]
    },
    {
      "name": "--shadow-xs",
      "light": "0px 2px 12px 0px hsl(0 0% 0% / 0.01)",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--shadow-xs"
      ]
    },
    {
      "name": "--shadow-sm",
      "light": "0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 1px 2px -1px hsl(0 0% 0% / 0.02)",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--shadow-sm"
      ]
    },
    {
      "name": "--shadow",
      "light": "0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 1px 2px -1px hsl(0 0% 0% / 0.02)",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--shadow"
      ]
    },
    {
      "name": "--shadow-md",
      "light": "0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 2px 4px -1px hsl(0 0% 0% / 0.02)",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--shadow-md"
      ]
    },
    {
      "name": "--shadow-lg",
      "light": "0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 4px 6px -1px hsl(0 0% 0% / 0.02)",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--shadow-lg"
      ]
    },
    {
      "name": "--shadow-xl",
      "light": "0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 8px 10px -1px hsl(0 0% 0% / 0.02)",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--shadow-xl"
      ]
    },
    {
      "name": "--shadow-2xl",
      "light": "0px 2px 12px 0px hsl(0 0% 0% / 0.05)",
      "dark": null,
      "group": "圆角 / 阴影",
      "utilities": [
        "--shadow-2xl"
      ]
    },
    {
      "name": "--tracking-normal",
      "light": "0em",
      "dark": null,
      "group": "字体 / 排版",
      "utilities": []
    },
    {
      "name": "--spacing",
      "light": "0.25rem",
      "dark": null,
      "group": "间距 / 尺寸",
      "utilities": []
    }
  ],
  "missingNotes": [],
  "missingDemos": [],
  "unknownNotes": [],
  "themeUtilities": [
    {
      "name": "--color-background",
      "value": "var(--background)",
      "group": "色彩"
    },
    {
      "name": "--color-foreground",
      "value": "var(--foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-card",
      "value": "var(--card)",
      "group": "色彩"
    },
    {
      "name": "--color-card-foreground",
      "value": "var(--card-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-card-border",
      "value": "var(--card-border)",
      "group": "色彩"
    },
    {
      "name": "--color-popover",
      "value": "var(--popover)",
      "group": "色彩"
    },
    {
      "name": "--color-popover-foreground",
      "value": "var(--popover-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-primary",
      "value": "var(--primary)",
      "group": "色彩"
    },
    {
      "name": "--color-primary-foreground",
      "value": "var(--primary-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-secondary",
      "value": "var(--secondary)",
      "group": "色彩"
    },
    {
      "name": "--color-secondary-foreground",
      "value": "var(--secondary-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-muted",
      "value": "var(--muted)",
      "group": "色彩"
    },
    {
      "name": "--color-muted-foreground",
      "value": "var(--muted-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-accent",
      "value": "var(--accent)",
      "group": "色彩"
    },
    {
      "name": "--color-accent-foreground",
      "value": "var(--accent-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-info",
      "value": "var(--info)",
      "group": "色彩"
    },
    {
      "name": "--color-info-foreground",
      "value": "var(--info-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-destructive",
      "value": "var(--destructive)",
      "group": "色彩"
    },
    {
      "name": "--color-destructive-foreground",
      "value": "var(--destructive-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-success",
      "value": "var(--success)",
      "group": "色彩"
    },
    {
      "name": "--color-success-foreground",
      "value": "var(--success-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-warning",
      "value": "var(--warning)",
      "group": "色彩"
    },
    {
      "name": "--color-warning-foreground",
      "value": "var(--warning-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-border",
      "value": "var(--border)",
      "group": "色彩"
    },
    {
      "name": "--color-input",
      "value": "var(--input)",
      "group": "色彩"
    },
    {
      "name": "--color-ring",
      "value": "var(--ring)",
      "group": "色彩"
    },
    {
      "name": "--color-chart-1",
      "value": "var(--chart-1)",
      "group": "色彩"
    },
    {
      "name": "--color-chart-2",
      "value": "var(--chart-2)",
      "group": "色彩"
    },
    {
      "name": "--color-chart-3",
      "value": "var(--chart-3)",
      "group": "色彩"
    },
    {
      "name": "--color-chart-4",
      "value": "var(--chart-4)",
      "group": "色彩"
    },
    {
      "name": "--color-chart-5",
      "value": "var(--chart-5)",
      "group": "色彩"
    },
    {
      "name": "--color-sidebar",
      "value": "var(--sidebar)",
      "group": "色彩"
    },
    {
      "name": "--color-sidebar-foreground",
      "value": "var(--sidebar-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-sidebar-primary",
      "value": "var(--sidebar-primary)",
      "group": "色彩"
    },
    {
      "name": "--color-sidebar-primary-foreground",
      "value": "var(--sidebar-primary-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-sidebar-accent",
      "value": "var(--sidebar-accent)",
      "group": "色彩"
    },
    {
      "name": "--color-sidebar-accent-foreground",
      "value": "var(--sidebar-accent-foreground)",
      "group": "色彩"
    },
    {
      "name": "--color-sidebar-border",
      "value": "var(--sidebar-border)",
      "group": "色彩"
    },
    {
      "name": "--color-sidebar-ring",
      "value": "var(--sidebar-ring)",
      "group": "色彩"
    },
    {
      "name": "--font-sans",
      "value": "var(--font-sans)",
      "group": "字体"
    },
    {
      "name": "--font-mono",
      "value": "var(--font-mono)",
      "group": "字体"
    },
    {
      "name": "--font-serif",
      "value": "var(--font-serif)",
      "group": "字体"
    },
    {
      "name": "--radius-sm",
      "value": "calc(var(--radius) - 4px)",
      "group": "圆角"
    },
    {
      "name": "--radius-md",
      "value": "calc(var(--radius) - 2px)",
      "group": "圆角"
    },
    {
      "name": "--radius-lg",
      "value": "var(--radius)",
      "group": "圆角"
    },
    {
      "name": "--radius-xl",
      "value": "calc(var(--radius) + 4px)",
      "group": "圆角"
    },
    {
      "name": "--duration-instant",
      "value": "var(--duration-instant)",
      "group": "其他"
    },
    {
      "name": "--duration-fast",
      "value": "var(--duration-fast)",
      "group": "其他"
    },
    {
      "name": "--duration-base",
      "value": "var(--duration-base)",
      "group": "其他"
    },
    {
      "name": "--duration-slow",
      "value": "var(--duration-slow)",
      "group": "其他"
    },
    {
      "name": "--ease-standard",
      "value": "var(--ease-standard)",
      "group": "其他"
    },
    {
      "name": "--ease-decelerate",
      "value": "var(--ease-decelerate)",
      "group": "其他"
    },
    {
      "name": "--ease-accelerate",
      "value": "var(--ease-accelerate)",
      "group": "其他"
    },
    {
      "name": "--shadow-2xs",
      "value": "var(--shadow-2xs)",
      "group": "阴影"
    },
    {
      "name": "--shadow-xs",
      "value": "var(--shadow-xs)",
      "group": "阴影"
    },
    {
      "name": "--shadow-sm",
      "value": "var(--shadow-sm)",
      "group": "阴影"
    },
    {
      "name": "--shadow",
      "value": "var(--shadow)",
      "group": "其他"
    },
    {
      "name": "--shadow-md",
      "value": "var(--shadow-md)",
      "group": "阴影"
    },
    {
      "name": "--shadow-lg",
      "value": "var(--shadow-lg)",
      "group": "阴影"
    },
    {
      "name": "--shadow-xl",
      "value": "var(--shadow-xl)",
      "group": "阴影"
    },
    {
      "name": "--shadow-2xl",
      "value": "var(--shadow-2xl)",
      "group": "阴影"
    },
    {
      "name": "--text-4xs",
      "value": "0.5625rem",
      "group": "字号"
    },
    {
      "name": "--text-3xs",
      "value": "0.625rem",
      "group": "字号"
    },
    {
      "name": "--text-2xs",
      "value": "0.6875rem",
      "group": "字号"
    },
    {
      "name": "--text-md",
      "value": "0.8125rem",
      "group": "字号"
    }
  ],
  "typography": {
    "plugin": "@tailwindcss/typography",
    "prose": [
      {
        "name": "--tw-prose-body",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-headings",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-lead",
        "value": "var(--muted-foreground)"
      },
      {
        "name": "--tw-prose-links",
        "value": "var(--primary)"
      },
      {
        "name": "--tw-prose-bold",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-counters",
        "value": "var(--muted-foreground)"
      },
      {
        "name": "--tw-prose-bullets",
        "value": "var(--primary)"
      },
      {
        "name": "--tw-prose-hr",
        "value": "var(--border)"
      },
      {
        "name": "--tw-prose-quotes",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-quote-borders",
        "value": "var(--border)"
      },
      {
        "name": "--tw-prose-captions",
        "value": "var(--muted-foreground)"
      },
      {
        "name": "--tw-prose-kbd",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-kbd-shadows",
        "value": "--alpha(var(--foreground) / 90%)"
      },
      {
        "name": "--tw-prose-code",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-pre-code",
        "value": "var(--accent-foreground)"
      },
      {
        "name": "--tw-prose-pre-bg",
        "value": "var(--accent)"
      },
      {
        "name": "--tw-prose-th-borders",
        "value": "var(--border)"
      },
      {
        "name": "--tw-prose-td-borders",
        "value": "var(--border)"
      },
      {
        "name": "--tw-prose-invert-body",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-invert-headings",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-invert-lead",
        "value": "var(--muted-foreground)"
      },
      {
        "name": "--tw-prose-invert-links",
        "value": "var(--primary)"
      },
      {
        "name": "--tw-prose-invert-bold",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-invert-counters",
        "value": "var(--muted-foreground)"
      },
      {
        "name": "--tw-prose-invert-bullets",
        "value": "var(--primary)"
      },
      {
        "name": "--tw-prose-invert-hr",
        "value": "var(--border)"
      },
      {
        "name": "--tw-prose-invert-quotes",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-invert-quote-borders",
        "value": "var(--border)"
      },
      {
        "name": "--tw-prose-invert-captions",
        "value": "var(--muted-foreground)"
      },
      {
        "name": "--tw-prose-invert-kbd",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-invert-kbd-shadows",
        "value": "--alpha(var(--foreground) / 90%)"
      },
      {
        "name": "--tw-prose-invert-code",
        "value": "var(--foreground)"
      },
      {
        "name": "--tw-prose-invert-pre-code",
        "value": "var(--accent-foreground)"
      },
      {
        "name": "--tw-prose-invert-pre-bg",
        "value": "var(--accent)"
      },
      {
        "name": "--tw-prose-invert-th-borders",
        "value": "var(--border)"
      },
      {
        "name": "--tw-prose-invert-td-borders",
        "value": "var(--border)"
      }
    ]
  },
  "scales": {
    "scannedFiles": 195,
    "text": [
      {
        "value": "xs",
        "count": 382
      },
      {
        "value": "sm",
        "count": 205
      },
      {
        "value": "lg",
        "count": 16
      },
      {
        "value": "base",
        "count": 10
      },
      {
        "value": "xl",
        "count": 3
      },
      {
        "value": "2xl",
        "count": 1
      },
      {
        "value": "6xl",
        "count": 1
      }
    ],
    "textArbitrary": [
      {
        "value": "0.8rem",
        "count": 2
      }
    ],
    "spacing": [
      {
        "value": "2",
        "count": 735
      },
      {
        "value": "3",
        "count": 451
      },
      {
        "value": "1",
        "count": 450
      },
      {
        "value": "1.5",
        "count": 331
      },
      {
        "value": "4",
        "count": 262
      },
      {
        "value": "0.5",
        "count": 119
      },
      {
        "value": "2.5",
        "count": 87
      },
      {
        "value": "6",
        "count": 74
      },
      {
        "value": "0",
        "count": 35
      },
      {
        "value": "5",
        "count": 30
      },
      {
        "value": "8",
        "count": 20
      },
      {
        "value": "10",
        "count": 10
      },
      {
        "value": "12",
        "count": 9
      },
      {
        "value": "7",
        "count": 6
      },
      {
        "value": "3.5",
        "count": 4
      },
      {
        "value": "16",
        "count": 4
      },
      {
        "value": "14",
        "count": 3
      },
      {
        "value": "9",
        "count": 1
      },
      {
        "value": "11",
        "count": 1
      },
      {
        "value": "20",
        "count": 1
      },
      {
        "value": "24",
        "count": 1
      }
    ],
    "spacingArbitrary": [
      {
        "value": "-0.45rem",
        "count": 2
      },
      {
        "value": "-0.35rem",
        "count": 2
      }
    ],
    "radius": [
      {
        "value": "lg",
        "count": 192
      },
      {
        "value": "xl",
        "count": 170
      },
      {
        "value": "DEFAULT",
        "count": 105
      },
      {
        "value": "md",
        "count": 91
      },
      {
        "value": "full",
        "count": 69
      },
      {
        "value": "2xl",
        "count": 27
      },
      {
        "value": "sm",
        "count": 9
      },
      {
        "value": "none",
        "count": 5
      },
      {
        "value": "3xl",
        "count": 4
      }
    ],
    "radiusArbitrary": [
      {
        "value": "2px",
        "count": 3
      },
      {
        "value": "calc(var(--radius)-5px)",
        "count": 3
      },
      {
        "value": "4px",
        "count": 1
      },
      {
        "value": "inherit",
        "count": 1
      }
    ],
    "shadow": [
      {
        "value": "DEFAULT",
        "count": 61
      },
      {
        "value": "md",
        "count": 30
      },
      {
        "value": "lg",
        "count": 27
      },
      {
        "value": "sm",
        "count": 13
      },
      {
        "value": "xs",
        "count": 5
      },
      {
        "value": "2xl",
        "count": 5
      },
      {
        "value": "none",
        "count": 3
      },
      {
        "value": "xl",
        "count": 2
      }
    ],
    "shadowArbitrary": [
      {
        "value": "0_0_0_1px_hsl(var(--sidebar-border))",
        "count": 1
      },
      {
        "value": "0_0_0_1px_hsl(var(--sidebar-accent))",
        "count": 1
      }
    ],
    "leading": [
      {
        "value": "relaxed",
        "count": 63
      },
      {
        "value": "none",
        "count": 8
      },
      {
        "value": "5",
        "count": 7
      },
      {
        "value": "snug",
        "count": 4
      },
      {
        "value": "4",
        "count": 2
      },
      {
        "value": "normal",
        "count": 2
      },
      {
        "value": "tight",
        "count": 1
      }
    ],
    "tracking": [
      {
        "value": "wider",
        "count": 7
      },
      {
        "value": "wide",
        "count": 7
      },
      {
        "value": "tight",
        "count": 5
      },
      {
        "value": "widest",
        "count": 4
      }
    ]
  },
  "themeUtilityCount": 65
};
