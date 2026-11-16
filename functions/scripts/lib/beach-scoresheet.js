/* eslint-disable */
/**
 * Lógica pura de `generate-beach-scoresheets.js`: transforma uma partida do
 * Firestore no conteúdo de uma súmula de vôlei de praia (uma folha por jogo).
 * Sem Firestore aqui — só dados em memória, para dar pra testar.
 */

const TIME_ZONE = 'America/Sao_Paulo';
const NAME_PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

const BRACKET_FORMAT_LABELS = {
  double_elimination: 'Dupla eliminação',
  single_elimination: 'Eliminação simples',
  groups: 'Fase de grupos',
  groups_knockout: 'Grupos + mata-mata',
  round_robin: 'Todos contra todos',
};

const MATCH_TYPE_LABELS = {
  Final: 'Final',
  'Grand Final': 'Grande final',
  'Third Place': 'Disputa de 3º lugar',
  'Semi-Final': 'Semifinal',
  'Quarter-Final': 'Quartas de final',
  'Round of 16': 'Oitavas de final',
  'Round of 32': '16 avos de final',
  Group: 'Fase de grupos',
  group: 'Fase de grupos',
};

/**
 * Palavra toda em caixa alta ou baixa vira "Título" ("DIOGO" → "Diogo");
 * palavra já mista fica como está; de/da/do/dos/das/e no meio ficam minúsculas.
 * @param {string|undefined|null} raw
 * @returns {string}
 */
function tidyName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return '';
  return name.split(' ').map((word, i) => {
    const lower = word.toLowerCase();
    if (i > 0 && NAME_PARTICLES.has(lower)) return lower;
    if (word !== word.toUpperCase() && word !== lower) return word;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

/** @param {{matchType?: string, round?: number}} match */
function phaseLabel(match) {
  const type = String(match.matchType || '').trim();
  const round = Number(match.round) || 0;
  if (type === 'WB') return round ? `Chave principal – rodada ${round}` : 'Chave principal';
  if (type === 'LB') return round ? `Repescagem – rodada ${round}` : 'Repescagem';
  if (type === 'knockout') return round ? `Mata-mata – rodada ${round}` : 'Mata-mata';
  return MATCH_TYPE_LABELS[type] || type;
}

/**
 * "Dupla eliminação · melhor de 3 sets (21/21/15)".
 * @param {{bestOf?: number, scoringProfile?: {setTarget?: number, decidingSetTarget?: number}}} match
 * @param {string|undefined} bracketFormat formato da categoria (`categories[].bracketFormat`)
 */
function formatLabel(match, bracketFormat) {
  const bestOf = Number(match.bestOf) || 1;
  const target = match.scoringProfile?.setTarget || 21;
  const deciding = match.scoringProfile?.decidingSetTarget || 15;
  const sets = bestOf === 1 ? `set único de ${target} pontos`
    : bestOf === 3 ? `melhor de 3 sets (${target}/${target}/${deciding})`
      : `melhor de ${bestOf} sets`;
  const bracket = String(bracketFormat || '').startsWith('koc') ? 'Rei/Rainha da quadra'
    : BRACKET_FORMAT_LABELS[bracketFormat];
  return bracket ? `${bracket} · ${sets}` : sets;
}

/** "Vencedor Jogo #7" → "Venc. jogo 7". */
function originLabel(description) {
  return String(description || '')
    .replace('Vencedor Jogo #', 'Venc. jogo ')
    .replace('Perdedor Jogo #', 'Perd. jogo ');
}

/**
 * Início e fim de cada set. Início: `sets[i].startedAt` ou o 1º ponto do set.
 * Fim: o último ponto que deixou o placar igual ao final do set (os pontos
 * desfeitos ficam de fora); sem esse, o último ponto do set.
 * @param {Array<{a: number, b: number, startedAt?: string|null}>} sets
 * @param {Array<{type: string, setIndex: number, scoreA: number, scoreB: number, seq: number, ts: string}>} events
 */
function setTimesFromEvents(sets, events) {
  const points = events.filter((e) => e.type === 'point').sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0));
  return sets
    .map((set, index) => ({ set, index }))
    .filter(({ set }) => Number.isFinite(set.a) && Number.isFinite(set.b))
    .map(({ set, index }) => {
      const inSet = points.filter((e) => e.setIndex === index);
      const closing = inSet.filter((e) => e.scoreA === set.a && e.scoreB === set.b);
      const last = closing[closing.length - 1] || inSet[inSet.length - 1];
      return {
        a: set.a,
        b: set.b,
        startedAt: set.startedAt || inSet[0]?.ts || null,
        endedAt: last?.ts || null,
      };
    });
}

