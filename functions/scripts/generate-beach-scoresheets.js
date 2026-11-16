/* eslint-disable */
/**
 * Gera UM PDF com a súmula de vôlei de praia de todos os jogos de um torneio
 * (uma folha A4 por jogo, categorias na ordem do torneio, jogos por número).
 * SÓ LEITURA no Firestore: nada é gravado.
 *
 * Preenche cabeçalho, duplas, placar e horário de cada set (dos pontos do placar
 * eletrônico), quadro de resultado, vencedor e W.O.; o resto (saque, pontos
 * corridos, tempos, penalidades, árbitros, assinaturas) fica para a mão.
 * Jogo ainda não encerrado sai com a parte de resultado em branco.
 *
 * O PDF sai com nomes reais de atletas: salve fora do repositório.
 *
 * Pré-requisitos: gcloud auth application-default login; Google Chrome instalado.
 * Uso (na pasta functions/):
 *   node scripts/generate-beach-scoresheets.js --project <projectId> --tournament <tournamentId> \
 *     --out ~/Downloads/sumulas.pdf [--competition "Nome 2026"] [--entity ASAME] [--html saida.html] [--chrome <caminho>]
 * Detalhes em docs/sumulas-volei-de-praia.md.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const admin = require('firebase-admin');
const { tidyName, setTimesFromEvents, buildSheetContext, orderMatches } = require('./lib/beach-scoresheet');
const { renderDocument } = require('./lib/beach-scoresheet-html');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const PARALLEL_READS = 10;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const projectId = argValue('--project') || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const tournamentId = argValue('--tournament');
if (!projectId) fail('Informe o projeto: --project <projectId>');
if (!tournamentId) fail('Informe o torneio: --tournament <tournamentId>');
const outPdf = path.resolve(argValue('--out') || `sumulas-${tournamentId}.pdf`);
const htmlOut = argValue('--html');
const entity = argValue('--entity') || 'ASAME';
const chrome = argValue('--chrome') || process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => fs.existsSync(p));

admin.initializeApp({ projectId });
const db = admin.firestore();
const dataPath = `artifacts/${projectId}/public/data`;

const toIso = (v) => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : (v || null);

/** Executa `fn` em lotes de `size`, para não abrir centenas de leituras de uma vez. */
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

async function readDocs(collectionPath, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const snaps = await db.getAll(...unique.map((id) => db.doc(`${collectionPath}/${id}`)));
  return Object.fromEntries(snaps.map((s) => [s.id, s.exists ? s.data() : {}]));
}

async function matchWithSetTimes(doc) {
  const m = doc.data();
  const events = (await doc.ref.collection('pointEvents').get()).docs.map((d) => {
    const e = d.data();
    return { type: e.type, setIndex: e.setIndex, scoreA: e.scoreA, scoreB: e.scoreB, seq: e.seq, ts: toIso(e.ts) };
  });
  const sets = (Array.isArray(m.sets) ? m.sets : []).map((s) => ({ a: s.a, b: s.b, startedAt: toIso(s.startedAt) }));
  return {
    ...m,
    scheduleTime: toIso(m.scheduleTime),
    matchStartedAt: toIso(m.matchStartedAt),
    matchEndedAt: toIso(m.matchEndedAt),
    sets: setTimesFromEvents(sets, events),
  };
}

function playersOf(team, users) {
  return [[team.player1Id, team.player1DisplayName], [team.player2Id, team.player2DisplayName]].map(([uid, display]) => {
    const user = users[uid] || {};
    return { short: tidyName(display || user.nickname || user.fullName), full: tidyName(user.fullName || display) };
  });
}

function competitionName(tournament) {
  const given = argValue('--competition');
  if (given) return given;
  const name = String(tournament.name || '').trim();
  const start = toIso(tournament.startAt);
  const year = start ? String(new Date(start).getFullYear()) : '';
  return year && !name.includes(year) ? `${name} ${year}` : name;
}

function printPdf(html) {
  if (!chrome) fail('Chrome não encontrado: use --chrome <caminho> ou CHROME_PATH.');
  const htmlPath = htmlOut ? path.resolve(htmlOut) : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sumulas-')), 'sumulas.html');
  fs.writeFileSync(htmlPath, html);
  const result = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=10000',
    `--print-to-pdf=${outPdf}`, `file://${htmlPath}`,
  ], { encoding: 'utf8' });
  if (result.status !== 0 || !fs.existsSync(outPdf)) {
    fail(`Chrome não gerou o PDF (status ${result.status}): ${result.stderr || result.error || ''}`);
  }
  if (htmlOut) console.log(`HTML: ${htmlPath}`);
}

async function main() {
  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) fail(`Torneio ${tournamentId} não existe em ${projectId}.`);
  const tournament = tournamentSnap.data();
  if (tournament.sport && tournament.sport !== 'beachVolleyball') {
    console.warn(`Aviso: o esporte do torneio é "${tournament.sport}"; a súmula é a de vôlei de praia.`);
  }

  const matchDocs = (await db.collection(`${dataPath}/matches`).where('tournamentId', '==', tournamentId).get()).docs;
  if (!matchDocs.length) fail('Nenhum jogo encontrado para esse torneio.');
  const matches = await inBatches(matchDocs, PARALLEL_READS, matchWithSetTimes);
  const teams = await readDocs(`${dataPath}/teams`, matches.flatMap((m) => [m.teamAId, m.teamBId]));
  const users = await readDocs('users', Object.values(teams).flatMap((t) => [t.player1Id, t.player2Id]));

  const categories = tournament.categories || [];
  const ordered = orderMatches(matches, categories.map((c) => c.id));
  const competition = competitionName(tournament);
  const contexts = ordered.map((m, i) => {
    const category = categories.find((c) => c.id === m.categoryId) || {};
    return buildSheetContext(m, {
      categoryName: category.categoryName,
      bracketFormat: category.bracketFormat,
      locationName: tournament.locationName || tournament.location,
      competition,
      playersA: playersOf(teams[m.teamAId] || {}, users),
      playersB: playersOf(teams[m.teamBId] || {}, users),
      sheetIndex: i + 1,
      sheetTotal: ordered.length,
    });
  });

  printPdf(renderDocument(contexts, { title: `Súmulas · ${competition}`, entity }));
  const open = contexts.filter((c) => !c.finished).length;
  const walkovers = contexts.filter((c) => c.walkover).length;
  console.log(`${contexts.length} súmulas (${walkovers} W.O., ${open} sem resultado) em ${outPdf}`);
}

main().catch((err) => fail(err.stack || String(err)));
