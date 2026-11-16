/* eslint-disable */
/**
 * HTML da súmula de vôlei de praia (modelo da súmula em papel: cabeçalho, sets 1
 * e 2 lado a lado, set 3 na largura toda, penalidades/equipes/árbitros/resultado).
 * Cada bloco usa colunas de largura fixa em mm, então as grades ficam alinhadas.
 * Recebe os contextos de `buildSheetContext`; o estilo está em beach-scoresheet.css.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pairLabel } = require('./beach-scoresheet');

const CSS_PATH = path.join(__dirname, 'beach-scoresheet.css');

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ink = (value) => `<b class="ink">${esc(value)}</b>`;
const repeat = (count, fn) => Array.from({ length: count }, (_, i) => fn(i)).join('');

// Sets 1 e 2: meia largura, 15 quadros de saque. Set 3: largura toda, 25 quadros.
const SET_GEOMETRY = {
  half: { labels: [9, 7.5, 7.5], boxes: 15, width: 95, switchBoxes: 6, switchSpan: 2 },
  full: { labels: [12, 12, 14], boxes: 25, width: 194, switchBoxes: 7, switchSpan: 3 },
};

function colgroup(g) {
  const labelWidth = g.labels.reduce((a, b) => a + b, 0);
  const boxWidth = ((g.width - labelWidth) / g.boxes).toFixed(3);
  return `<colgroup>${g.labels.map((w) => `<col style="width:${w}mm">`).join('')}${repeat(g.boxes, () => `<col style="width:${boxWidth}mm">`)}</colgroup>`;
}

/** Linha "Pontos" 1–25: no set 3 cada número tem sua coluna; nos sets 1 e 2 dividem a célula. */
function pointsCells(g) {
  if (g.boxes === 25) return repeat(25, (i) => `<td class="pt">${i + 1}</td>`);
  return `<td colspan="${g.boxes}" class="pts"><div class="pts-row">${repeat(25, (i) => `<span>${i + 1}</span>`)}</div></td>`;
}

function serveRow(roman, g, withTeamCell) {
  const team = withTeamCell ? '<td rowspan="2" class="shade"></td>' : '';
  return `<tr class="r-serve"><td class="roman">${roman}</td>${team}<td></td>${repeat(g.boxes, (i) => `<td class="box"><span class="n">${i + 1}</span></td>`)}</tr>`;
}

const tempoCell = '<td colspan="3" class="split"><div><span></span><span></span></div></td>';
const labelHeads = (full) => `<td class="th">Saque</td><td class="th">${full ? 'Equipe' : 'Eq.'}</td><td class="th">${full ? 'Jogador' : 'Jog.'}</td>`;

function switchRow(g) {
  const arrowsSpan = g.boxes - g.switchBoxes * g.switchSpan;
  return `<tr class="r-std">${tempoCell}${repeat(g.switchBoxes, () => `<td colspan="${g.switchSpan}"></td>`)}<td colspan="${arrowsSpan}" class="arrows"><i></i>&uarr;<i></i>&darr;</td></tr>`;
}

/** Jogo encerrado sem este set: aviso no lugar das duplas. Jogo por jogar: linha em branco do modelo. */
function teamLine(set, ctx) {
  if (!set && ctx.finished) return `<div class="unplayed">${ctx.walkover ? 'Partida decidida por W.O.' : 'Set não disputado'}</div>`;
  const names = (players) => `<div class="names fit">${pairLabel(players) ? ink(pairLabel(players)) : '/'}</div>`;
  const score = (value) => `<div class="score">(${value === undefined ? '&nbsp;&nbsp;&nbsp;' : ink(value)})</div>`;
  return `${names(ctx.playersA)}${score(set?.a)}<div class="vs">X</div>${score(set?.b)}${names(ctx.playersB)}`;
}

function timeValue(set, key, finished) {
  if (!set) return finished ? '<span class="blank">–</span>' : '<span class="blank">____:____</span>';
  return set[key] ? ink(set[key]) : '<span class="blank">____:____</span>';
}

