import { createTournament, validateTournament, SIZES, TITLE_COLORS, roundLabel, editEntry, advance, seededRounds, sameName } from './model.js';
import { importTournament } from './parser.js';
import { renderBracket, dimensions, escapeXml as esc } from './render.js';
import { exportPng, downloadBlob } from './export.js';

const $ = id => document.getElementById(id);
let state = createTournament(16);
let view = { displaySize: 16, format: 'hd', orientation: 'landscape' };
let editRound = 0, dirty = false;
const note = (message, error = false) => { $('notice').textContent = message; $('notice').classList.toggle('error', error); };
const safeFilename = name => (name || 'tournament').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100);

function preview() {
  $('preview').innerHTML = renderBracket(state, view);
  $('preview-title').textContent = state.edition + state.title || 'トーナメント表';
  $('draw-badge').textContent = `${view.displaySize}枠${view.displaySize < state.size ? ` / 元データ${state.size}枠` : ''}`;
  const { width, height, dpi } = dimensions(view.format, view.orientation);
  $('dimensions').textContent = `${width.toLocaleString()} × ${height.toLocaleString()} px${view.format === 'hd' ? '' : `・${dpi}dpi`}`;
  $('orientation').disabled = view.format === 'hd';
  $('show-notes').disabled = view.displaySize === 64;
  $('notes-help').textContent = view.displaySize === 64 ? '64枠では補足を非表示にします。入力済みの内容は保持されます。' : '名前の下に補足を小さく表示できます。';
  $('display-help').textContent = view.displaySize < state.size ? `元の${state.size}枠を保持し、ベスト${view.displaySize}以降だけを表示します。` : '対戦表全体を表示しています。';
}

function syncControls() {
  $('source-size').value = state.size;
  for (const field of ['edition', 'title', 'subtitle', 'footer', 'accent', 'champion']) $(field).value = state[field];
  $('show-notes').checked = state.showNotes;
  $('show-titles').checked = state.showTitles;
  $('titles-editor').hidden = !state.showTitles;
  $('display-size').innerHTML = SIZES.filter(n => n <= state.size).map(n => `<option value="${n}">${n}枠${n < state.size ? `（ベスト${n}以降）` : '（全体）'}</option>`).join('');
  $('display-size').value = view.displaySize;
  $('format').value = view.format; $('orientation').value = view.orientation;
  $('edit-round').innerHTML = state.rounds.map((round, r) => `<option value="${r}">${roundLabel(round.length)}・${round.length}枠</option>`).join('');
  $('edit-round').value = editRound;
  renderTitles(); renderPlayers(); preview();
}

function renderTitles() {
  $('titles-editor').innerHTML = state.titles.map((entry, i) => `<div class="title-item" style="border-color:${TITLE_COLORS[i]}"><div class="row"><label class="edition">期・回<input data-ti="${i}" data-tf="edition" value="${esc(entry.edition)}" maxlength="40" aria-label="${i + 1}つ目のタイトルの期・回"></label><label>タイトル<input data-ti="${i}" data-tf="title" value="${esc(entry.title)}" maxlength="80" aria-label="${i + 1}つ目のタイトル名"></label></div><label>優勝者<input data-ti="${i}" data-tf="winner" value="${esc(entry.winner)}" maxlength="100" aria-label="${i + 1}つ目のタイトル優勝者"></label></div>`).join('');
}

function renderPlayers() {
  const rounds = seededRounds(state), names = rounds[editRound];
  const showNotes = state.showNotes && view.displaySize !== 64;
  const cards = [];
  for (let i = 0; i < names.length; i += 2) {
    const pair = [i, i + 1].map(index => {
      const name = names[index];
      const winner = editRound === rounds.length - 1 ? state.champion : rounds[editRound + 1][Math.floor(index / 2)];
      return `<div class="player-row"><div class="player-fields"><input data-player="${index}" value="${esc(name)}" maxlength="100" placeholder="未定（不戦勝枠はBYE）" aria-label="選手${index + 1}">${showNotes ? `<input class="note" data-note="${index}" value="${esc(state.notes[name] || '')}" maxlength="100" placeholder="補足（所属・予選順位など）" aria-label="選手${index + 1}の補足">` : ''}</div><button data-win="${index}" class="${sameName(name, winner) ? 'is-winner' : ''}" ${!name || name === 'BYE' ? 'disabled' : ''} aria-label="${esc(name || `選手${index + 1}`)}を勝者にする">勝者${sameName(name, winner) ? ' ✓' : ''}</button></div>`;
    }).join('');
    cards.push(`<div class="match-card"><div class="match-label">${names.length === 2 ? '決勝' : `${i < names.length / 2 ? '左' : '右'}ブロック　対戦${i / 2 + 1}`}</div>${pair}</div>`);
  }
  $('players-editor').innerHTML = cards.join('');
  $('seed-info').textContent = 'BYEは不戦勝枠です。eJBSの途中ラウンドにある選手は空の枝へ補完します。同名の複数エントリーは保持します。';
  $('champion').value = state.champion;
}

async function mayReplace() {
  if (!dirty) return true;
  const dialog = $('replace-dialog');
  dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'replace'), { once: true }));
}

async function importText(text, sample = false) {
  try {
    const result = importTournament(text, Number($('source-size').value));
    if (!await mayReplace()) return;
    state = result.state;
    view.displaySize = state.size;
    editRound = 0; dirty = !sample;
    syncControls(); note(result.message + (sample ? ' 共有例を表示しています。' : ''));
  } catch (error) { note(error.message, true); }
}

