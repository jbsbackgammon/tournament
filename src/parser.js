import { createTournament, cleanName, SIZES } from './model.js';

// Read the callback's JSON object without evaluating any pasted JavaScript.
export function extractCallback(text) {
  const marker = /\bgetTourneyCallback\s*\(/g.exec(text);
  if (!marker) return null;
  const start = text.indexOf('{', marker.index + marker[0].length);
  if (start < 0) throw new Error('eJBSの大会データが見つかりません。ページのソース全体を貼り付けてください。');
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else {
      if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); }
        catch { throw new Error('eJBSのデータ形式を読み取れません。ソース全体をコピーし直してください。'); }
      }
    }
  }
  throw new Error('eJBSのデータが途中で切れています。');
}

export function importTournament(text, requestedSize = 16) {
  if (text.length > 2_000_000) throw new Error('入力は2MB以内にしてください。');
  if (!text.trim()) throw new Error('ソースまたは選手名を入力してください。');
  let data = extractCallback(text);
  if (!data && text.trim().startsWith('{')) {
    try { data = JSON.parse(text); } catch { throw new Error('JSON形式が正しくありません。'); }
  }
  if (data) {
    const size = Number(data.players);
    if (!SIZES.includes(size) || typeof data.data !== 'string') throw new Error('8・16・32・64枠のeJBSデータを指定してください。');
    const entries = data.data.split(',').map(cleanName);
    const expected = size * 2 - 2;
    // eJBS sometimes leaves trailing empty fields after the last pair.
    if (entries.length < expected || entries.slice(expected).some(Boolean)) throw new Error(`対戦データ数が${size}枠の形式と一致しません。`);
    const state = createTournament(size);
    let offset = 0;
    state.rounds = state.rounds.map(round => { const result = entries.slice(offset, offset + round.length); offset += round.length; return result; });
    const titleMatch = cleanName(data.name).match(/^(第\s*\d+\s*[回期])\s*(.*)$/);
    state.edition = titleMatch?.[1] || '';
    state.title = titleMatch?.[2] || cleanName(data.name);
    state.accent = state.title.includes('新鋭') ? '#10686b' : state.title.includes('女王') ? '#710d61' : state.title.includes('盤聖') ? '#75092f' : '#70700d';
    state.champion = cleanName(data.winner);
    state.sourceUpdated = cleanName(data.update);
    state.roundPoints = state.roundPoints.map((_, i) => cleanName(String(data.roundpts ?? '').split(',')[i]));
    return { state, message: `${size}枠・${state.rounds.length}ラウンドの対戦情報を取り込みました。` };
  }
  if (/<(?:!doctype|html|script|div|table)\b/i.test(text)) throw new Error('eJBSの対戦データが含まれていません。getTourneyCallbackを含むページソースを使ってください。');
  // The generic text format deliberately requires one player per line; arbitrary
  // rendered eJBS page text cannot reliably identify rounds or seed positions.
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 64) throw new Error('1行1名の選手名簿を64名以内で入力してください。');
  const size = Math.max(requestedSize, SIZES.find(n => n >= lines.length) || 64);
  const state = createTournament(size);
  lines.forEach((line, i) => {
    const [name, ...note] = line.replace(/^\d+[.．、)）]\s*/, '').split('\t');
    state.rounds[0][i] = cleanName(name);
    if (note.length) state.notes[cleanName(name)] = cleanName(note.join(' '));
  });
  return { state, message: `${lines.length}名を取り込みました。対戦順と勝ち上がりは編集画面で設定できます。` };
}
