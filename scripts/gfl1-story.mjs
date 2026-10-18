// Steam EN AVG compiler. Unknown grammar blocks playback; source rows retain IDs.
const supported = new Set([
  'Speaker',
  'speaker',
  'BIN',
  'BGM',
  'SE',
  'SE1',
  'SE2',
  '黑屏1',
  '黑屏2',
  '黑点1',
  '黑点2',
  '白屏1',
  '白屏2',
  '通讯框',
  '震屏',
  '震屏3',
  '睁眼',
  'Night',
  'night',
  'BIN_SlowIn',
  '下雪',
  '火焰销毁',
  'va11',
  'perfect',
  'good',
  '边框',
  'Shake',
  '立绘振动',
  'CGDelay',
  'c',
  '分支',
  '闪屏',
  'duration',
  'rate',
  'delay',
  'Pic',
  'CG',
  '回忆',
  '关闭蒙版',
  '火花',
  '关闭火花',
  '火花关闭',
  'Grey',
  'Position',
  'position',
  '名单',
  '名单2',
  '白屏闪光',
  '快跑',
  '拉伸',
  '平移',
  '打海猫2',
  '开火',
  'common_effect',
  '同时置暗',
  '同时点亮',
  '同时置亮',
  'narrator',
  '刮花',
  'GradientShow',
  'GradientHide',
  'controll_shake',
  'Scale',
  'bg_move',
  'hide_dialogue',
  'Delay',
  '睁眼2',
  'CloseOldEffect',
  'InputBox',
  'ShootPanel',
  'branchstyle',
  'tips',
  't',
  'cg',
  'r',
  'true',
]);
const scene = { background: 'platform', actors: [], window: 'dialogue' };
const plain = (value) =>
  value
    .replaceAll('+', '\n')
    .replace(/\\n|\/\/n/g, '\n')
    .trim();
