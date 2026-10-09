// 导演阶段产物：表演基调 / 场次状态变体 / 调度与镜头方案 / 可执行单元与资产
// 分镜基于剧本 Script IR（场次/动作/对白）派生，导演解读填充视觉/表演/镜头语言；产物均停在 AWAITING_USER，需用户确认
import type { ConfirmedItem, Episode, ExecutionTarget, ShotCard, UnitItem } from '@/types';
import { buildAssetsFromInterpret, contextFor } from '@/mocks/assets';
import { parseScript, getEpisodeScriptText } from '@/config/script/script-parser';
import { useProjectStore } from '@/stores/useProjectStore';

/** 角色表演基调（声音气质 / 肢体特征 / 情绪基线 / 人物弧线）——角色阶段产物 */
export function buildPerformance(episode: Episode): ConfirmedItem[] {
  return buildAssetsFromInterpret(episode).filter((a) => a.kind === 'character').map((asset, c) => {
    const name = asset.name;
    return {
      id: `${episode.id}-perf-${c + 1}`,
      label: `${name} · 表演基调`,
      detail: `声音：${c % 2 === 0 ? '低沉克制，语速偏慢' : '清亮但带倦意，句尾常放低'}；肢体：${
        c % 3 === 0 ? '习惯整理袖口，站立重心偏后' : c % 3 === 1 ? '动作幅度小，手部动作克制' : '步态缓慢，视线回避'
      }；情绪基线：${c % 2 === 0 ? '警惕但克制' : '疲惫中带执念'}；人物弧线：本集从被动接受到主动抉择。`,
      status: 'AWAITING_USER',
    };
  });
}

/** 场次状态变体（同一空间的 时间/天气/光线/氛围 状态差异）——场景阶段产物 */
export function buildSceneVariants(episode: Episode): ConfirmedItem[] {
  const context = contextFor(episode.projectId);
  return buildAssetsFromInterpret(episode).filter((a) => a.kind === 'scene').map((asset, s) => {
    const name = asset.name;
    return {
      id: `${episode.id}-var-${s + 1}`,
      label: `${name} · 场次状态变体`,
      detail: `空间：${asset.description}。基调：${context.lookAndFeel.tone}。状态 A：建立空间；状态 B：剧情推进后的光线与道具变化（待核实）。切换须按本集原文确认。`,
      status: 'AWAITING_USER',
    };
  });
}

