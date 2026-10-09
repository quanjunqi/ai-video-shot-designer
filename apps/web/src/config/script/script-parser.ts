// 剧本解析器（Script IR · 规则引擎）
// 分层原则：EV/DLG/LOCK/场次是「剧本里本来就有的机械可提取事实」——确定性解析、100% 可追溯，供用户核对；
// 视觉基调/情绪/节拍等创作决策由导演解读（文本模型）基于本层产出，本层不替模型编造语义。
// 提取不到的标记为 unparsed 如实展示，禁止伪造事实。
// 输入：单集剧本原文（支持草稿 / 源版本切片）；输出：结构化 Script IR。

export interface ScriptLineIR {
  kind: 'action' | 'dialogue' | 'subtitle';
  speaker?: string; // 对白角色（含群消息/OS 等称呼）
  tone?: string; // 语气/媒介标注（括号内：声音沙哑 / 游戏文字 / OS…）
  text: string; // 行原文
}

export interface ScriptSceneIR {
  id: string; // 场次序号（如 "1-1" / 无编号时为生成 id）
  label: string; // 展示标题（场次：1-1）
  location?: string; // 地点（如 王力出租屋 / 游戏内·召唤师峡谷）
  time?: string; // 时间/内外（如 夜/内）
  characters: string[]; // 人物列表
  lines: ScriptLineIR[]; // 动作/对白/字幕行（按原文顺序）
  raw: string; // 场次原文段落（可追溯）
}

export interface ScriptIR {
  scenes: ScriptSceneIR[];
  /** EV：事件事实（动作行 + 字幕，机械提取） */
  evs: string[];
  /** DLG：对白（角色 (语气): 台词） */
  dlg: string[];
  /** LOCK：连续性锁定（场景级确定性 + 跨场次重复道具线索；语义锁定由解读层补充） */
  locks: { label: string; text: string }[];
  subtitles: string[];
  /** 未能按格式解析的行（如实标注，不猜） */
  unparsed: string[];
  /** 源文本（切片范围） */
  sourceText: string;
}

// ---- 规则（与 split-policy 的场次识别口径一致，支持 # 前缀）----
const SCENE_TITLE = /(?:^|\n)\s*#{0,3}\s*(?:场次|场景)\s*[:：]?\s*([\d一二三四五六七八九十]+(?:[-\s][\d一二三四五六七八九十]+)?)/;
const CHAPTER_LINE = /^\s*#{0,3}\s*第\s*[一二三四五六七八九十\d]+\s*[集回话]/; // 章节行（不入场次 body）
const LOCATION_LINE = /^\s*(?:地点|场景地点|空间)\s*[:：]\s*(.+)$/;
const TIME_LINE = /^\s*时间\s*[:：]\s*(.+)$/;
const TIME_LOCATION_LINE = /^\s*时间地点\s*[:：]\s*(.+)$/; // 合并格式：时间地点：游戏内·召唤师峡谷  内  夜
const CHARACTER_LINE = /^\s*(?:人物|角色)\s*[:：]\s*(.+)$/;
const DIALOGUE_LINE = /^\s*([^△【\s][^:：]{0,24}?)\s*(?:\(([^)]*)\))?\s*[:：]\s*(.+)$/;
const ACTION_LINE = /^\s*△\s*(.+)$/;
const SUBTITLE_LINE = /^\s*【([^】]+)】\s*$/;

/** 拆分场次：按「场次/场景」标题行切分；无标题时整体视为单场次 */
function splitScenes(text: string): { title: string; body: string }[] {
  const lines = text.split('\n');
  const scenes: { title: string; body: string }[] = [];
  let current: string[] = [];
  let currentTitle = '';
  const flush = () => {
    if (current.length || currentTitle) {
      scenes.push({ title: currentTitle, body: current.join('\n') });
      current = [];
      currentTitle = '';
    }
  };
  for (const line of lines) {
    const m = SCENE_TITLE.exec(line);
    if (m) {
      flush();
      currentTitle = line.trim();
    } else if (CHAPTER_LINE.test(line)) {
      // 章节行（第X集/回）只作分隔，不进入任何场次 body
      continue;
    } else {
      current.push(line);
    }
  }
  flush();
  if (scenes.length === 0) scenes.push({ title: '', body: text });
  return scenes;
}

