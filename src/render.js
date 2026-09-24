import { displayRounds, displayEntrants, sameName, seededRounds, TITLE_COLORS } from './model.js';
import { logoData } from './logo.js';

export const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function dimensions(format, orientation = 'landscape') {
  if (format === 'hd') return { width: 1920, height: 1080, dpi: 96 };
  const [short, long] = format === 'a5' ? [1748, 2480] : [2480, 3508];
  return { width: orientation === 'portrait' ? short : long, height: orientation === 'portrait' ? long : short, dpi: 300 };
}
const estimateWidth = str => [...str].reduce((sum, c) => sum + (/[\x20-\x7e]/.test(c) ? .6 : 1), 0);

export function bracketGeometry(size, H, showTitles = false, showBottomMargin = false, outputWidth = 1920) {
  const W = 1440, margin = 70, box = size === 64 ? 244 : 265;
  const levels = Math.log2(size), half = size / 2;
  // Keep the image edge and the bracket position consistent in physical pixels
  // across all output sizes: 40px top blank + 160px header space, and 40px
  // bottom blank (or 120px when the optional bottom margin is enabled).
  const pxScale = outputWidth / W;
  const outputScale = outputWidth / 1920;
  const top = (160 * outputScale) / pxScale;
  const imageBottomGap = (40 * outputScale) / pxScale;
  const titleGap = (20 * outputScale) / pxScale;
  const titleHeight = 151.875 / (1920 / 1440);
  const bottom = (showTitles || showBottomMargin)
    ? H - imageBottomGap - titleHeight - titleGap
    : H - imageBottomGap;
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
  rounds[0] = displayEntrants(rounds[0]);
  const { W, margin, box, top, pitch, nodes, levels, bottom } = bracketGeometry(size, H, state.showTitles, state.showBottomMargin, width);
  const line = size === 64 ? 8 : size === 32 ? 10 : 14;
  const font = Math.min(size === 8 ? 45 : 35, pitch * .49);
  const notes = state.showNotes && size !== 64;
  const accent = /^#[0-9a-f]{6}$/i.test(state.accent) ? state.accent : '#000000';
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(state.edition + state.title || 'トーナメント表')}">`, `<rect width="${W}" height="${H}" fill="white"/>`, `<g font-family="'Noto Sans JP','Yu Gothic','Meiryo','Hiragino Kaku Gothic ProN',sans-serif" fill="#080808">`];
  const text = (value, x, y, fs, maxWidth, color = '#080808', weight = 700) => {
    const fit = estimateWidth(String(value)) * fs > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle" fill="${color}" font-weight="${weight}"${fit}>${escapeXml(value)}</text>`;
  };
  // Cropped ellipses form simple, solid domes in both upper corners. Their
  // 480-unit center gap keeps even a long sponsor edition clear of the color.
  parts.push(`<ellipse cx="0" cy="0" rx="480" ry="100" fill="${accent}"/>`);
  parts.push(`<ellipse cx="${W}" cy="0" rx="480" ry="100" fill="${accent}"/>`);
  const paths = [], winners = [], supplementParts = [];
  nodes.forEach((row, r) => row.forEach((p, i) => {
    if (r === levels - 1) return;
    const dest = nodes[r + 1][Math.floor(i / 2)];
    const d = `M${p.x} ${p.y}H${dest.x}V${dest.y}`;
    paths.push(d);
    if (rounds[r][i] !== 'BYE' && sameName(rounds[r][i], rounds[r + 1][Math.floor(i / 2)])) {
      // Through the quarterfinals, show the winner reaching the next match.
      const next = rounds[r].length >= 8 ? nodes[r + 2][Math.floor(i / 4)] : null;
      winners.push(d + (next ? `H${next.x}` : ''));
    }
  }));
  const supplementText = (value, x, y, maxWidth, anchor = 'middle', wrapAt = null, scale = .5, middle = false) => {
    if (!value) return '';
    const base = font * scale;
    const chars = [...String(value)];
    const needsWrap = wrapAt !== null && chars.length > wrapAt;
    const fs = base;
    const baseline = middle ? ' dominant-baseline="central"' : '';
    if (!needsWrap) return `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="${anchor}"${baseline} fill="#080808" font-weight="700">${escapeXml(value)}</text>`;
    const lines = [];
    for (let i = 0; i < chars.length; i += wrapAt) lines.push(chars.slice(i, i + wrapAt).join(''));
    const startY = y - fs * 1.05 * (lines.length - 1);
    return `<text x="${x}" y="${startY}" font-size="${fs}" text-anchor="${anchor}" fill="#080808" font-weight="700">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? fs * 1.05 : 0}">${escapeXml(line)}</tspan>`).join('')}</text>`;
  };
  if (state.showMatchNotes || state.showResultNotes) {
    for (let r = 0; r < levels - 1; r++) for (let i = 0; i < nodes[r].length; i += 2) {
      const p = nodes[r][i], dest = nodes[r + 1][Math.floor(i / 2)];
      const note = state.matchNotes?.[start + r]?.[Math.floor(i / 2)];
      const upperResult = state.resultNotes?.[start + r]?.[i];
      const lowerResult = state.resultNotes?.[start + r]?.[i + 1];
      if (state.showMatchNotes) {
        const matchX = dest.x + (p.side ? 10 : -10);
        const matchAlign = p.side ? 'start' : 'end';
        supplementParts.push(supplementText(note, matchX, dest.y, Math.abs(dest.x - p.x) - 20, matchAlign, null, .65, true));
      }
      if (state.showResultNotes) {
        const align = p.side ? 'end' : 'start';
        const x = p.side ? p.x - 10 : p.x + 10;
        // The rendered glyph height varies with the compact 32/64-player layouts.
        // Tune the lower baseline per size so its visible gap matches the upper note.
        const lowerBaselineOffset = font * (size === 32 ? .25 : size === 64 ? .4 : .5) + (size === 32 ? 2 : 0);
        supplementParts.push(supplementText(upperResult, x, nodes[r][i].y - line * 1.2, Math.abs(dest.x - p.x) - 20, align));
        supplementParts.push(supplementText(lowerResult, x, nodes[r][i + 1].y + line * 1.2 + lowerBaselineOffset, Math.abs(dest.x - p.x) - 20, align));
      }
    }
    if (state.showResultNotes) {
      const finalNotes = state.resultNotes?.[state.rounds.length - 1] || [];
      const finalY = nodes.at(-1)[0].y;
      supplementParts.push(supplementText(finalNotes[0], nodes.at(-1)[0].x + 10, finalY - line * 1.2, W / 2 - 40, 'start', 4));
      supplementParts.push(supplementText(finalNotes[1], nodes.at(-1)[1].x - 10, finalY - line * 1.2, W / 2 - 40, 'end', 4));
    }
    if (state.showMatchNotes) {
      const finalMatchNote = state.matchNotes?.[state.rounds.length - 1]?.[0];
      const finalY = nodes.at(-1)[0].y;
      supplementParts.push(supplementText(finalMatchNote, W / 2, finalY + line + font * .325, W / 2 - 40, 'middle', null, .65, true));
    }
  }
  const finalY = nodes.at(-1)[0].y;
  for (const side of [0, 1]) {
    const p = nodes.at(-1)[side];
    const d = `M${p.x} ${p.y}H${W / 2}V${finalY - 36}`;
    paths.push(d);
    if (sameName(rounds.at(-1)[side], state.champion)) winners.push(d);
  }
  for (const [items, color] of [[paths, '#c0c0c0'], [winners, '#e71920']]) {
    parts.push(`<g stroke="${color}" stroke-width="${line}" fill="none" stroke-linejoin="miter" stroke-linecap="square">${items.map(d => `<path d="${d}"/>`).join('')}</g>`);
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
    const displayName = name || 'BYE';
    const fill = displayName === 'BYE' ? '#d9d9d9' : (eliminated(i) && state.showLosersGray ? '#d9d9d9' : '#fff');
    const note = notes ? state.notes[name] : '';
    parts.push(`<rect x="${x}" y="${y}" width="${box}" height="${pitch}" fill="${fill}" stroke="#858585" stroke-width="${size === 64 ? 1.5 : 3.5}"/>`);
    if (note) {
      const noteFont = font * .52;
      // Divide the space between the frame and the two text rows into three equal gaps.
      const gap = Math.max(0, (pitch - font - noteFont) / 3);
      const nameY = y + gap + font * .8;
      const noteY = nameY + gap + font * .2 + noteFont * .8;
      parts.push(text(displayName, x + box / 2, nameY, font, box - 22));
      parts.push(text(note, x + box / 2, noteY, noteFont, box - 24));
    } else {
      parts.push(text(displayName, x + box / 2, p.y + font * .35, font, box - 22));
    }
  });
  parts.push(...supplementParts);
  const portrait = H > W;
  const titleWidth = size === 64 ? 300 : 350;
  const pxScale = width / W;
  const outputScale = width / 1920;
  // Keep the header inside the fixed 40px top margin + 160px header area.
  // The edition position is fixed independently; title and color band follow
  // it without reaching the bracket's 200px physical top edge.
  const titleY = (215 * outputScale) / pxScale;
  const titleFont = (120 * outputScale) / pxScale;
  const imageBottomGap = (40 * outputScale) / pxScale;
  // The edition label starts 40 physical pixels below the image edge for
  // every output size and orientation.
  const editionFont = (50 * outputScale) / pxScale;
  const editionY = (40 * outputScale) / pxScale + editionFont;
  const editionWidth = 450;
  parts.push(text(state.edition, W / 2, editionY, editionFont, editionWidth));
  if (state.title) parts.push(text(state.title, W / 2, titleY, titleFont, titleFont * 6));
  const subtitleFont = (50 * outputScale) / pxScale;
  const subtitleWidth = Math.min(titleWidth, Math.max(150 / pxScale, estimateWidth(state.subtitle) * subtitleFont * .9 + 48 / pxScale));
  const subtitleHeight = (60 * outputScale) / pxScale;
  const subtitleY = titleY + (20 * outputScale) / pxScale;
  parts.push(`<rect x="${W / 2 - subtitleWidth / 2}" y="${subtitleY}" width="${subtitleWidth}" height="${subtitleHeight}" fill="${accent}"/>`);
  parts.push(text(state.subtitle, W / 2, subtitleY + (46 * outputScale) / pxScale, subtitleFont, subtitleWidth - (20 * outputScale) / pxScale, '#fff'));
  const championOffset = size === 64 ? 102 : (portrait ? H * .10 : 102);
  const championY = Math.max(titleY + 115, finalY - championOffset);
  parts.push(text(state.championLabel ?? '優勝', W / 2, championY, 26, 205));
  if (state.champion) parts.push(text(state.champion, W / 2, championY + 36, 29, 202));
  const logoW = portrait ? 205 : 178, logoH = logoW * 1100 / 1830;
  const logoY = Math.max(finalY + 50, bottom - logoH - 14);
  if (state.showLogo !== false) parts.push(`<image href="${logoData}" x="${W / 2 - logoW / 2}" y="${logoY}" width="${logoW}" height="${logoH}"/>`);
  if (state.showTitles) {
    const h = 151.875 / (1920 / 1440);
    const y = H - imageBottomGap - h;
    const col = (W - margin * 2) / 5, pad = 7;
    state.titles.forEach((entry, i) => {
      const x = margin + i * col, w = i === 4 ? col : col - pad;
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