function setBlock(index, kind, ctx) {
  const g = SET_GEOMETRY[kind];
  const full = kind === 'full';
  const set = ctx.sets[index];
  const half = Math.ceil(g.boxes / 2);
  return `
  <div class="setwrap ${kind}">
  <table class="grid">${colgroup(g)}
    <tr class="r-team"><td colspan="3"></td><td colspan="${g.boxes}" class="flexcell"><div class="teamline">${teamLine(set, ctx)}</div></td></tr>
    <tr class="r-time"><td colspan="3" class="setlabel">${index + 1}º SET</td>
      <td colspan="${half}" class="time">Início: ${timeValue(set, 'start', ctx.finished)}</td>
      <td colspan="${g.boxes - half}" class="time">Fim: ${timeValue(set, 'end', ctx.finished)}</td></tr>
    <tr class="r-head">${labelHeads(full)}<td colspan="${g.boxes}" class="hint">Indicar o lado da equipe correspondente de acordo com a disposição na quadra neste momento (A ou B)</td></tr>
    ${serveRow('I', g, true)}${serveRow('III', g, false)}
    <tr class="r-std"><td colspan="3" class="th">TEMPO</td><td colspan="${g.boxes}" class="note">A equipe que iniciar sacando deverá ser colocada no 1º quadro.</td></tr>
    <tr class="r-std">${tempoCell}${pointsCells(g)}</tr>
  </table>
  <div class="pontos">Pontos</div>
  <table class="grid">${colgroup(g)}
    <tr class="r-std"><td colspan="3"></td>${pointsCells(g)}</tr>
    <tr class="r-head">${labelHeads(full)}<td colspan="${g.boxes}"></td></tr>
    ${serveRow('II', g, true)}${serveRow('IV', g, false)}
    <tr class="r-std"><td colspan="3" class="th">TEMPO</td><td colspan="${g.boxes}" class="note">PLACAR NA TROCA DE QUADRA</td></tr>
    ${switchRow(g)}
  </table>
  </div>`;
}

function header(ctx, entity) {
  const field = (label, value, span) => `<td colspan="${span}"><span class="lbl">${label}:</span> <span class="fit val">${ink(value)}</span></td>`;
  return `
  <table class="grid hdr">
    <colgroup><col style="width:46mm">${repeat(24, () => '<col style="width:6.1667mm">')}</colgroup>
    <tr><td rowspan="3" class="title">SÚMULA DE<br>VÔLEI DE PRAIA<br><span>${esc(entity)}</span></td>
      ${field('Jogo', ctx.number, 4)}${field('Naipe', ctx.category, 6)}${field('Competição', ctx.competition, 14)}</tr>
    <tr>${field('Fase', ctx.phase, 8)}${field('Local', ctx.local, 9)}${field('Data', ctx.date, 4)}${field('Hora', ctx.hour, 3)}</tr>
    <tr>${field('Forma', ctx.format, 13)}${field('Duplas', ctx.origins, 11)}</tr>
  </table>`;
}

function penaltiesTable() {
  const widths = [13, 11, 11, 11, 16, 11, 23];
  return `
  <table class="grid low">
    <colgroup>${widths.map((w) => `<col style="width:${w}mm">`).join('')}</colgroup>
    <tr class="r-low"><td colspan="7" class="c cap">Quadro de Penalidades</td></tr>
    <tr class="r-low th-row"><td>A</td><td>P</td><td>E</td><td>D</td><td>A ou B</td><td>Set</td><td>Placar</td></tr>
    ${repeat(9, () => `<tr class="r-low">${repeat(6, () => '<td></td>')}<td class="c">:</td></tr>`)}
  </table>`;
}

function teamsTable(ctx) {
  const player = (i) => `<tr class="r-low"><td class="c">${i + 1}</td><td class="fit">${ink(ctx.playersA[i]?.full)}</td><td class="c">${i + 1}</td><td class="fit">${ink(ctx.playersB[i]?.full)}</td></tr>`;
  const sign = (label) => `<tr class="r-sign"><td colspan="2" class="sign">${label}</td><td colspan="2" class="sign">${label}</td></tr>`;
  return `
  <table class="grid low">
    <colgroup><col style="width:11mm"><col style="width:37mm"><col style="width:11mm"><col style="width:37mm"></colgroup>
    <tr class="r-low"><td colspan="4" class="c cap">EQUIPES</td></tr>
    <tr class="r-low th-row"><td>Jogador</td><td>Nome</td><td>Jogador</td><td>Nome</td></tr>
    ${player(0)}${player(1)}
    <tr class="r-low"><td class="c small">Técnico</td><td></td><td class="c small">Técnico</td><td></td></tr>
    ${sign('Ass. Capitão ANTES do jogo')}${sign('Ass. Capitão APÓS o jogo')}
  </table>`;
}

function officialsTable() {
  const row = (label) => `<tr class="r-low"><td class="c">${label}</td><td></td><td></td></tr>`;
  return `
  <table class="grid low">
    <colgroup><col style="width:22mm"><col style="width:44mm"><col style="width:30mm"></colgroup>
    <tr class="r-low th-row"><td>Árbitro</td><td>Nome</td><td>Assinatura</td></tr>
    ${row('1º')}${row('2º')}${row('Apontador')}
    <tr class="r-low"><td class="c small">Juízes de Linha</td><td colspan="2" class="flexcell"><div class="linesmen">${repeat(4, (i) => `<span><i>${i + 1}</i></span>`)}</div></td></tr>
  </table>`;
}