/** 解析单场次：属性行（地点/时间/人物）→ 行级（动作/对白/字幕） */
function parseScene(idx: number, title: string, body: string): ScriptSceneIR {
  const idMatch = SCENE_TITLE.exec(title) ?? SCENE_TITLE.exec('场次：' + title.replace(/^\s*#{0,3}\s*(?:场次|场景)\s*[:：]?\s*/, ''));
  const scene: ScriptSceneIR = {
    id: idMatch?.[1] ?? `s${idx + 1}`,
    label: (title || `场次 ${idx + 1}`).replace(/^\s*#{0,3}\s*/, ''),
    characters: [],
    lines: [],
    raw: (title ? title + '\n' : '') + body,
  };
  const lines = body.split('\n');
  const attrLines: string[] = [];
  const bodyLines: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (LOCATION_LINE.test(t) || TIME_LINE.test(t) || TIME_LOCATION_LINE.test(t) || CHARACTER_LINE.test(t)) {
      attrLines.push(t);
    } else {
      bodyLines.push(line);
    }
  }
  for (const a of attrLines) {
    const loc = LOCATION_LINE.exec(a);
    const time = TIME_LINE.exec(a);
    const tl = TIME_LOCATION_LINE.exec(a);
    const ch = CHARACTER_LINE.exec(a);
    if (loc) scene.location = loc[1].trim();
    else if (time) scene.time = time[1].trim();
    else if (tl) {
      // 合并格式「地点  内/外  时间」：以 2+ 空格切分（地点可能自身含「内」，如 游戏内·召唤师峡谷）
      const raw = tl[1].trim();
      const segs = raw.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
      if (segs.length >= 2 && /内|外/.test(segs[1] ?? '')) {
        scene.location = segs[0];
        scene.time = segs.slice(1).join(' ');
      } else {
        scene.location = segs[0];
        scene.time = raw;
      }
    } else if (ch) {
      scene.characters = ch[1].split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  for (const line of bodyLines) {
    const t = line.trim();
    if (!t) continue;
    const sub = SUBTITLE_LINE.exec(t);
    if (sub) {
      scene.lines.push({ kind: 'subtitle', text: t });
      continue;
    }
    const act = ACTION_LINE.exec(t);
    if (act) {
      scene.lines.push({ kind: 'action', text: t });
      continue;
    }
    const dlg = DIALOGUE_LINE.exec(t);
    if (dlg && dlg[3] && dlg[3].trim()) {
      scene.lines.push({ kind: 'dialogue', speaker: dlg[1].trim(), tone: dlg[2]?.trim() || undefined, text: dlg[3].trim() });
      continue;
    }
    scene.lines.push({ kind: 'action', text: t }); // 未匹配的普通行按动作/描述行处理（仍可追溯）
  }
  return scene;
}

/** 跨场次重复道具线索（LOCK 的确定性部分）：在 ≥2 个场次的文本中重复出现的道具名词 */
function findRepeatedProps(scenes: ScriptSceneIR[]): string[] {
  const freq = new Map<string, number>();
  for (const s of scenes) {
    const seen = new Set<string>();
    for (const l of s.lines) {
      for (const m of l.text.matchAll(/([\u4e00-\u9fa5A-Za-z]{2,8}(?:手机|电脑|平板|外卖|餐盒|铜钱|怀表|票|板|信|终端|头盔|车|门|窗|灯|罐|盒子|奶茶|快递|枪|刀))/g)) {
        if (!seen.has(m[0])) {
          seen.add(m[0]);
          freq.set(m[0], (freq.get(m[0]) ?? 0) + 1);
        }
      }
    }
  }
  return [...freq.entries()].filter(([, n]) => n >= 2).map(([w]) => w);
}

/** 剧本解析主入口：确定性提取 EV/DLG/LOCK/场次/字幕 */
export function parseScript(text: string): ScriptIR {
  const scenes = splitScenes(text).map((s, i) => parseScene(i, s.title, s.body));
  const evs: string[] = [];
  const dlg: string[] = [];
  const subtitles: string[] = [];
  const unparsed: string[] = [];
  for (const s of scenes) {
    for (const l of s.lines) {
      if (l.kind === 'action' && l.text.startsWith('△')) evs.push(`${l.text.slice(1).trim()}（场次 ${s.id}）`);
      else if (l.kind === 'action') unparsed.push(l.text);
      else if (l.kind === 'subtitle') subtitles.push(l.text.replace(/^【|】$/g, ''));
      else if (l.kind === 'dialogue') {
        dlg.push(`${l.speaker}${l.tone ? `（${l.tone}）` : ''}：${l.text}`);
      }
    }
  }
  const locks: { label: string; text: string }[] = [];
  // 场景级连续性锁定（确定性：每个场次的地点/时间/人物）
  scenes.forEach((s) => {
    const parts = [s.location && `地点「${s.location}」`, s.time && `时间「${s.time}」`, s.characters.length && `人物【${s.characters.join('、')}】`].filter(Boolean);
    if (parts.length) locks.push({ label: `场次 ${s.id} 场景连续性`, text: parts.join(' · ') });
  });
  // 跨场次重复道具 → 道具状态锁定候选（机械线索；语义锁定由解读层确认）
  const props = findRepeatedProps(scenes);
  if (props.length) locks.push({ label: '跨场次重复道具（候选锁定）', text: props.join('、') + '（规则层线索，解读层确认状态）' });
  return { scenes, evs, dlg, locks, subtitles, unparsed, sourceText: text };
}

/** 单集剧本文本获取（草稿优先，否则源版本切片）——供解析/解读共用 */
export function getEpisodeScriptText(episode: { scriptDraft?: string; sourceSpan: { start: number; end: number } }, sourceVersions: { version: number; text: string }[] | undefined, currentSourceVersion?: number): string {
  const source = sourceVersions?.find((v) => v.version === currentSourceVersion);
  const slice = source ? source.text.slice(episode.sourceSpan.start, episode.sourceSpan.end) : '';
  const base = slice.length >= 40 ? slice : source?.text.slice(0, 600) ?? '';
  return episode.scriptDraft ?? base;
}