/** 分镜设计产物（镜头卡 8 域：基于剧本 Script IR 派生，导演解读填充视觉/表演/镜头语言） */
export function buildDirecting(episode: Episode, target?: ExecutionTarget): ShotCard[] {
  const maxUnit = target?.maxUnitSeconds ?? 15;
  const context = contextFor(episode.projectId);
  const di = episode.interpretation?.directorInterpretation;
  // 导演解读的视觉基调用于填充镜头的光影色彩
  const diColor = di?.visualTone?.colorPalette ?? context.lookAndFeel.tone;
  const diLighting = di?.visualTone?.lighting ?? '';

  // 获取剧本原文并解析为 Script IR
  const project = useProjectStore.getState().projects.find((p) => p.id === episode.projectId);
  const scriptText = getEpisodeScriptText(episode, project?.sourceVersions, project?.currentSourceVersion);
  const ir = scriptText.trim() ? parseScript(scriptText) : null;

  const checklistLabels = [
    '人物身份/三视图匹配',
    '人物位置/朝向明确',
    '动作顺序完整且能跑完',
    '道具数量与状态无误',
    '景别/机位符合要求',
    '对白原文无改动',
    '不可逆状态无回退',
    '收尾状态可作为下镜继承源',
  ];

  // 如果没有解析到场次，回退到旧的 mock 逻辑
  if (!ir || ir.scenes.length === 0) {
    const sceneName = buildAssetsFromInterpret(episode).find((a) => a.kind === 'scene')?.name ?? '本集场景';
    const charName = buildAssetsFromInterpret(episode).find((a) => a.kind === 'character')?.name ?? '本集角色';
    const shotCount = maxUnit >= 30 ? 8 : 12;
    return Array.from({ length: shotCount }, (_, i) => buildMockShot(episode, i, sceneName, charName, context, maxUnit, checklistLabels));
  }

  // 基于剧本场次和动作行生成镜头
  const cards: ShotCard[] = [];
  let shotIndex = 0;

  ir.scenes.forEach((scene, sceneIdx) => {
    // 按动作行分组：连续的动作行 + 紧随其后的对白 组成一个镜头
    const groups: { actions: string[]; dialogues: { speaker: string; line: string; tone?: string }[]; subtitle?: string }[] = [];
    let currentGroup: { actions: string[]; dialogues: { speaker: string; line: string; tone?: string }[]; subtitle?: string } = { actions: [], dialogues: [] };

    for (const line of scene.lines) {
      if (line.kind === 'action') {
        // 如果当前组已有对白，先收尾
        if (currentGroup.dialogues.length > 0 && currentGroup.actions.length > 0) {
          groups.push(currentGroup);
          currentGroup = { actions: [], dialogues: [] };
        }
        currentGroup.actions.push(line.text);
      } else if (line.kind === 'dialogue') {
        currentGroup.dialogues.push({ speaker: line.speaker ?? '未知', line: line.text, tone: line.tone });
      } else if (line.kind === 'subtitle') {
        // 字幕作为独立镜头或附加到当前组
        if (currentGroup.actions.length > 0 || currentGroup.dialogues.length > 0) {
          groups.push(currentGroup);
          currentGroup = { actions: [], dialogues: [] };
        }
        groups.push({ actions: [], dialogues: [], subtitle: line.text });
      }
    }
    if (currentGroup.actions.length > 0 || currentGroup.dialogues.length > 0) {
      groups.push(currentGroup);
    }

    // 如果场次没有解析到任何行，生成一个占位镜头
    if (groups.length === 0) {
      groups.push({ actions: [`${scene.location ?? '场景'}内的动作（待导演补充）`], dialogues: [] });
    }

    // 为每个组生成一个镜头卡
    groups.forEach((group, groupIdx) => {
      shotIndex++;
      const mainAction = group.actions[0] ?? group.subtitle ?? `${scene.location ?? '场景'}内的事件`;
      const hasDialogue = group.dialogues.length > 0;
      const isSubtitleOnly = group.actions.length === 0 && group.subtitle;

      cards.push({
        id: `${episode.id}-shot-${shotIndex}`,
        index: shotIndex,
        sceneId: `ep${episode.index}-s${sceneIdx + 1}`,
        sceneLabel: `场次 ${scene.id}`,
        base: {
          storyTime: scene.time ?? (context.lookAndFeel.moodArc.includes('夜') ? '夜' : '日/黄昏'),
          location: scene.location ?? '本集场景',
          weather: '无特殊天气',
          ratio: '9:16',
          estSeconds: Math.min(maxUnit, hasDialogue ? 8 : 6),
        },
        refs: {
          characters: scene.characters.length > 0 ? scene.characters : (buildAssetsFromInterpret(episode).find((a) => a.kind === 'character')?.name ? [buildAssetsFromInterpret(episode).find((a) => a.kind === 'character')!.name] : []),
          scene: scene.location ?? '本集场景',
          props: [],
          style: '项目全局风格',
          other: [],
        },
        world: {
          characters: scene.characters.map((name, ci) => ({
            id: `${episode.id}-char-${ci + 1}`,
            name,
            position: ci % 2 === 0 ? '画面左侧' : '画面右侧',
            facing: '朝向镜头前方',
            headFacing: '与身体一致',
            gaze: hasDialogue ? '看向对话对象' : '看向前景',
            emotion: groupIdx === 0 ? '平静' : '紧绷',
            bodyState: '正常',
            costumeState: '整洁',
          })),
          props: [],
          sceneState: `「${scene.location ?? '场景'}」初始布局`,
          timeState: context.lookAndFeel.tone.includes('冷') ? '冷月光照入' : '环境光稳定',
          weatherState: '无',
          lightingState: `主光：${context.lookAndFeel.tone.includes('冷') ? '冷白' : '暖黄'}；环境光${context.lookAndFeel.tone.includes('低饱和') ? '低饱和' : '正常'}`,
          priorCause: shotIndex === 1 ? '本集开场，角色进入场景（从剧本开篇承接）' : `承接镜 ${shotIndex - 1} 收尾状态`,
        },
        event: {
          main: isSubtitleOnly ? group.subtitle ?? mainAction : mainAction,
          trigger: '镜头开始时即进入事件',
          steps: group.actions.length > 1 ? group.actions.slice(0, 3) : ['起势（初始姿态）', '执行核心动作', '完成并定格'],
          complete: '核心动作完成后画面定格',
          endPose: '角色停留在动作结束姿态',
        },
        acting: {
          characterId: `${episode.id}-char-1`,
          emotion: hasDialogue ? '对话中' : '平稳',
          intensity: groupIdx % 3 === 0 ? '轻微' : '中等',
          expression: hasDialogue ? '神态变化' : '保持基线神态',
          breathing: '平稳',
          gaze: hasDialogue ? '对焦对话对象' : '对焦目标（可编辑）',
          dialog: hasDialogue ? group.dialogues.map((d) => ({ speaker: d.speaker, line: d.line, tone: d.tone ?? '中性' })) : [],
        },
        camera: {
          shotSize: isSubtitleOnly ? '全景' : groupIdx % 4 === 0 ? '中景' : groupIdx % 4 === 2 ? '特写' : '近景',
          composition: groupIdx % 2 === 0 ? '中心构图' : '三分构图',
          lens: groupIdx % 3 === 0 ? '标准' : groupIdx % 3 === 1 ? '长焦' : '广角',
          movement: groupIdx % 4 === 0 ? '固定机位' : groupIdx % 4 === 3 ? '缓推' : '固定机位',
          movePurpose: '稳定呈现动作',
          cameraZone: '场景正面轴线区域',
        },
        visual: {
          keyLight: diLighting || (context.lookAndFeel.tone.includes('冷') ? '侧冷光' : '顶光'),
          quality: '柔光',
          colorTemp: diColor.includes('冷') || context.lookAndFeel.tone.includes('冷') ? '冷色调' : '暖色调',
          overallTone: diColor || context.lookAndFeel.tone,
          weatherFx: '无',
        },
        audio: {
          ambient: `「${scene.location ?? '场景'}」环境底噪`,
          sfx: hasDialogue ? '对白环境音' : '动作音效（待导演补充）',
          sync: '画面事件与音效因果同步',
        },
        causal: {
          priorNeeded: shotIndex === 1 ? '本集开场（无前置）' : `镜 ${shotIndex - 1} 收尾状态`,
          outcome: isSubtitleOnly ? `字幕展示：${group.subtitle}` : `${mainAction.substring(0, 20)}...完成`,
          nextAffect: `向镜 ${shotIndex + 1} 提供继承状态`,
          irreversible: [],
          endState: `${scene.characters[0] ?? '角色'}停留在动作结束姿态，空间关系保持`,
        },
        checklist: checklistLabels.map((label) => ({ label, ok: false })),
        status: 'AWAITING_USER',
      });
    });
  });

  return cards;
}