const formatTime = (iso) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }) : '';
const formatDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const minutesBetween = (from, to) => (from && to)
  ? Math.max(0, Math.round((new Date(to) - new Date(from)) / 60000)) : null;
const isWalkover = (match) => [match.resultA, match.resultB].some((r) => String(r).toUpperCase() === 'W.O.');
const pairLabel = (players) => players.map((p) => p.short).filter(Boolean).join(' / ');

function totalsOf(sets) {
  const durations = sets.map((s) => minutesBetween(s.startedAt, s.endedAt));
  const setsA = sets.filter((s) => s.a > s.b).length;
  return {
    setsA,
    setsB: sets.length - setsA,
    pointsA: sets.reduce((acc, s) => acc + s.a, 0),
    pointsB: sets.reduce((acc, s) => acc + s.b, 0),
    minutes: durations.length && durations.every((d) => d !== null) ? durations.reduce((x, y) => x + y, 0) : null,
  };
}

/**
 * Tudo que vai impresso numa folha. `match.sets` já vem com horários
 * (`setTimesFromEvents`); `playersA/B` já resolvidos ({short, full}).
 * Jogo ainda não encerrado sai com o resultado em branco, para preencher à mão.
 */
function buildSheetContext(match, options) {
  const { categoryName, bracketFormat, locationName, competition, playersA, playersB, sheetIndex, sheetTotal } = options;
  const finished = match.status === 'Completed' || Boolean(match.winnerId);
  const sets = finished ? (match.sets || []) : [];
  const walkover = finished && isWalkover(match);
  const totals = totalsOf(sets);
  const startIso = match.scheduleTime || match.matchStartedAt || sets[0]?.startedAt || null;
  const winnerIsA = match.winnerId === match.teamAId;
  const [winners, losers] = winnerIsA ? [playersA, playersB] : [playersB, playersA];
  const [winnerSets, loserSets] = winnerIsA ? [totals.setsA, totals.setsB] : [totals.setsB, totals.setsA];
  const phase = phaseLabel(match);
  const hasOrigins = match.teamADescription || match.teamBDescription;
  return {
    number: match.matchNumber,
    category: categoryName || '',
    competition,
    phase,
    local: [locationName, match.courtName].filter(Boolean).join(' · '),
    date: formatDate(startIso || match.matchEndedAt),
    hour: formatTime(startIso),
    format: formatLabel(match, bracketFormat),
    origins: hasOrigins ? `${originLabel(match.teamADescription)} / ${originLabel(match.teamBDescription)}` : '',
    playersA,
    playersB,
    sets: sets.map((s) => ({
      ...s, start: formatTime(s.startedAt), end: formatTime(s.endedAt), minutes: minutesBetween(s.startedAt, s.endedAt),
    })),
    finished,
    walkover,
    totals,
    winnerNames: finished ? pairLabel(winners) : '',
    winnerScore: !finished ? '' : walkover ? 'W.O.' : `${winnerSets} x ${loserSets}`,
    observation: walkover ? `Vitória por W.O. de ${pairLabel(winners)} sobre ${pairLabel(losers)}.` : '',
    footer: [competition, categoryName, `Jogo ${match.matchNumber}`, phase].filter(Boolean).join(' · '),
    sheet: `Folha ${sheetIndex} de ${sheetTotal}`,
  };
}

/** Ordem das categorias no torneio, depois número do jogo. */
function orderMatches(matches, categoryOrder) {
  const rank = (id) => {
    const i = categoryOrder.indexOf(id);
    return i < 0 ? categoryOrder.length : i;
  };
  return [...matches].sort((x, y) => rank(x.categoryId) - rank(y.categoryId) || x.matchNumber - y.matchNumber);
}

module.exports = {
  tidyName, phaseLabel, formatLabel, originLabel, setTimesFromEvents, buildSheetContext, orderMatches, pairLabel,
};
