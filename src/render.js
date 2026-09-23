import { displayRounds, sameName, seededRounds, TITLE_COLORS } from './model.js';
import { logoData } from './logo.js';

export const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function dimensions(format, orientation = 'landscape') {
  if (format === 'hd') return { width: 1920, height: 1080, dpi: 96 };
  const [short, long] = format === 'a5' ? [1748, 2480] : [2480, 3508];
  return { width: orientation === 'portrait' ? short : long, height: orientation === 'portrait' ? long : short, dpi: 300 };
}
const estimateWidth = str => [...str].reduce((sum, c) => sum + (/[\x20-\x7e]/.test(c) ? .6 : 1), 0);

export function bracketGeometry(size, H, showTitles = false) {
  const W = 1440, margin = 70, box = size === 64 ? 244 : 265;
  const levels = Math.log2(size), half = size / 2;
  const top = size === 8 ? H * .30 : size === 64 ? H * .045 : H * .145;
  const bottom = H * (showTitles ? .79 : (state.showBottomMargin ? .78 : .90));
  const pitch = (bottom - top) / half;
  const edge = margin + box, centerGap = 212;
  const step = (W / 2 - centerGap / 2 - edge) / (levels - 1);
  const nodes = Array.from({ length: levels }, (_, r) => Array.from({ length: size / 2 ** r }, (_, i) => {
    const perSide = half / 2 ** r, side = i >= perSide ? 1 : 0;
    return { x: side ? W - edge - step * r : edge + step * r, y: top + ((i % perSide) + .5) * pitch * 2 ** r, side };
  }));
  return { W, H, margin, box, top, bottom, pitch, nodes, levels };
}

export function renderBracket(state, options = {}) {
  const size = options.displaySize || state.size;
  const { width, height } = dimensions(options.format || 'hd', options.orientation);
  const H = height / width * 1440;
  const { start } = displayRounds(state, size);
  const rounds = seededRounds(state).slice(start);
  const { W, margin, box, top, pitch, nodes, levels, bottom } = bracketGeometry(size, H, state.showTitles);
  const line = size === 64 ? 7 : 14;
  const font = Math.min(size === 8 ? 45 : 35, pitch * .49);
  const notes = state.showNotes && size !== 64;
  const accent = /^#[0-9a-f]{6}$/i.test(state.accent) ? state.accent : '#70700d';
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(state.edition + state.title || 'トーナメント表')}">`, `<rect width="${W}" height="${H}" fill="white"/>`, `<g font-family="'Yu Gothic','Meiryo','Hiragino Kaku Gothic ProN',sans-serif" fill="#080808">`];
  const text = (value, x, y, fs, maxWidth, color = '#080808', weight = 700) => {
    const fit = estimateWidth(String(value)) * fs > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle" fill="${color}" font-weight="${weight}"${fit}>${escapeXml(value)}</text>`;
  };
  const paths = [], winners = [];
  nodes.forEach((row, r) => row.forEach((p, i) => {
    if (r === levels - 1) return;
    const dest = nodes[r + 1][Math.floor(i / 2)];
    const d = `M${p.x} ${p.y}H${dest.x}V${dest.y}`;
    paths.push(d);
    if (rounds[r][i] !== 'BYE' && sameName(rounds[r][i], rounds[r + 1][Math.floor(i / 2)])) winners.push(d);
  }));
  const finalY = nodes.at(-1)[0].y;
  for (const side of [0, 1]) {
    const p = nodes.at(-1)[side];
    const d = `M${p.x} ${p.y}H${W / 2}V${finalY - 36}`;
    paths.push(d);
    if (sameName(rounds.at(-1)[side], state.champion)) winners.push(d);
  }
  for (const [items, color] of [[paths, '#c0c0c0'], [winners, '#e71920']]) {
    parts.push(`<g stroke="${color}" stroke-width="${line}" fill="none" stroke-linejoin="miter">${items.map(d => `<path d="${d}"/>`).join('')}</g>`);
  }
  const eliminated = i => {
    const name = rounds[0][i]; let index = i;
    if (name === 'BYE') return true;
    for (let r = 1; r < rounds.length; r++) {
      index = Math.floor(index / 2);
      const winner = rounds[r][index];
      if (!winner) return false;
      if (!sameName(name, winner)) return true;
    }
    return state.champion ? !sameName(name, state.champion) : false;
  };
  rounds[0].forEach((name, i) => {
    const p = nodes[0][i];
    const x = p.side ? W - margin - box : margin;
    const y = p.y - pitch / 2;
    const fill = name === 'BYE' ? (state.showByeGray ? '#d9d9d9' : '#fff') : (eliminated(i) && state.showLosersGray ? '#d9d9d9' : '#fff');
    const note = notes ? state.notes[name] : '';
    parts.push(`<rect x="${x}" y="${y}" width="${box}" height="${pitch}" fill="${fill}" stroke="#858585" stroke-width="${size === 64 ? 1.5 : 3.5}"/>`);
    parts.push(text(name || '未定', x + box / 2, p.y + (note ? -font * .03 : font * .35), font, box - 22));
    if (note) parts.push(text(note, x + box / 2, p.y + font * .72, font * .52, box - 24));
  });
  const portrait = H > W;
  const titleWidth = size === 64 ? 300 : 350;
  const titleY = size === 8 ? H * .135 : portrait ? Math.min(H * .09, 155) : H * .13;
  const titleFont = size === 64 ? 66 : 81;
  parts.push(text(state.edition, W / 2, titleY - titleFont * .85, 32, titleWidth));
  parts.push(text(state.title || '大会名', W / 2, titleY + 15, titleFont, titleWidth));
  parts.push(`<rect x="${W / 2 - titleWidth / 2}" y="${titleY + 30}" width="${titleWidth}" height="42" fill="${accent}"/>`);
  parts.push(text(state.subtitle, W / 2, titleY + 59, 27, titleWidth - 30, '#fff'));
  const championY = Math.max(titleY + 115, finalY - (portrait ? H * .16 : 102));
  parts.push(text('優勝', W / 2, championY, 26, 205));
  if (state.champion) parts.push(text(state.champion, W / 2, championY + 36, 29, 202));
  const logoW = portrait ? 205 : 178, logoH = logoW * 1100 / 1830;
  const logoY = Math.max(finalY + 50, bottom - logoH - 14);
  parts.push(`<image href="${logoData}" x="${W / 2 - logoW / 2}" y="${logoY}" width="${logoW}" height="${logoH}"/>`);
  if (state.showTitles) {
    const y = H * .835, h = H * .125, col = (W - margin * 2) / 5, pad = 7;
    state.titles.forEach((entry, i) => {
      const x = margin + i * col, w = col - pad;
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${TITLE_COLORS[i]}"/>`);
      parts.push(text(entry.edition, x + w / 2, y + h * .20, Math.min(19, h * .17), w - 20, 'white'));
      parts.push(text(entry.title, x + w / 2, y + h * .44, Math.min(28, h * .25), w - 20, 'white'));
      parts.push(`<rect x="${x + 14}" y="${y + h * .54}" width="${w - 28}" height="${h * .39}" fill="white"/>`);
      parts.push(text(entry.winner, x + w / 2, y + h * .82, Math.min(29, h * .24), w - 45));
    });
  }
  if (state.footer) parts.push(text(state.footer, W / 2, H - 12, 16, W - 100, '#555', 500));
  parts.push('</g></svg>');
  return parts.join('');
}
