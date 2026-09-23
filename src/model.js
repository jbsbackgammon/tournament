export const SIZES = [8, 16, 32, 64];
export const TITLE_DEFAULTS = [
  { edition: '第54回', title: '日本選手権', winner: '野尾 貴弘' },
  { edition: '第32期', title: '盤聖戦', winner: '川内 響' },
  { edition: '第31期', title: '名人戦', winner: '泉 良祐' },
  { edition: '第32期', title: '王位戦', winner: '斎藤 和弘' },
  { edition: '第7期', title: '賽王戦', winner: '中村 順子' }
];
export const TITLE_COLORS = ['#3c3c3c', '#75092f', '#70700d', '#0c7034', '#12246e'];
export const TOURNAMENT_MASTERS = [
  ['日本選手権', '#3C3C3C'], ['盤聖戦', '#6B0D2F'], ['名人戦', '#6B670D'],
  ['王位戦', '#0D6B2F'], ['賽王戦', '#0D236B'], ['棋聖戦', '#6B230D'],
  ['女王戦', '#6B0D5B'], ['新鋭戦', '#0D676B'], ['大阪オープン', '#F8B62B'],
  ['東京オープン', '#009F40'], ['名古屋オープン', '#0C284D']
].map(([title, accent]) => ({ title, accent }));
export const cleanName = value => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
export const sameName = (a, b) => !!cleanName(a) && cleanName(a).replace(/[\s\u3000]/g, '') === cleanName(b).replace(/[\s\u3000]/g, '');
export const roundLabel = count => ({ 2: '決勝', 4: '準決勝', 8: '準々決勝' }[count] || `ベスト${count}`);

export function createTournament(size = 16) {
  if (!SIZES.includes(size)) throw new Error('対応する枠数は8・16・32・64です。');
  return {
    version: 1, size, title: '', edition: '', subtitle: 'バックギャモン', footer: '', accent: '#000000',
    rounds: Array.from({ length: Math.log2(size) }, (_, r) => Array(size / 2 ** r).fill('')),
    champion: '', notes: {}, roundPoints: Array(Math.log2(size)).fill(''),
    showNotes: true, showTitles: false, showBottomMargin: false, showLosersGray: true, showByeGray: true,
    titles: TITLE_DEFAULTS.map(entry => ({ ...entry })),
    sourceUpdated: ''
  };
}

export function validateTournament(raw) {
  if (!raw || raw.version !== 1 || !SIZES.includes(raw.size)) throw new Error('対応していない大会データです。');
  const out = createTournament(raw.size);
  if (!Array.isArray(raw.rounds) || raw.rounds.length !== out.rounds.length) throw new Error('ラウンド数が正しくありません。');
  out.rounds = raw.rounds.map((round, r) => {
    if (!Array.isArray(round) || round.length !== out.rounds[r].length || round.some(x => typeof x !== 'string' || x.length > 200)) throw new Error('選手データが正しくありません。');
    return round.map(cleanName);
  });
  for (const field of ['title', 'edition', 'subtitle', 'footer', 'champion', 'sourceUpdated']) out[field] = cleanName(raw[field]).slice(0, 300);
  out.accent = /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : out.accent;
  out.notes = Object.fromEntries(Object.entries(raw.notes || {}).filter(([k, v]) => k.length <= 200 && typeof v === 'string').map(([k, v]) => [k, cleanName(v).slice(0, 200)]));
  out.showNotes = raw.showNotes !== false;
  out.showTitles = raw.showTitles === true; out.showBottomMargin = raw.showBottomMargin === true;
  out.showLosersGray = raw.showLosersGray !== false;
  out.showByeGray = raw.showByeGray !== false;
  out.roundPoints = out.roundPoints.map((_, i) => cleanName(raw.roundPoints?.[i]).slice(0, 30));
  out.titles = out.titles.map((entry, i) => ({ title: cleanName(raw.titles?.[i]?.title ?? entry.title).slice(0, 80), edition: cleanName(raw.titles?.[i]?.edition).slice(0, 40), winner: cleanName(raw.titles?.[i]?.winner).slice(0, 100) }));
  return out;
}

export function displayRounds(state, displaySize) {
  if (!SIZES.includes(displaySize) || displaySize > state.size) throw new Error('表示枠数は元の枠数以下にしてください。');
  const start = Math.log2(state.size / displaySize);
  return { start, rounds: state.rounds.slice(start), points: state.roundPoints.slice(start) };
}

// A change to an earlier match invalidates only the result that depended on it.
// Blank branches can contain a later seeded player, which must be preserved.
export function editEntry(state, round, index, value) {
  if (!state.rounds[round] || index < 0 || index >= state.rounds[round].length) throw new Error('選手枠が見つかりません。');
  const previous = state.rounds[round][index];
  const next = cleanName(value);
  if (previous === next) return;
  state.rounds[round][index] = next;
  let parent = Math.floor(index / 2);
  for (let r = round + 1; r < state.rounds.length; r++) {
    if (!sameName(state.rounds[r][parent], previous)) return;
    state.rounds[r][parent] = '';
    parent = Math.floor(parent / 2);
  }
  if (sameName(state.champion, previous)) state.champion = '';
}

export function advance(state, round, index) {
  const name = state.rounds[round]?.[index];
  if (!name || name.toUpperCase() === 'BYE') throw new Error('勝者を選ぶ前に選手名を入力してください。');
  if (round === state.rounds.length - 1) state.champion = name;
  else editEntry(state, round + 1, Math.floor(index / 2), name);
}

// Infer a seeded entrant only when both feeder slots are empty.
// Repeated names are preserved because eJBS can contain multiple entries.
export function seededRounds(state) {
  const rounds = state.rounds.map(r => [...r]);
  for (let r = rounds.length - 1; r > 0; r--) {
    rounds[r].forEach((name, i) => {
      if (name && name !== 'BYE' && !rounds[r - 1][i * 2] && !rounds[r - 1][i * 2 + 1]) {
        rounds[r - 1][i * 2] = name;
        rounds[r - 1][i * 2 + 1] = 'BYE';
      }
    });
  }
  return rounds;
}