/** 旧版 mock 镜头生成（无剧本时回退） */
function buildMockShot(
  episode: Episode,
  i: number,
  sceneName: string,
  charName: string,
  context: ReturnType<typeof contextFor>,
  maxUnit: number,
  checklistLabels: string[],
): ShotCard {
  const sceneIdx = (i % 3) + 1;
  const beatKind = i % 4 === 0 ? '建立空间' : i % 4 === 1 ? '推进剧情' : i % 4 === 2 ? '情绪转折' : '收尾钩子';
  return {
    id: `${episode.id}-shot-${i + 1}`,
    index: i + 1,
    sceneId: `ep${episode.index}-s${sceneIdx}`,
    sceneLabel: `场次 ${episode.index}-${sceneIdx}`,
    base: {
      storyTime: context.lookAndFeel.moodArc.includes('夜') ? '夜' : '日/黄昏',
      location: sceneName,
      weather: '无特殊天气',
      ratio: '9:16',
      estSeconds: Math.min(maxUnit, 13) - (i % 2),
    },
    refs: { characters: [charName], scene: sceneName, props: [], style: '项目全局风格', other: [] },
    world: {
      characters: [{
        id: `${episode.id}-char-1`, name: charName,
        position: i % 2 === 0 ? '画面左侧' : '画面右侧', facing: '朝向镜头前方',
        headFacing: '与身体一致', gaze: i % 3 === 0 ? '看向前景道具' : '看向对话对象',
        emotion: i % 4 === 0 ? '平静' : i % 4 === 2 ? '压抑' : '紧绷',
        bodyState: '正常', costumeState: '整洁',
      }],
      props: [], sceneState: `「${sceneName}」初始布局`,
      timeState: context.lookAndFeel.tone.includes('冷') ? '冷月光照入' : '环境光稳定',
      weatherState: '无',
      lightingState: `主光：${context.lookAndFeel.tone.includes('冷') ? '冷白' : '暖黄'}；环境光${context.lookAndFeel.tone.includes('低饱和') ? '低饱和' : '正常'}`,
      priorCause: i === 0 ? '本集开场，角色进入场景（从剧本开篇承接）' : `承接镜 ${i} 收尾状态`,
    },
    event: {
      main: `${charName}完成「${beatKind}」动作（演示草案，导演需按剧本改写为唯一主视觉事件）`,
      trigger: '镜头开始时即进入事件',
      steps: ['起势（初始姿态）', '执行核心动作', '完成并定格'],
      complete: '核心动作完成后画面定格',
      endPose: '角色停留在动作结束姿态',
    },
    acting: {
      characterId: `${episode.id}-char-1`,
      emotion: i % 4 === 2 ? '情绪转折' : '平稳',
      intensity: i % 3 === 0 ? '轻微' : '中等',
      expression: i % 4 === 2 ? '神态变化' : '保持基线神态',
      breathing: '平稳', gaze: '对焦目标（可编辑）',
      dialog: i % 3 === 0 ? [{ speaker: charName, line: '（对白待按剧本原文填入）', tone: '中性' }] : [],
    },
    camera: {
      shotSize: i % 4 === 0 ? '全景' : i % 4 === 2 ? '特写' : '中景',
      composition: i % 2 === 0 ? '中心构图' : '三分构图',
      lens: i % 3 === 0 ? '标准' : i % 3 === 1 ? '长焦' : '广角',
      movement: i % 4 === 0 ? '固定机位' : i % 4 === 3 ? '缓推' : '固定机位',
      movePurpose: i % 4 === 3 ? '聚焦收尾钩子' : '稳定呈现动作',
      cameraZone: '场景正面轴线区域',
    },
    visual: {
      keyLight: context.lookAndFeel.tone.includes('冷') ? '侧冷光' : '顶光',
      quality: '柔光', colorTemp: context.lookAndFeel.tone.includes('冷') ? '冷色调' : '暖色调',
      overallTone: context.lookAndFeel.tone, weatherFx: '无',
    },
    audio: { ambient: `「${sceneName}」环境底噪`, sfx: '动作音效（待导演补充）', sync: '画面事件与音效因果同步' },
    causal: {
      priorNeeded: i === 0 ? '本集开场（无前置）' : `镜 ${i} 收尾状态`,
      outcome: `${beatKind}完成（演示草案）`,
      nextAffect: `向镜 ${i + 2} 提供继承状态`,
      irreversible: [], endState: `${charName}停留在动作结束姿态，空间关系保持`,
    },
    checklist: checklistLabels.map((label) => ({ label, ok: false })),
    status: 'AWAITING_USER',
  };
}