function resultRow(ctx, index) {
  const set = ctx.sets[index];
  const label = `<span>${index + 1}º set</span>`;
  if (!set) {
    const dash = ctx.finished && !ctx.walkover ? '–' : '';
    return `<tr class="r-low"><td></td><td></td><td class="c">${dash}</td><td class="dur">${label}</td><td class="c">${dash}</td><td></td><td></td></tr>`;
  }
  const wonByA = set.a > set.b ? 1 : 0;
  return `<tr class="r-low"><td></td><td class="c">${ink(wonByA)}</td><td class="c">${ink(set.a)}</td>
    <td class="dur">${label}${set.minutes === null ? '' : ink(`${set.minutes} min`)}</td>
    <td class="c">${ink(set.b)}</td><td class="c">${ink(1 - wonByA)}</td><td></td></tr>`;
}

function resultTable(ctx) {
  const t = ctx.totals;
  const total = !ctx.finished
    ? '<tr class="r-low"><td></td><td></td><td></td><td class="dur"><span>TOTAL</span></td><td></td><td></td><td></td></tr>'
    : ctx.walkover
    ? `<tr class="r-low"><td></td><td></td><td></td><td class="dur"><span>TOTAL</span>${ink('W.O.')}</td><td></td><td></td><td></td></tr>`
    : `<tr class="r-low"><td></td><td class="c">${ink(t.setsA)}</td><td class="c">${ink(t.pointsA)}</td>
      <td class="dur"><span>TOTAL</span>${t.minutes === null ? '' : ink(`${t.minutes} min`)}</td>
      <td class="c">${ink(t.pointsB)}</td><td class="c">${ink(t.setsB)}</td><td></td></tr>`;
  return `
  <table class="grid low">
    <colgroup><col style="width:8mm"><col style="width:8mm"><col style="width:14mm"><col style="width:36mm"><col style="width:14mm"><col style="width:8mm"><col style="width:8mm"></colgroup>
    <tr class="r-low"><td colspan="3" class="c fit">${ink(pairLabel(ctx.playersA))}</td><td class="c cap">RESULTADO</td><td colspan="3" class="c fit">${ink(pairLabel(ctx.playersB))}</td></tr>
    <tr class="r-low th-row"><td>T</td><td>V</td><td>Pontos</td><td>Duração</td><td>Pontos</td><td>V</td><td>T</td></tr>
    ${resultRow(ctx, 0)}${resultRow(ctx, 1)}${resultRow(ctx, 2)}${total}
  </table>`;
}

function winnerTable(ctx) {
  return `
  <table class="grid low">
    <colgroup><col style="width:22mm"><col style="width:54mm"><col style="width:20mm"></colgroup>
    <tr class="r-low"><td class="cap">Vencedor:</td><td class="c fit">${ink(ctx.winnerNames)}</td><td class="c">${ink(ctx.winnerScore)}</td></tr>
    <tr class="r-obs"><td colspan="3" class="obs"><span class="cap">Observações:</span>${ctx.observation ? ` ${ink(ctx.observation)}` : ''}</td></tr>
  </table>`;
}

function renderSheet(ctx, entity) {
  return `
<section class="page">
  ${header(ctx, entity)}
  <div class="sets12">${setBlock(0, 'half', ctx)}${setBlock(1, 'half', ctx)}</div>
  ${setBlock(2, 'full', ctx)}
  <div class="bottom">
    <div class="col">${penaltiesTable()}${teamsTable(ctx)}</div>
    <div class="col">${officialsTable()}${resultTable(ctx)}${winnerTable(ctx)}</div>
  </div>
  <footer><span>${esc(ctx.footer)}</span><span>${esc(ctx.sheet)}</span></footer>
</section>`;
}

// Roda no Chrome antes de imprimir: reduz a fonte de nome que não cabe na célula.
const FIT_SCRIPT = `
const overflows = (n) => n.scrollWidth > n.clientWidth + 0.5 || n.scrollHeight > n.clientHeight + 0.5;
document.querySelectorAll('.fit').forEach((el) => {
  const box = el.tagName === 'SPAN' ? el.closest('td') : el;
  let size = parseFloat(getComputedStyle(el).fontSize);
  for (let guard = 0; guard < 40 && overflows(box) && size > 5; guard++) {
    size -= 0.25;
    el.style.fontSize = size + 'px';
    el.querySelectorAll('b').forEach((b) => { b.style.fontSize = size + 'px'; });
  }
});`;

/**
 * Documento completo, uma `<section class="page">` (A4) por súmula.
 * @param {object[]} contexts saídas de `buildSheetContext`
 * @param {{title: string, entity: string}} options `entity` é a 3ª linha do título (ex.: "ASAME")
 */
function renderDocument(contexts, { title, entity }) {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head>
<body>${contexts.map((ctx) => renderSheet(ctx, entity)).join('\n')}
<script>${FIT_SCRIPT}</script></body></html>`;
}

module.exports = { renderDocument };
