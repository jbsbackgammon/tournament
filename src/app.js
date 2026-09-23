import { createTournament, validateTournament, SIZES, TITLE_COLORS, roundLabel, editEntry, advance, seededRounds, sameName } from './model.js';
import { importTournament } from './parser.js';
import { renderBracket, dimensions, escapeXml as esc } from './render.js';
import { exportPng, downloadBlob } from './export.js';

const $ = id => document.getElementById(id);
let state = createTournament(16);
let view = { displaySize: 16, format: 'hd', orientation: 'landscape' };
let editRound = 0, dirty = false;
const orientationFor = format => format === 'a4' ? 'portrait' : 'landscape';
let noticeTimer;
const note = (message, error = false) => {
  clearTimeout(noticeTimer);
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
  if (!error) noticeTimer = setTimeout(() => { $('notice').textContent = ''; }, 4000);
};
const safeFilename = name => (name || 'tournament').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100);
const historyKey = 'tournament-history-v1';
function readHistory() { try { const value = JSON.parse(localStorage.getItem(historyKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeHistory(entry) { const items = [entry, ...readHistory().filter(item => item.id !== entry.id)].slice(0, 100); localStorage.setItem(historyKey, JSON.stringify(items)); }
function renderHistory() { const select = $('history-select'); const items = readHistory(); select.innerHTML = items.length ? items.map((item, i) => `<option value="${i}">${esc(item.label)}</option>`).join('') : '<option value="">履歴はありません</option>'; }

function preview() {
  $('preview').innerHTML = renderBracket(state, view);
  const { width, height, dpi } = dimensions(view.format, view.orientation);
  $('dimensions').textContent = `${width.toLocaleString()} × ${height.toLocaleString()} px${view.format === 'hd' ? '' : `・${dpi}dpi`}`;
  view.orientation = orientationFor(view.format);
  $('show-notes').disabled = view.displaySize === 64;
}

function syncControls() {
  state.subtitle = 'バックギャモン';
  state.footer = '';
  $('source-size').value = state.size;
  for (const field of ['edition', 'title', 'accent', 'champion']) $(field).value = state[field];
  $('accent-swatch').style.backgroundColor = state.accent;
  $('show-notes').checked = state.showNotes;
  $('show-titles').checked = state.showTitles;
  $('show-bottom-margin').checked = state.showBottomMargin;
  $('show-losers-gray').checked = state.showLosersGray;
  $('show-bye-gray').checked = state.showByeGray;
  $('titles-editor').hidden = !state.showTitles;
  if (!SIZES.includes(view.displaySize) || view.displaySize > state.size) view.displaySize = state.size;
  $('output-size').value = view.displaySize;
  $('format').value = view.format;
  $('edit-round').innerHTML = state.rounds.map((round, r) => `<option value="${r}">${roundLabel(round.length)}・${round.length}枠</option>`).join('');
  $('edit-round').value = editRound;
  renderTitles(); renderPlayers(); preview();
}

function renderTitles() {
  $('titles-editor').innerHTML = state.titles.map((entry, i) => `<div class="title-item" style="border-color:${TITLE_COLORS[i]}"><div class="row"><label class="edition">回次等<input data-ti="${i}" data-tf="edition" value="${esc(entry.edition)}" maxlength="40" aria-label="${i + 1}つ目のタイトルの回次等"></label><label>タイトル<input data-ti="${i}" data-tf="title" value="${esc(entry.title)}" maxlength="80" aria-label="${i + 1}つ目のタイトル名"></label></div><label>優勝者<input data-ti="${i}" data-tf="winner" value="${esc(entry.winner)}" maxlength="100" aria-label="${i + 1}つ目のタイトル優勝者"></label></div>`).join('');
}

function renderPlayers() {
  const rounds = seededRounds(state), names = rounds[editRound];
  const showNotes = state.showNotes && view.displaySize !== 64;
  const cards = [];
  for (let i = 0; i < names.length; i += 2) {
    const pair = [i, i + 1].map(index => {
      const name = names[index];
      const winner = editRound === rounds.length - 1 ? state.champion : rounds[editRound + 1][Math.floor(index / 2)];
      const opponent = names[index % 2 ? index - 1 : index + 1];
      const selected = sameName(name, winner);
      const lost = !selected && sameName(opponent, winner);
      return `<div class="player-row"><div class="player-fields"><input data-player="${index}" value="${esc(name)}" maxlength="100" placeholder="未定（不戦勝枠はBYE）" aria-label="選手${index + 1}">${showNotes ? `<input class="note" data-note="${index}" value="${esc(state.notes[name] || '')}" maxlength="100" placeholder="補足" aria-label="選手${index + 1}の補足">` : ''}</div><button data-win="${index}" class="${selected ? 'is-winner' : lost ? 'is-loser' : ''}" ${!name || name === 'BYE' ? 'disabled' : ''} aria-label="${esc(name || `選手${index + 1}`)}を勝者にする">${lost ? '負' : '勝'}</button></div>`;
    }).join('');
    cards.push(`<div class="match-card"><div class="match-label">${names.length === 2 ? '決勝' : `${i < names.length / 2 ? '左' : '右'}ブロック　対戦${i / 2 + 1}`}</div>${pair}</div>`);
  }
  $('players-editor').innerHTML = cards.join('');
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
    syncControls(); note(`${state.size}枠を取り込みました。`);
  } catch (error) { note(error.message, true); }
}

$('import-source').addEventListener('click', () => importText($('source-text').value));
$('new-tournament').addEventListener('click', async () => {
  if (!await mayReplace()) return;
  state = createTournament(Number($('source-size').value));
  view.displaySize = state.size; editRound = 0; dirty = true;
  syncControls(); note(`${state.size}枠を作成しました。`);
});
for (const field of ['edition', 'title', 'accent', 'champion']) $(field).addEventListener('input', event => {
  state[field] = event.target.value; if (field === 'accent') $('accent-swatch').style.backgroundColor = event.target.value; dirty = true; preview();
});
$('champion').addEventListener('change', renderPlayers);
$('format').addEventListener('change', event => { view.format = event.target.value; view.orientation = orientationFor(view.format); preview(); });
$('output-size').addEventListener('change', event => {
  view.displaySize = Number(event.target.value);
  editRound = Math.log2(state.size / view.displaySize);
  syncControls();
});
$('show-notes').addEventListener('change', event => { state.showNotes = event.target.checked; dirty = true; renderPlayers(); preview(); });
$('show-losers-gray').addEventListener('change', event => { state.showLosersGray = event.target.checked; dirty = true; preview(); });
$('show-bye-gray').addEventListener('change', event => { state.showByeGray = event.target.checked; dirty = true; preview(); });
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
    button.classList.remove('is-winner'); button.textContent = '勝';
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
    const index = Number(button.dataset.win);
    const name = state.rounds[editRound][index];
    const selected = editRound === state.rounds.length - 1
      ? sameName(state.champion, name)
      : sameName(state.rounds[editRound + 1][Math.floor(index / 2)], name);
    if (selected) {
      if (editRound === state.rounds.length - 1) state.champion = '';
      else editEntry(state, editRound + 1, Math.floor(index / 2), '');
    } else advance(state, editRound, index);
    dirty = true; renderPlayers(); preview();
    note(editRound === state.rounds.length - 1 ? '優勝者を反映しました。' : '次のラウンドに勝者を反映しました。');
  } catch (error) { note(error.message, true); }
});
$('save-json').addEventListener('click', () => {
  downloadBlob(new Blob([JSON.stringify({ ...state, view }, null, 2)], { type: 'application/json' }), `${safeFilename(state.edition + state.title)}.json`);
  dirty = false; note('大会データを保存しました。');
});
$('history-load').addEventListener('click', () => { renderHistory(); $('history-dialog').showModal(); });
$('history-dialog').addEventListener('close', async () => {
  if ($('history-dialog').returnValue !== 'load') return;
  const item = readHistory()[Number($('history-select').value)];
  if (!item || !await mayReplace()) return;
  state = validateTournament(item.state); view = item.view; editRound = 0; dirty = false; syncControls(); note('履歴を呼び出しました。');
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
    writeHistory({ id: `${Date.now()}-${Math.random()}`, label: `${snapshot.edition || ''}${snapshot.title || '大会'}・${new Date().toLocaleString('ja-JP')}`, state: snapshot, view: settings });
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
  }
} catch { /* The empty manual editor remains usable. */ }
syncControls();
