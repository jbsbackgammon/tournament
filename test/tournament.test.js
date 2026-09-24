import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTournament, seededRounds, displayRounds, advance, editEntry, validateTournament } from '../src/model.js';
import { importTournament } from '../src/parser.js';
import { renderBracket, dimensions, bracketGeometry } from '../src/render.js';
import { withDpi, crc32 } from '../src/export.js';

const load = async size => importTournament(await readFile(new URL(`../fixtures/ejbs-${size}.html`, import.meta.url), 'utf8')).state;
test('provided 16-player HTML preserves rounds and restores seeded entrants', async () => {
  const state = await load(16), rounds = seededRounds(state);
  assert.equal(state.title, '新鋭戦'); assert.equal(state.edition, '第15回');
  assert.deepEqual(state.rounds.map(r => r.length), [16, 8, 4, 2]);
  assert.deepEqual(rounds[0].slice(2, 4), ['北野 雄大', 'BYE']);
  assert.deepEqual(rounds[0].slice(12), ['中村 泉美', 'BYE', '川島 颯', 'BYE']);
  assert.deepEqual(rounds.at(-1), ['北野 雄大', '川島 颯']);
  assert.equal(state.champion, '');
});
test('64 to best16 uses third round, not first 16 entrants; source unchanged', async () => {
  const state = await load(64), saved = JSON.stringify(state);
  const { start, rounds } = displayRounds(state, 16);
  assert.equal(start, 2); assert.equal(rounds[0][0], '永田 隆太');
  assert.deepEqual(seededRounds(state)[2].slice(8, 10), ['泉 良祐', 'BYE']);
  const svg = renderBracket(state, { displaySize: 16, format: 'hd' });
  assert.ok(svg.includes('永田 隆太')); assert.ok(svg.includes('泉 良祐'));
  assert.ok(!svg.includes('早川 佳希')); assert.equal(JSON.stringify(state), saved);
});
test('names that occur in multiple slots are not silently deduplicated', async () => {
  const state = await load(64);
  assert.equal(seededRounds(state)[2].filter(n => n === '平林 直').length, 2);
});
test('winner changes clear downstream dependent winners including champion', () => {
  const state = createTournament(8);
  state.rounds[0][0] = 'A'; state.rounds[0][1] = 'B';
  advance(state, 0, 0); advance(state, 1, 0); advance(state, 2, 0);
  assert.equal(state.champion, 'A');
  advance(state, 0, 1);
  assert.equal(state.rounds[1][0], 'B'); assert.equal(state.rounds[2][0], ''); assert.equal(state.champion, '');
});
test('editing an unrelated loser preserves winner and independent seeds', () => {
  const state = createTournament(8);
  state.rounds[0][0] = 'A'; state.rounds[0][1] = 'B'; advance(state, 0, 0);
  state.rounds[1][2] = 'Seed';
  editEntry(state, 0, 1, 'C'); editEntry(state, 0, 4, 'D');
  assert.equal(state.rounds[1][0], 'A'); assert.equal(state.rounds[1][2], 'Seed');
});
test('BYE cannot become a champion', () => {
  const state = createTournament(8); state.rounds[0][0] = 'BYE';
  assert.throws(() => advance(state, 0, 0));
});
test('callback scanner handles braces and escaped quotes inside names without execution', () => {
  const payload = { players: 8, data: Array(14).fill('').join(','), name: 'A } " B' };
  const result = importTournament(`getTourneyCallback(${JSON.stringify(payload)}); throw new Error('must not run')`);
  assert.equal(result.state.title, payload.name);
  assert.throws(() => importTournament('getTourneyCallback({"players":8,"data":alert(1)})'));
  assert.throws(() => importTournament('<html>not a bracket</html>'));
});
test('truncated or mismatched source is rejected instead of corrupting rounds', () => {
  assert.throws(() => importTournament('getTourneyCallback({"players":16,"data":"A,B"})'));
  assert.throws(() => importTournament('getTourneyCallback({"players":16'));
  assert.throws(() => importTournament(JSON.stringify({ players: 128, data: '' })));
});
test('plain text imports names, tabs and chooses sufficient slots', () => {
  const result = importTournament('1. 選手A\t予選A組1位\n2. 選手B', 8);
  assert.deepEqual(result.state.rounds[0].slice(0, 2), ['選手A', '選手B']);
  assert.equal(result.state.notes['選手A'], '予選A組1位');
  assert.equal(importTournament(Array(33).fill('名').join('\n'), 8).state.size, 64);
});
test('identical opponents automatically advance the upper player', () => {
  const state = createTournament(8);
  state.rounds[0][0] = '同名選手'; state.rounds[0][1] = '同名選手';
  assert.equal(seededRounds(state)[1][0], '同名選手');
});
test('eJBS player names discard slash metadata', () => {
  const data = { players: 8, data: Array(14).fill('').map((_, i) => i === 0 ? '選手A/内部情報' : '').join(',') };
  assert.equal(importTournament(`getTourneyCallback(${JSON.stringify(data)});`).state.rounds[0][0], '選手A');
});
test('saved JSON roundtrip and malformed JSON validation', async () => {
  const state = await load(16); state.notes['川島 颯'] = '予選B組1位'; state.showTitles = true;
  assert.deepEqual(validateTournament(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => validateTournament({ version: 1, size: 16, rounds: [] }));
  assert.equal(validateTournament({ ...state, accent: 'red"/><script>' }).accent, '#000000');
});
test('supplementary information hidden only for 64 display; footer titles opt-in', () => {
  const state = createTournament(64); state.showNotes = true; state.rounds[0][0] = 'A'; state.rounds[2][0] = 'A'; state.notes.A = 'NOTE_MARKER';
  assert.ok(!renderBracket(state).includes('NOTE_MARKER'));
  assert.ok(renderBracket(state, { displaySize: 16 }).includes('NOTE_MARKER'));
  assert.ok(!renderBracket(state).includes('日本選手権'));
  state.showTitles = true; assert.ok(renderBracket(state).includes('日本選手権'));
});
test('names and notes are XML escaped', () => {
  const state = createTournament(8); state.rounds[0][0] = '<script>alert(1)</script>'; state.title = '<img onerror="x">';
  const svg = renderBracket(state);
  assert.ok(!svg.includes('<script>')); assert.ok(svg.includes('&lt;script&gt;')); assert.ok(!svg.includes('<img'));
});
for (const size of [8, 16, 32, 64]) {
  test(`${size} slots fit every supported output and title-strip combination`, () => {
    for (const format of ['hd', 'a4', 'a5']) for (const orientation of ['portrait', 'landscape']) for (const showTitles of [false, true]) {
      const state = createTournament(size); state.showTitles = showTitles;
      const d = dimensions(format, orientation), H = d.height / d.width * 1440;
      const geo = bracketGeometry(size, H, showTitles);
      for (const row of geo.nodes) for (const p of row) {
        assert.ok(p.x >= 0 && p.x <= geo.W); assert.ok(p.y >= 0 && p.y <= H);
      }
      assert.ok(geo.bottom < H);
      assert.ok(renderBracket(state, { displaySize: size, format, orientation }).includes(`width="${d.width}" height="${d.height}"`));
    }
  });
}
test('A4/A5 pixels match 300dpi; full HD is always 1920x1080', () => {
  assert.deepEqual(dimensions('a4', 'portrait'), { width: 2480, height: 3508, dpi: 300 });
  assert.deepEqual(dimensions('a5', 'landscape'), { width: 2480, height: 1748, dpi: 300 });
  assert.equal(dimensions('hd', 'portrait').width, 1920);
});
test('PNG pHYs embeds 300dpi, has a valid CRC and replaces existing metadata', () => {
  const original = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=', 'base64');
  const out = withDpi(original, 300);
  assert.equal(Buffer.from(out.slice(37, 41)).toString(), 'pHYs');
  assert.equal(new DataView(out.buffer).getUint32(41), 11811);
  assert.equal(out[49], 1);
  assert.equal(new DataView(out.buffer).getUint32(50), crc32(out.slice(37, 50)));
  assert.deepEqual(withDpi(out, 300), out);
});

test('winner routes include the outgoing arm through quarterfinals on both sides', () => {
  for (const size of [8, 16, 32, 64]) {
    const state = createTournament(size);
    state.rounds[0] = Array.from({ length: size }, (_, i) => `Player ${i}`);
    for (let r = 0; r < state.rounds.length - 1; r++) {
      for (let i = 0; i < state.rounds[r].length; i += 2) advance(state, r, i);
    }
    const { nodes, levels } = bracketGeometry(size, 810);
    const svg = renderBracket(state);
    const red = svg.match(/<g stroke="#e71920"[^>]*>(.*?)<\/g>/)[1];
    for (let r = 0; r < levels - 1; r++) {
      for (let i = 0; i < nodes[r].length; i += 2) {
        const p = nodes[r][i], dest = nodes[r + 1][i / 2];
        const outgoing = state.rounds[r].length >= 8 ? `H${nodes[r + 2][Math.floor(i / 4)].x}` : '';
        assert.ok(red.includes(`<path d="M${p.x} ${p.y}H${dest.x}V${dest.y}${outgoing}"/>`));
      }
    }
    assert.match(svg, /stroke="#e71920"[^>]*stroke-linecap="square"/);
  }
});
test('result supplements use valid SVG alignment outside both player blocks', () => {
  const state = createTournament(8);
  state.showResultNotes = true;
  state.resultNotes[0][0] = '左結果';
  state.resultNotes[0][4] = '右結果';
  const svg = renderBracket(state);
  assert.match(svg, /text-anchor="start"[^>]*>左結果<\/text>/);
  assert.match(svg, /text-anchor="end"[^>]*>右結果<\/text>/);
  assert.ok(!svg.includes('text-anchor="left"'));
  assert.ok(!svg.includes('text-anchor="right"'));
});

test('match supplements sit inside both connector shapes and are vertically centered', () => {
  const state = createTournament(8);
  state.showMatchNotes = true;
  state.matchNotes[0][0] = '試合補足';
  state.matchNotes[0][2] = '右試合補足';
  const { nodes } = bracketGeometry(8, 810);
  const leftIntersection = nodes[1][0];
  const rightIntersection = nodes[1][2];
  const svg = renderBracket(state);
  assert.match(svg, new RegExp(`<text x="${leftIntersection.x - 10}" y="${leftIntersection.y}" font-size="29.25" text-anchor="end" dominant-baseline="central"[^>]*>試合補足</text>`));
  assert.match(svg, new RegExp(`<text x="${rightIntersection.x + 10}" y="${rightIntersection.y}" font-size="29.25" text-anchor="start" dominant-baseline="central"[^>]*>右試合補足</text>`));
});