$('import-source').addEventListener('click', () => importText($('source-text').value));
$('source-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('ファイルは2MB以内にしてください。');
    const text = await file.text(); $('source-text').value = text;
    await importText(text);
  } catch (error) { note(error.message, true); }
  event.target.value = '';
});
for (const size of [16, 64]) $('sample-' + size).addEventListener('click', async () => {
  try {
    const response = await fetch(`./fixtures/ejbs-${size}.html`);
    if (!response.ok) throw new Error('サンプルを読み込めませんでした。');
    await importText(await response.text(), true);
  } catch (error) { note(error.message, true); }
});
$('new-tournament').addEventListener('click', async () => {
  if (!await mayReplace()) return;
  state = createTournament(Number($('source-size').value));
  view.displaySize = state.size; editRound = 0; dirty = true;
  syncControls(); note(`${state.size}枠の大会を作成しました。下の編集画面から選手名を入力できます。`);
});
for (const field of ['edition', 'title', 'subtitle', 'footer', 'accent', 'champion']) $(field).addEventListener('input', event => {
  state[field] = event.target.value; dirty = true; preview();
});
$('champion').addEventListener('change', renderPlayers);
$('display-size').addEventListener('change', event => {
  view.displaySize = Number(event.target.value);
  editRound = Math.log2(state.size / view.displaySize);
  $('edit-round').value = editRound; renderPlayers(); preview();
});
for (const field of ['format', 'orientation']) $(field).addEventListener('change', event => { view[field] = event.target.value; preview(); });
$('show-notes').addEventListener('change', event => { state.showNotes = event.target.checked; dirty = true; renderPlayers(); preview(); });
$('show-titles').addEventListener('change', event => { state.showTitles = event.target.checked; dirty = true; $('titles-editor').hidden = !state.showTitles; preview(); });
$('titles-editor').addEventListener('input', event => {
  const { ti, tf } = event.target.dataset;
  if (ti === undefined) return;
  state.titles[Number(ti)][tf] = event.target.value; dirty = true; preview();
});
$('edit-round').addEventListener('change', event => { editRound = Number(event.target.value); renderPlayers(); });
$('players-editor').addEventListener('change', event => {
  const { player, note: noteIndex } = event.target.dataset;
  if (player !== undefined) {
    // Materialize inferred seeds before editing so later result invalidation works.
    state.rounds = seededRounds(state);
    editEntry(state, editRound, Number(player), event.target.value);
    const row = event.target.closest('.player-row');
    const button = row.querySelector('[data-win]');
    const name = state.rounds[editRound][Number(player)];
    button.disabled = !name || name === 'BYE';
    button.setAttribute('aria-label', `${name || `選手${Number(player) + 1}`}を勝者にする`);
    button.classList.remove('is-winner'); button.textContent = '勝者';
    dirty = true; preview();
  } else if (noteIndex !== undefined) {
    const name = seededRounds(state)[editRound][Number(noteIndex)];
    if (!name || name === 'BYE') { note('補足を入れる前に選手名を入力してください。', true); return; }
    state.notes[name] = event.target.value; dirty = true; preview();
  }
});
$('players-editor').addEventListener('click', event => {
  const button = event.target.closest('[data-win]');
  if (!button) return;
  try {
    state.rounds = seededRounds(state);
    advance(state, editRound, Number(button.dataset.win));
    dirty = true; renderPlayers(); preview();
    note(editRound === state.rounds.length - 1 ? '優勝者を反映しました。' : '次のラウンドに勝者を反映しました。');
  } catch (error) { note(error.message, true); }
});
$('save-json').addEventListener('click', () => {
  downloadBlob(new Blob([JSON.stringify({ ...state, view }, null, 2)], { type: 'application/json' }), `${safeFilename(state.edition + state.title)}.json`);
  dirty = false; note('大会データを保存しました。');
});
$('open-json').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('ファイルは2MB以内にしてください。');
    const raw = JSON.parse(await file.text()), next = validateTournament(raw);
    if (!await mayReplace()) return;
    state = next;
    view = { displaySize: SIZES.includes(raw.view?.displaySize) && raw.view.displaySize <= state.size ? raw.view.displaySize : state.size, format: ['a4', 'a5', 'hd'].includes(raw.view?.format) ? raw.view.format : 'hd', orientation: raw.view?.orientation === 'portrait' ? 'portrait' : 'landscape' };
    editRound = Math.log2(state.size / view.displaySize); dirty = false;
    syncControls(); note('大会データを読み込みました。');
  } catch (error) { note(`読み込めませんでした。${error.message}`, true); }
  finally { event.target.value = ''; }
});
$('export-png').addEventListener('click', async () => {
  $('export-png').disabled = true;
  try {
    // Capture an immutable snapshot so settings cannot change the filename mid-export.
    const snapshot = structuredClone(state), settings = { ...view };
    const blob = await exportPng(snapshot, settings);
    const { width, height } = dimensions(settings.format, settings.orientation);
    downloadBlob(blob, `tournament_${safeFilename(snapshot.edition + snapshot.title)}_${settings.displaySize}_${width}x${height}.png`);
    note('PNGを書き出しました。');
  } catch (error) { note(`PNGを書き出せませんでした。${error.message}`, true); }
  finally { $('export-png').disabled = false; }
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

// Shared example is clearly marked, and is never fetched from an external service.
try {
  const response = await fetch('./fixtures/ejbs-16.html');
  if (response.ok) {
    state = importTournament(await response.text()).state;
    note('共有例「第15回新鋭戦」を表示しています。取り込み・新規作成から編集を始められます。');
  }
} catch { /* The empty manual editor remains usable. */ }
syncControls();