const locale = (value) => ({ en: value, 'zh-CN': value });
const copy = (value) => structuredClone(value);
const parameters = (value) =>
  Object.fromEntries(
    [...value.matchAll(/%%([^=%]+)=([^%]*)/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
const sourceContinuations = new Map([
  ['-74-S-4:11', 'They got stuck with a pack of liars instead.'],
  [
    '-74-S-7:12',
    'I stared greedily out the window at the houses, the trees, the fields, the factories... so beautiful.',
  ],
]);

function tokens(value, scope) {
  return [...value.matchAll(/<([^/<>]+)>/g)].map((match) => {
    const name = match[1];
    const end = value.indexOf(`</${name}>`, match.index + match[0].length);
    const next = value.indexOf('<', match.index + match[0].length);
    return {
      name,
      value:
        end >= 0 && (next < 0 || end <= next || ['闪屏', 'Pic'].includes(name))
          ? value.slice(match.index + match[0].length, end)
          : '',
      scope,
    };
  });
}

function formatted(value) {
  const runs = [];
  const styles = [];
  for (const piece of value.split(/(<\/?(?:color|size)(?:=[^<>]+)?>)/gi)) {
    const opening = piece.match(/^<(color|size)=([^<>]+)>$/i);
    if (opening) {
      styles.push({ type: opening[1].toLowerCase(), value: opening[2] });
      continue;
    }
    const closing = piece.match(/^<\/(color|size)>$/i);
    if (closing) {
      const index = styles.findLastIndex(
        (style) => style.type === closing[1].toLowerCase(),
      );
      if (index >= 0) styles.splice(index, 1);
      continue;
    }
    const text = piece.replaceAll('+', '\n').replace(/\\n|\/\/n/g, '\n');
    if (!text) continue;
    const run = { text };
    for (const style of styles) {
      if (
        style.type === 'color' &&
        /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(style.value)
      )
        run.color = style.value;
      if (style.type === 'size' && /^\d+$/.test(style.value))
        run.size = Number(style.value);
    }
    runs.push(run);
  }
  return {
    text: runs
      .map((run) => run.text)
      .join('')
      .trim(),
    runs,
  };
}

function parseInteraction(body, controls, extracted, row, audit) {
  if (
    /<(?:perfect|good)>/.test(controls) ||
    (/<(?:perfect|good)>/.test(body) && !body.includes('<va11>')) ||
    controls.includes('<va11>')
  )
    return { error: 'Drink parameters have no matching Valhalla request.' };
  if (body.includes('<va11>')) {
    const match = body.match(
      /^(.*?)<va11><perfect>(\d+)(?:<good>(\d+(?:,\d+)*))?\s*$/s,
    );
    if (
      !match ||
      Number(match[2]) < 1 ||
      Number(match[2]) > 24 ||
      (match[3] &&
        match[3].split(',').some((id) => Number(id) < 1 || Number(id) > 24))
    )
      return { error: 'Unrecognized Valhalla drink request.' };
    audit.push({
      row,
      kind: 'approximate-drink-selection',
      perfect: match[2],
      good: match[3]?.split(',') ?? [],
      detail:
        'Native perfect/good story outcomes are selectable; ingredient mixing is not simulated.',
    });
    return {
      parts: [match[1]],
      labels: [
        'Serve preferred drink',
        ...(match[3] ? ['Serve another suitable drink'] : []),
      ],
    };
  }
  const tag = (name) =>
    controls.match(new RegExp(`<${name}>(.*?)</${name}>`))?.[1];
  const password = tag('InputBox');
  const shooting = tag('ShootPanel');
  const style = tag('branchstyle');
  const tips = formatted(tag('tips') ?? '').text;
  if (
    (controls.includes('<InputBox>') && password === undefined) ||
    (controls.includes('<ShootPanel>') && shooting === undefined)
  )
    return { error: 'Unclosed native interaction command.' };
  if (
    controls.includes('<cg>') ||
    controls.includes('<r>') ||
    /<(?:InputBox|ShootPanel|true|branchstyle|tips)>/.test(body)
  )
    return {
      error:
        'Native interaction command appears in an unsupported source region.',
    };
  if (
    [
      password !== undefined,
      shooting !== undefined,
      body.includes('<cg>'),
      body.includes('<t>'),
      body.includes('<r>'),
      body.includes('<c>'),
    ].filter(Boolean).length > 1
  )
    return { error: 'Mixed native interaction grammars on one source row.' };
  if (style !== undefined && style !== 'BranchLabel')
    return { error: 'Unknown branch presentation.' };
  if (password !== undefined) {
    const data = parameters(password);
    if (!data.password || !data.code || !/^\d{1,64}$/.test(data.password))
      return {
        error: 'The native password gate has no supported password or prefab.',
      };
    return {
      parts: [body],
      labels: ['Unlock'],
      choiceMode: 'gate',
      interaction: {
        kind: 'password',
        password: data.password,
        errorMessages: (data.errormsg ?? '')
          .split(';')
          .map((message) => message.replace(/^\d+'/, ''))
          .filter(Boolean),
        answerId: 'unlock',
        prefab: data.code,
      },
    };
  }
  if (shooting !== undefined) {
    const data = parameters(shooting);
    const count = Number(data.shootingCount);
    const manualCount = Number(data.manualCount?.replace(/,+$/, ''));
    const motions = {
      wait: Number(data.waitMotion),
      shoot: Number(data.shootMotion),
      gunShoot: Number(data.gunShootMotion),
      gunWait: Number(data.gunWaitMotion),
    };
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      !Number.isInteger(manualCount) ||
      manualCount < 1 ||
      !data.picturename ||
      !data.path ||
      !/^\d+$/.test(data.bgnum ?? '') ||
      Object.values(motions).some((value) => !Number.isFinite(value))
    )
      return { error: 'The native shooting gate contains invalid parameters.' };
    if (/,+$/.test(data.manualCount ?? ''))
      audit.push({
        row,
        kind: 'source-format-repair',
        repair: 'shooting-manual-count-trailing-commas',
        value: data.manualCount,
      });
    const background = extracted.backgrounds[data.bgnum] ?? {
      name: `Missing background ${data.bgnum}`,
    };
    if (!background.url && !background.color)
      audit.push({ row, kind: 'missing-background', bin: data.bgnum });
    const audio = [];
    for (const timed of (data.audio ?? '').split(',').filter(Boolean)) {
      const cue = timed.match(/^(.*)-(\d+(?:\.\d+)?)$/);
      if (!cue)
        return { error: 'The native shooting audio timeline is malformed.' };
      const url = extracted.sfx?.[cue[1]];
      if (!url)
        audit.push({
          row,
          kind: 'missing-sound',
          cue: cue[1],
          channel: 'ShootPanel',
        });
      audio.push({
        cue: cue[1],
        delay: Number(cue[2]),
        ...(url ? { url } : {}),
      });
    }
    const tweens = [];
    for (const timed of (data.tween ?? '').split(',').filter(Boolean)) {
      const entry = timed.match(/^(-?\d+)-(\d+(?:\.\d+)?)$/);
      if (!entry)
        return { error: 'The native shooting motion timeline is malformed.' };
      tweens.push({ code: Number(entry[1]), delay: Number(entry[2]) });
    }
    audit.push({
      row,
      kind: 'approximate-native-shooting',
      prefab: data.picturename,
      detail:
        'Native Live2D motions and tween codes are retained; browser presentation is approximate.',
    });
    const nativeModels = extracted.shooting?.[data.picturename];
    const models = nativeModels
      ? Object.fromEntries(
          ['target', 'gun']
            .filter((role) => nativeModels[role])
            .map((role) => [
              role,
              {
                modelUrl: nativeModels[role].modelUrl,
                motions: copy(nativeModels[role].motions),
              },
            ]),
        )
      : undefined;
    if (models && nativeModels.assets)
      models.assets = copy(nativeModels.assets);
    return {
      parts: [body],
      labels: ['Fire'],
      choiceMode: 'gate',
      interaction: {
        kind: 'shoot',
        answerId: 'fire',
        count,
        manualCount,
        portraitName: data.picturename,
        portraitPath: data.path,
        background: copy(background),
        audio,
        motions,
        tweens,
        ...(models ? { models } : {}),
      },
    };
  }
  if (body.includes('<cg>')) {
    if (!controls.includes('<t>') || style !== 'BranchLabel')
      return { error: 'Unknown native spatial-choice grammar.' };
    const parts = body.split('<cg>');
    const spots = [];
    for (const [index, value] of parts.slice(1).entries()) {
      if (!/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(value))
        return { error: 'Malformed native hotspot coordinates.' };
      const [x, y] = value.split(',').map(Number);
      spots.push({ id: String(index + 1), x, y });
    }
    return {
      parts: [parts[0]],
      labels: spots.map((spot) => `Inspect location ${spot.id}`),
      choiceMode: 'exploration',
      interaction: { kind: 'exploration', tips, spots },
    };
  }
  if (body.includes('<t>')) {
    const parts = body.split('<t>');
    return {
      parts: [parts[0]],
      labels: parts.slice(1).map((label) => formatted(label).text),
      choiceMode: 'exploration',
      interaction: { kind: 'exploration', tips, spots: [] },
    };
  }
  if (body.includes('<r>')) {
    const parts = body.split('<r>');
    const correctAnswerId = tag('true');
    if (
      !correctAnswerId ||
      !/^[1-9]\d*$/.test(correctAnswerId) ||
      Number(correctAnswerId) >= parts.length
    )
      return { error: 'The native quiz has no valid correct-answer index.' };
    return {
      parts: [parts[0]],
      labels: parts.slice(1).map((label) => formatted(label).text),
      choiceMode: 'quiz',
      correctAnswerId,
      interaction: { kind: 'quiz', correctAnswerId },
    };
  }
  if (
    controls.includes('<t>') ||
    controls.includes('<true>') ||
    style !== undefined ||
    tag('tips') !== undefined
  )
    return { error: 'Native interaction controls have no matching options.' };
  const parts = body.split('<c>');
  return {
    parts: [parts[0]],
    labels: parts.slice(1).map((label) => formatted(label).text),
  };
}

export function compileScript(script, source, extracted) {
  const nodes = [];
  const frames = {};
  const audit = [];
  const rows = [];
  const sourceRows = [];
  let blocked = false;
  for (const [index, raw] of source
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .entries()) {
    if (!raw.trim()) continue;
    const id = `${script}:${index + 1}`;
    sourceRows.push({ row: index + 1, id, raw });
    if (blocked) continue;
    const repaired = raw.replace(
      /(<controll_shake>[^<]*)\/controll_shake>/g,
      '$1</controll_shake>',
    );
    if (repaired !== raw)
      audit.push({
        row: index + 1,
        kind: 'source-format-repair',
        repair: 'missing-angle-in-shake-closing-tag',
        raw,
      });
    let match = repaired.match(/^(.*?)\|\|(.*?):(.*)$/);
    if (
      !match &&
      script === '-32-specialbattletips-fly' &&
      index === 2 &&
      /^提示\(\): Tap 【↑】/.test(raw)
    ) {
      match = [
        raw,
        '<Speaker>Tip</Speaker>',
        '',
        raw.slice(raw.indexOf(':') + 1),
      ];
      audit.push({
        row: index + 1,
        kind: 'source-format-repair',
        repair: 'legacy-tip-missing-control-delimiter',
        raw,
      });
    }
    if (!match && raw.includes('||') && raw.includes('：')) {
      match = raw.match(/^(.*?)\|\|(.*?)：(.*)$/);
      if (match)
        audit.push({
          row: index + 1,
          kind: 'source-format-repair',
          repair: 'fullwidth-metadata-delimiter',
          raw,
        });
    }
    if (!match && rows.length && sourceContinuations.get(id) === raw.trim()) {
      match = [raw, rows.at(-1).header, '', raw.trim()];
      audit.push({
        row: index + 1,
        kind: 'source-format-repair',
        repair: 'same-speaker-continuation',
        raw,
      });
    }
    const commands = match
      ? [
          ...tokens(match[1], 'actor'),
          ...tokens(match[2], 'control'),
          ...tokens(match[3], 'text'),
        ]
      : [];
    const unknown = commands.filter(
      ({ name }) => !supported.has(name) && !/^(?:color|size)=/i.test(name),
    );
    if (!match || unknown.length) {
      audit.push({
        row: index + 1,
        kind: 'unsupported',
        commands: unknown.map((command) => command.name),
        raw,
      });
      nodes.push({
        id,
        kind: 'unsupported',
        speaker: '',
        text: locale(
          'This source row needs an unsupported story command. Open the source script for the original text.',
        ),
        scene,
      });
      blocked = true;
      continue;
    }
    const [, header, controls, body] = match;
    const interaction = parseInteraction(
      body.replace(/<\/?(?:下雪|火焰销毁)>/g, ''),
      controls,
      extracted,
      index + 1,
      audit,
    );
    if (interaction.error) {
      audit.push({
        row: index + 1,
        kind: 'unsupported-interaction',
        detail: interaction.error,
        raw,
      });
      nodes.push({
        id,
        kind: 'unsupported',
        speaker: '',
        text: locale(
          'This native interaction needs parameters that are not supported. Open the source script for the original text.',
        ),
        scene,
      });
      blocked = true;
      continue;
    }
    const parts = interaction.parts;
    const text = formatted(parts[0]);
    const branch = controls.match(/<分支>(.*?)<\/分支>/)?.[1];
    if (branch !== undefined && !/^[1-9]\d*$/.test(branch)) {
      audit.push({ row: index + 1, kind: 'unsupported-branch', branch });
      blocked = true;
    }
    const node = {
      id,
      kind: interaction.labels.length ? 'choice' : 'text',
      speaker: plain(
        [...header.matchAll(/<Speaker>(.*?)<\/Speaker>/gi)].at(-1)?.[1] ?? '',
      ),
      text: locale(text.text),
      scene,
      source: { script, row: index + 1, contentId: 0, index: nodes.length },
      ...(interaction.labels.length
        ? {
            choices: interaction.labels.map((label, option) => ({
              id:
                interaction.choiceMode === 'gate'
                  ? interaction.interaction.answerId
                  : String(option + 1),
              label: locale(label),
              next: '',
            })),
          }
        : {}),
    };
    nodes.push(node);
    rows.push({
      node,
      header,
      controls,
      body,
      commands,
      branch: branch === undefined ? undefined : Number(branch),
      runs: text.runs,
      ...(interaction.interaction
        ? { interaction: interaction.interaction }
        : {}),
      ...(interaction.choiceMode ? { choiceMode: interaction.choiceMode } : {}),
      ...(interaction.correctAnswerId
        ? { correctAnswerId: interaction.correctAnswerId }
        : {}),
    });
  }
  // Numbered rows may interleave. Each option visits only its own numbers and
  // then rejoins the common continuation after the adjacent branch block.
  for (let index = 0; index < nodes.length - 1; index++)
    nodes[index].next = nodes[index + 1].id;
  const terminalId =
    nodes.at(-1)?.kind === 'unsupported' ? nodes.at(-1).id : `${script}:end`;
  const branchPlans = [];
  const setSuccessor = (row, target) => {
    if (row.choiceMode === 'gate') {
      for (const option of row.node.choices) option.next = target;
      delete row.node.next;
    } else row.node.next = target;
  };
  for (const [index, row] of rows.entries())
    if (row.choiceMode === 'gate')
      setSuccessor(row, rows[index + 1]?.node.id ?? terminalId);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (
      row.branch !== undefined ||
      !row.node.choices ||
      row.choiceMode === 'gate'
    )
      continue;
    let end = index + 1;
    while (rows[end]?.branch !== undefined) end++;
    if (row.choiceMode === 'exploration') {
      let boundary = index + 1;
      while (
        rows[boundary] &&
        !(
          rows[boundary].branch === undefined &&
          rows[boundary].node.choices &&
          rows[boundary].choiceMode !== 'gate'
        )
      )
        boundary++;
      for (let candidate = end; candidate < boundary; candidate++)
        if (rows[candidate].branch !== undefined) end = candidate + 1;
    }
    const block = rows.slice(index + 1, end);
    const join = rows[end]?.node.id;
    for (const option of row.node.choices) {
      const path = block.filter(
        (candidate) =>
          candidate.branch === Number(option.id) ||
          candidate.branch === undefined,
      );
      option.next = path[0]?.node.id ?? join ?? terminalId;
      for (const [part, candidate] of path.entries())
        setSuccessor(candidate, path[part + 1]?.node.id ?? join ?? terminalId);
    }
    delete row.node.next;
    for (const candidate of block) {
      if (candidate.branch > row.node.choices.length) {
        audit.push({
          row: candidate.node.source.row,
          kind: 'unsupported-branch',
          branch: candidate.branch,
        });
        blocked = true;
      }
      candidate.branchOwner = row.node.id;
    }
    if (['exploration', 'quiz'].includes(row.choiceMode))
      branchPlans.push({ row, block, join: rows[end] });
  }

  const graphCopy = (row, suffix) => {
    const duplicate = copy(row);
    duplicate.node.id = `${row.node.id}:${suffix}`;
    nodes.push(duplicate.node);
    return duplicate;
  };
  for (const { row, block, join } of branchPlans.reverse()) {
    const start = rows.indexOf(row);
    const end = join ? rows.indexOf(join) : rows.length;
    const options = copy(row.node.choices);
    const paths = new Map(
      options.map((option) => [
        option.id,
        block.filter(
          (candidate) =>
            candidate.branch === Number(option.id) ||
            candidate.branch === undefined,
        ),
      ]),
    );
    const continuation = join?.node.id ?? terminalId;
    const expanded = [];
    const appendPath = (menu, option, suffix, target) => {
      const path = paths.get(option.id).map((candidate) => {
        const shared = candidate.branch === undefined;
        if (shared && (suffix || option.id !== options[0].id))
          return graphCopy(
            candidate,
            `${suffix ? suffix + ':' : ''}option-${option.id}`,
          );
        return suffix ? graphCopy(candidate, suffix) : candidate;
      });
      option.next = path[0]?.node.id ?? target;
      for (const [index, candidate] of path.entries())
        setSuccessor(candidate, path[index + 1]?.node.id ?? target);
      expanded.push(...path);
    };
    if (row.choiceMode === 'exploration') {
      // <t> paths return to their selector in the source. There is no source
      // exit option. A subset DAG records inspected options without looping
      // history IDs or inventing an exit; all native locations remain readable.
      if (options.length > 8) {
        audit.push({
          row: row.node.source.row,
          kind: 'unsupported-exploration-size',
        });
        blocked = true;
        continue;
      }
      const full = (1 << options.length) - 1;
      const menuId = (mask) =>
        mask ? `${row.node.id}:visited-${mask}` : row.node.id;
      const masks = Array.from({ length: full }, (_, mask) => mask).sort(
        (a, b) =>
          a.toString(2).replaceAll('0', '').length -
            b.toString(2).replaceAll('0', '').length || a - b,
      );
      for (const mask of masks) {
        const suffix = mask ? `visited-${mask}` : '';
        const menu = suffix ? graphCopy(row, suffix) : row;
        menu.node.choices = copy(options).filter(
          (_, index) => !(mask & (1 << index)),
        );
        if (menu.interaction?.spots) {
          const remaining = new Set(
            menu.node.choices.map((option) => option.id),
          );
          menu.interaction.spots = menu.interaction.spots.filter((spot) =>
            remaining.has(spot.id),
          );
        }
        delete menu.node.next;
        expanded.push(menu);
        for (const option of menu.node.choices) {
          const index = options.findIndex(
            (candidate) => candidate.id === option.id,
          );
          const nextMask = mask | (1 << index);
          appendPath(
            menu,
            option,
            suffix,
            nextMask === full ? continuation : menuId(nextMask),
          );
        }
      }
      audit.push({
        row: row.node.source.row,
        kind: 'native-exploration-flow',
        sourceTag: 't',
        rule: 'each-option-once-then-continue',
        evidence:
          'Numbered source paths return to selector terrain; no source exit option is supplied.',
        sourceSpots: copy(row.interaction?.spots ?? []),
      });
      for (const shared of block.filter(
        (candidate) => candidate.branch === undefined,
      ))
        audit.push({
          row: shared.node.source.row,
          kind: 'native-shared-exploration-row',
          owner: row.node.id,
          rule: 'unnumbered-row-preserved-on-every-source-path',
        });
    } else {
      // First attempt and retry copies have distinct IDs. Only wrong answers
      // can loop, and the state pass verifies every retry edge is a fixed point.
      const retryId = `${row.node.id}:retry`;
      expanded.push(row);
      for (const option of row.node.choices)
        appendPath(
          row,
          option,
          '',
          option.id === row.correctAnswerId ? continuation : retryId,
        );
      const retry = graphCopy(row, 'retry');
      retry.node.choices = copy(options);
      delete retry.node.next;
      expanded.push(retry);
      for (const option of retry.node.choices)
        appendPath(
          retry,
          option,
          'retry',
          option.id === row.correctAnswerId ? continuation : retryId,
        );
      audit.push({
        row: row.node.source.row,
        kind: 'native-quiz-flow',
        correctAnswerId: row.correctAnswerId,
        rule: 'wrong-answer-retries-correct-answer-continues',
      });
    }
    rows.splice(start, end - start, ...expanded);
  }
  for (const row of rows) {
    if (row.branch !== undefined && !row.branchOwner) {
      audit.push({
        row: row.node.source.row,
        kind: 'unsupported-branch',
        branch: row.branch,
      });
      blocked = true;
    }
  }

  const initial = {
    background: { name: 'black', color: '#000000' },
    contextBackground: { name: 'black', color: '#000000' },
    bgm: undefined,
    mask: undefined,
    sparks: false,
    snow: false,
    activeSounds: {},
    backgroundMove: undefined,
  };
  const soundMetadata = new Map(
    (extracted.audioProvenance ?? [])
      .filter((entry) => entry.kind === 'sfx')
      .map((entry) => [entry.cue, entry]),
  );
  const incoming = new Map(rows.length ? [[rows[0].node.id, [initial]]] : []);
  const incomingEdges = new Map();
  const resolvedIncoming = new Map();
  function backgroundFor(bin, row) {
    const entry = extracted.backgrounds[bin];
    if (!entry?.url && !entry?.color)
      audit.push({ row, kind: 'missing-background', bin });
    const background = copy(entry ?? { name: `Missing background ${bin}` });
    // The extractor records absent media as null; packages use optional URLs.
    if (background.url === null) delete background.url;
    return background;
  }
  function actorsFor(header, row) {
    const actors = [];
    const lighting = [...header.matchAll(/<(同时置暗|同时点亮|同时置亮)>/g)].at(
      -1,
    )?.[1];
    for (const segment of header.split(/[;&]/)) {
      const portrait = segment.match(/^\s*([^()<]+)\((\d+)\)/);
      if (!portrait) continue;
      const [, rawName, expression] = portrait;
      const invisible = rawName.trim().endsWith('#隐身');
      const name = invisible ? rawName.trim().slice(0, -3) : rawName.trim();
      const image = extracted.portraits[name]?.[Number(expression)];
      if (!image?.url)
        audit.push({ row, kind: 'missing-portrait', name, expression });
      const position = [
        ...segment.matchAll(/<[Pp]osition>(.*?)<\/[Pp]osition>/g),
      ]
        .at(-1)?.[1]
        ?.split(',')
        .map(Number);
      const scale = segment.match(/<Scale>(.*?)<\/Scale>/)?.[1];
      const gradient = [
        ...segment.matchAll(/<(GradientShow|GradientHide)>(.*?)<\/\1>/g),
      ].at(-1);
      const delay = segment.match(/<Delay>(.*?)<\/Delay>/)?.[1];
      if (
        (scale !== undefined &&
          (!Number.isFinite(Number(scale)) || Number(scale) <= 0)) ||
        (gradient &&
          (!Number.isFinite(Number(gradient[2])) || Number(gradient[2]) < 0)) ||
        (delay !== undefined &&
          (!Number.isFinite(Number(delay)) || Number(delay) < 0))
      ) {
        audit.push({
          row,
          kind: 'unsupported-value',
          command: 'actor-transform',
          raw: segment,
        });
        blocked = true;
      }
      actors.push({
        name,
        expression: Number(expression),
        url: image?.url,
        active: lighting ? lighting !== '同时置暗' : /<Speaker>/i.test(segment),
        communication: segment.includes('<通讯框>'),
        x: position?.[0] ?? 0,
        y: position?.[1] ?? 0,
        scale: scale === undefined ? (image?.scale ?? 1) : Number(scale),
        grey: segment.includes('<Grey>'),
        shake: segment.includes('<Shake>'),
        ...(invisible
          ? { opacity: 0 }
          : lighting === '同时置暗'
            ? { opacity: 0.55 }
            : lighting
              ? { opacity: 1 }
              : {}),
        ...(gradient
          ? {
              fade: {
                kind: gradient[1] === 'GradientHide' ? 'out' : 'in',
                duration: Number(gradient[2]),
              },
            }
          : {}),
        ...(delay !== undefined ? { delay: Number(delay) } : {}),
      });
    }
    return actors;
  }
  for (const row of rows) {
    const rowNumber = row.node.source.row;
    for (const command of row.commands) {
      if (
        [
          'Night',
          '回忆',
          '关闭蒙版',
          '火花',
          '关闭火花',
          '火花关闭',
          '边框',
          'Grey',
          'Shake',
          '立绘振动',
          'Position',
          'position',
          'Scale',
          '同时置暗',
          '同时点亮',
          '同时置亮',
          'GradientShow',
          'GradientHide',
          'Delay',
        ].includes(command.name)
      ) {
        audit.push({
          row: rowNumber,
          kind: 'approximate-visual-effect',
          command: command.name,
          value: command.value,
        });
      }
    }
    const candidates = incoming.get(row.node.id) ?? [initial];
    const results = candidates.map((input) => {
      const state = copy(input);
      const frame = {
        actors: actorsFor(row.header, rowNumber),
        night: /<night>/i.test(row.controls),
        shake: /<震屏(?:3)?>|<立绘振动>/.test(row.controls),
        transitions: [],
        commands: row.commands,
        narrator: row.controls.includes('<narrator>'),
        hideDialogue: row.controls.includes('<hide_dialogue>'),
        ...(row.interaction ? { interaction: copy(row.interaction) } : {}),
      };
      for (const command of row.commands.filter(
        (entry) =>
          entry.scope === 'control' ||
          ['下雪', '火焰销毁'].includes(entry.name),
      )) {
        const { name, value } = command;
        if (name === 'BIN') {
          state.background = backgroundFor(value, rowNumber);
          if (!['white', 'black'].includes(state.background.name.toLowerCase()))
            state.contextBackground = copy(state.background);
        } else if (name === 'BGM') {
          state.bgm = ['BGM_Empty', 'BGM_PAUSE'].includes(value)
            ? undefined
            : extracted.audio[value];
          if (value === 'BGM_PAUSE')
            audit.push({
              row: rowNumber,
              kind: 'approximate-audio-pause',
              cue: value,
              detail:
                'Music stops; native paused playback position is not retained.',
            });
          if (!['BGM_Empty', 'BGM_PAUSE'].includes(value) && !state.bgm)
            audit.push({ row: rowNumber, kind: 'missing-bgm', cue: value });
        } else if (['SE', 'SE1', 'SE2'].includes(name)) {
          const channel = name === 'SE' ? 'SE1' : name;
          delete state.activeSounds[channel];
          if (['', 'Empty', 'SE_Empty', 'Stop_AVG_loop'].includes(value))
            (frame.sounds ??= []).push({ channel, action: 'stop', cue: value });
          else {
            const url = extracted.sfx?.[value];
            const metadata = soundMetadata.get(value);
            const loop = metadata?.loop;
            if (url) {
              const sound = {
                channel,
                cue: value,
                url,
                action: 'play',
                ...(loop && Number.isFinite(loop.start) && loop.end > loop.start
                  ? { loop: true }
                  : {}),
              };
              (frame.sounds ??= []).push(sound);
              if (sound.loop) state.activeSounds[channel] = sound;
            } else
              audit.push({
                row: rowNumber,
                kind: 'missing-sound',
                cue: value,
                channel,
              });
          }
          if (name === 'SE')
            audit.push({
              row: rowNumber,
              kind: 'approximate-audio-channel',
              command: name,
              channel,
            });
        } else if (name === 'bg_move') {
          const data = parameters(value);
          const move = {
            pivotX: Number(data.pivot_x),
            pivotY: Number(data.pivot_y),
            scale: Number(data.scale),
            duration: Number(data.duration),
          };
          if (
            Object.values(move).some((entry) => !Number.isFinite(entry)) ||
            move.scale <= 0 ||
            move.duration < 0
          ) {
            audit.push({
              row: rowNumber,
              kind: 'unsupported-value',
              command: name,
              value,
            });
            blocked = true;
          } else state.backgroundMove = move;
          audit.push({
            row: rowNumber,
            kind: 'approximate-background-move',
            value,
          });
        } else if (name === 'controll_shake') {
          const data = parameters(value);
          const shake = {
            typeId: Number(data.type_id),
            duration: Number(data.duration),
            delay: Number(data.delay),
            range: Number(data.range),
          };
          if (
            Object.values(shake).some((entry) => !Number.isFinite(entry)) ||
            shake.duration < 0 ||
            shake.delay < 0 ||
            shake.range < 0
          ) {
            audit.push({
              row: rowNumber,
              kind: 'unsupported-value',
              command: name,
              value,
            });
            blocked = true;
          } else {
            frame.controlledShake = shake;
            frame.shake = true;
          }
          audit.push({
            row: rowNumber,
            kind: 'approximate-controlled-shake',
            value,
          });
        } else if (name === 'common_effect') {
          const data = parameters(value);
          const effect = {
            code: data.code || value,
            ...(data.wait !== undefined ? { wait: data.wait === '1' } : {}),
          };
          (frame.nativeEffects ??= []).push(effect);
          audit.push({
            row: rowNumber,
            kind: 'unavailable-native-effect',
            code: effect.code,
            value,
          });
        } else if (name === 'CloseOldEffect') {
          frame.nativeEffects = [];
          audit.push({
            row: rowNumber,
            kind: 'approximate-native-effect-reset',
          });
        } else if (
          ['快跑', '刮花', '拉伸', '平移', '打海猫2', '开火'].includes(name)
        ) {
          (frame.nativeEffects ??= []).push({ code: name });
          audit.push({
            row: rowNumber,
            kind: 'unavailable-native-effect',
            code: name,
            value,
          });
        } else if (name === '下雪') {
          state.snow = true;
          audit.push({
            row: rowNumber,
            kind: 'approximate-visual-effect',
            command: name,
          });
        } else if (name === '火焰销毁') {
          state.sparks = false;
          state.snow = false;
          audit.push({
            row: rowNumber,
            kind: 'approximate-native-effect-reset',
            command: name,
          });
        } else if (name === 'BIN_SlowIn') {
          frame.transitions.push({ kind: '黑屏2', value: '0.6' });
          audit.push({
            row: rowNumber,
            kind: 'approximate-transition',
            commands: [name],
          });
        } else if (name === '回忆') state.mask = 'memory';
        else if (name === '关闭蒙版') state.mask = undefined;
        else if (name === '火花') state.sparks = true;
        else if (['关闭火花', '火花关闭'].includes(name)) state.sparks = false;
        else if (name === '边框') frame.border = Number(value);
        else if (
          /^(?:黑屏[12]|白屏[12]|黑点[12]|睁眼2?|CGDelay|震屏3?|白屏闪光)$/.test(
            name,
          )
        ) {
          frame.transitions.push({ kind: name, value });
          audit.push({
            row: rowNumber,
            kind: 'approximate-transition',
            commands: [name],
            value,
          });
        } else if (name === '闪屏') {
          const number = (tag, fallback) =>
            Number(
              row.controls.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1] ??
                fallback,
            );
          const cg = row.controls.match(/<CG>(.*?)<\/CG>/)?.[1];
          const pic = row.controls.match(/<Pic>(.*?)<\/Pic>/)?.[1];
          frame.flash = {
            duration: number('duration', 1),
            rate: number('rate', 10),
            delay: number('delay', 0),
            backgrounds: cg
              ? cg.split(',').map((id) => backgroundFor(id.trim(), rowNumber))
              : [],
            portraits: pic
              ? [...pic.matchAll(/\[([^\]]*)\]/g)].map((match) =>
                  actorsFor(match[1], rowNumber),
                )
              : [],
          };
          audit.push({
            row: rowNumber,
            kind: 'approximate-flash',
            duration: frame.flash.duration,
            rate: frame.flash.rate,
            delay: frame.flash.delay,
          });
        } else if (name === '名单' || name === '名单2') {
          frame.effects = ['credits'];
          audit.push({
            row: rowNumber,
            kind: 'unavailable-native-credits',
            command: name,
            ...(value ? { reference: value } : {}),
          });
        }
      }
      frame.background = copy(state.background);
      frame.bgm = state.bgm;
      frame.mask = state.mask;
      frame.sparks = state.sparks;
      if (state.snow) frame.effects = [...(frame.effects ?? []), 'snow'];
      frame.activeSounds = Object.values(state.activeSounds);
      frame.backgroundMove = state.backgroundMove;
      if (state.background.name.toLowerCase() === 'white') {
        const terrain = extracted.gameplayBackgrounds?.[script];
        if (terrain) frame.contextBackground = copy(terrain);
        else if (frame.actors.some((actor) => actor.communication))
          frame.contextBackground = copy(state.contextBackground);

        // A final empty gameplay-return row follows the preceding blackout.
        // Keep its endpoint black rather than exposing the utility shade over
        // a white canvas. This bounded composition follows the supplied native
        // recording; the browser fade duration remains an approximation.
        const lastBlack = (commands) =>
          commands
            ?.filter(
              (command) =>
                command.scope === 'control' &&
                /^(?:黑屏|黑点)[12]$/.test(command.name),
            )
            .at(-1)?.name;
        if (
          row === rows.at(-1) &&
          !row.node.text.en &&
          !frame.actors.length &&
          /1$/.test(lastBlack(rows.at(-2)?.commands) ?? '') &&
          /2$/.test(lastBlack(row.commands) ?? '')
        ) {
          frame.contextBackground = copy(state.contextBackground);
          frame.blackout = { color: '#000000', duration: 0.6 };
          audit.push({
            row: rowNumber,
            kind: 'approximate-terminal-fade',
            duration: 0.6,
          });
        }
      }
      if (row.interaction?.kind === 'shoot') {
        frame.background = copy(row.interaction.background);
        frame.actors = [];
        delete frame.contextBackground;
      }
      if (row.runs.some((run) => run.color || run.size)) {
        frame.textRuns = row.runs;
        audit.push({
          row: rowNumber,
          kind: 'approximate-text-style',
          styles: row.runs
            .filter((run) => run.color || run.size)
            .map(({ color, size }) => ({ color, size })),
        });
      }
      return { state, frame };
    });
    // A common source row does not reset music, terrain or looping effects.
    // Preserve each incoming state in its graph ID until commands actually
    // converge it. Exact IDs therefore restore the same frame on history seeks.
    const variants = new Map();
    const inputVariants = new Map();
    for (const [index, result] of results.entries()) {
      const identity = JSON.stringify([result.state, result.frame]);
      let variant = variants.get(identity);
      if (!variant) {
        const node = variants.size ? copy(row.node) : row.node;
        if (variants.size) {
          node.id = `${row.node.id}:state-${variants.size + 1}`;
          nodes.push(node);
          audit.push({
            row: rowNumber,
            kind: 'branch-state-variant',
            sourceNodeId: row.node.id,
            nodeId: node.id,
          });
        }
        variant = { node, result };
        variants.set(identity, variant);
      }
      inputVariants.set(JSON.stringify(candidates[index]), variant.node);
    }
    for (const edge of incomingEdges.get(row.node.id) ?? []) {
      const target = inputVariants.get(edge.stateKey);
      if (edge.choice) edge.choice.next = target.id;
      else edge.node.next = target.id;
    }
    resolvedIncoming.set(row.node.id, inputVariants);
    for (const { node, result } of variants.values()) {
      frames[node.id] = result.frame;
      node.bgm = result.state.bgm;
      const targets = node.choices
        ? node.choices.map((choice) => ({ target: choice.next, choice }))
        : [{ target: node.next }];
      for (const { target, choice } of targets.filter((edge) => edge.target)) {
        const states = incoming.get(target) ?? [];
        const stateKey = JSON.stringify(result.state);
        if (!states.some((state) => JSON.stringify(state) === stateKey))
          states.push(result.state);
        incoming.set(target, states);
        const edges = incomingEdges.get(target) ?? [];
        edges.push({ node, choice, stateKey });
        incomingEdges.set(target, edges);
      }
    }
  }
  // A retry is safe only if it reaches the exact persistent state for which
  // the target frame was compiled. Never substitute a first-attempt snapshot.
  for (const [target, edges] of incomingEdges) {
    const variants = resolvedIncoming.get(target);
    if (!variants) continue;
    for (const edge of edges) {
      const destination = variants.get(edge.stateKey);
      if (!destination) {
        audit.push({
          row: edge.node.source.row,
          kind: 'unsupported-retry-state',
          target,
        });
        blocked = true;
      } else if (edge.choice) edge.choice.next = destination.id;
      else edge.node.next = destination.id;
    }
  }
  const complete = nodes.length > 0 && !blocked;
  if (complete) {
    const endId = `${script}:end`;
    const endings = new Map();
    for (const node of [...nodes]) {
      if (
        node.choices
          ? !node.choices.some((choice) => choice.next === endId)
          : node.next && node.next !== endId
      )
        continue;
      const finalFrame = frames[node.id];
      const frame = {
        ...finalFrame,
        bgm: undefined,
        actors: [],
        sounds: [],
        activeSounds: [],
        transitions: [],
        blackout: finalFrame.blackout
          ? { color: '#000000', duration: 0 }
          : undefined,
        flash: undefined,
        shake: false,
        night: false,
        mask: undefined,
        sparks: false,
        effects: [],
        textRuns: undefined,
        commands: [],
        controlledShake: undefined,
        nativeEffects: [],
        hideDialogue: false,
        narrator: false,
        interaction: undefined,
      };
      const identity = JSON.stringify(frame);
      let ending = endings.get(identity);
      if (!ending) {
        ending = endings.size ? `${endId}:state-${endings.size + 1}` : endId;
        endings.set(identity, ending);
        nodes.push({
          id: ending,
          kind: 'end',
          speaker: '',
          text: locale('Scene complete.'),
          scene,
        });
        frames[ending] = frame;
      }
      if (node.choices) {
        for (const choice of node.choices)
          if (choice.next === endId) choice.next = ending;
      } else node.next = ending;
    }
  } else {
    const first = audit.find(
      (entry) =>
        entry.kind.startsWith('unsupported') ||
        entry.kind === 'ambiguous-branch-state',
    );
    if (first) {
      const node = nodes.find(
        (entry) =>
          entry.source?.row === first.row ||
          entry.id === `${script}:${first.row}`,
      );
      if (node) {
        node.kind = 'unsupported';
        delete node.next;
        delete node.choices;
      }
    }
    const blockIndex = nodes.findIndex((node) => node.kind === 'unsupported');
    if (blockIndex >= 0) {
      const blocking = nodes[blockIndex];
      nodes.splice(blockIndex + 1);
      const retained = new Set(nodes.map((node) => node.id));
      for (const node of nodes) {
        if (node.next && !retained.has(node.next)) node.next = blocking.id;
        for (const choice of node.choices ?? [])
          if (!retained.has(choice.next)) choice.next = blocking.id;
      }
      for (const id of Object.keys(frames))
        if (!retained.has(id)) delete frames[id];
    }
  }
  const uniqueAudit = [
    ...new Map(audit.map((entry) => [JSON.stringify(entry), entry])).values(),
  ];
  return {
    version: 1,
    id: `gfl1-${script}`,
    nodes,
    frames,
    communication: extracted.communication,
    audit: uniqueAudit,
    complete,
    sourceRows,
  };
}