/** 可执行单元（EXECUTABLE：由已批准镜头卡按模型容量打包；镜头→单元三种映射 + 连续性台账） */
export function buildExecutableUnits(episode: Episode, target?: ExecutionTarget): UnitItem[] {
  const maxUnit = target?.maxUnitSeconds ?? 15;
  const unitCount = maxUnit >= 30 ? 3 : 5;
  const assets = buildAssetsFromInterpret(episode);
  const charName = assets.find((a) => a.kind === 'character')?.name ?? '本集角色';
  const sceneName = assets.find((a) => a.kind === 'scene')?.name ?? '本集场景';
  const propName = assets.find((a) => a.kind === 'prop')?.name;
  const cards = buildDirecting(episode, target); // 分镜表（镜头卡）
  const perUnit = Math.ceil(cards.length / unitCount);
  const mkAsset = (u: number, n: string, label: string): ConfirmedItem => ({
    id: `${episode.id}-ua-${u}-${n}`,
    label,
    detail: `计划引用「${n}」；当前为演示引用草稿，实际版本、文件哈希与上传绑定尚未校验。`,
    status: 'AWAITING_USER',
  });
  return Array.from({ length: unitCount }, (_, u) => {
    // 镜头→单元映射：连续镜头打包进同一单元（1镜=1单元 / 多镜=1单元；容量不足时 1 镜拆多单元在正式服务中按动作可恢复点再切）
    const shotIds = cards.slice(u * perUnit, (u + 1) * perUnit).map((c) => c.id);
    const tail = cards[Math.min((u + 1) * perUnit, cards.length) - 1];
    const continuityIn = u === 0 ? '本集开场（剧本开篇状态）' : `承接单元 ${u} 收尾：${cards[u * perUnit - 1]?.causal.endState ?? '上一单元尾态'}`;
    const continuityOut = tail?.causal.endState ?? `${charName}完成本段行动并定格`;
    return {
      id: `${episode.id}-unit-${u + 1}`,
      label: `单元 ${u + 1}`,
      durationSeconds: Math.min(maxUnit, maxUnit >= 30 ? 26 : 13) - (u % 2),
      coverage: `B${u * 2 + 1}–B${u * 2 + 2}，场次 ${(u % 3) + 1}`,
      shotCount: shotIds.length,
      shotIds,
      continuity: { in: continuityIn, out: continuityOut },
      exitState: continuityOut,
      assets: [
        mkAsset(u, charName, `角色四视图「${charName}」`),
        mkAsset(u, sceneName, `场景母版「${sceneName}」`),
        ...(propName && u % 2 === 0 ? [mkAsset(u, propName, `道具「${propName}」`)] : []),
      ],
      prompt: {
        text: `${sceneName}，${charName}${propName && u % 2 === 0 ? `完成「${propName}」交接` : '完成本段行动'}；${u === 0 ? '从计划首态进入' : `承接单元 ${u} 的计划尾态`}；首尾态、手部与道具状态须人工核实。`,
        status: 'AWAITING_USER',
      },
    };
  });
}
