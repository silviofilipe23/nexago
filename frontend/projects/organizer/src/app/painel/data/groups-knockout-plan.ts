/**
 * Contas do formato "grupos + mata-mata" da tela de Gerar chave.
 *
 * Tudo puro: recebe quantas duplas, quantos grupos e quantos classificam, e
 * devolve o que o organizador precisa enxergar antes de publicar — tamanho dos
 * grupos, jogos de cada fase, folgas, total do dia. A chave em si continua
 * nascendo no servidor (`buildGroupsKnockoutMatches`); aqui mora só a prévia.
 */

/** Por que o formato escolhido não pode ser publicado. */
export type GroupsKnockoutIssue = 'too_few_teams' | 'group_too_small' | 'too_few_qualifiers';

/** Uma fase do mata-mata: quantos jogos de verdade e quantas duplas folgam nela. */
export interface KnockoutPhase {
  label: string;
  matches: number;
  byes: number;
}

export interface GroupsKnockoutPlan {
  teams: number;
  groupCount: number;
  qualifiersPerGroup: number;
  /** Do maior para o menor; a diferença entre grupos nunca passa de 1. */
  groupSizes: number[];
  groupMatches: number;
  /** `grupos × classificados`. */
  qualifiers: number;
  bracketSize: number;
  byes: number;
  /**
   * Como as vagas do mata-mata são distribuídas. `crossover` = total em
   * potência de 2, cruzamento fixo entre grupos (1º A × 2º B). `ranked` = total
   * fora disso, eliminatória semeada pela classificação entre grupos, com folga
   * para os melhores.
   */
  seeding: 'crossover' | 'ranked';
  phases: KnockoutPhase[];
  thirdPlace: boolean;
  knockoutMatches: number;
  totalMatches: number;
  /** Quem cai na fase de grupos do menor grupo. */
  minMatchesPerTeam: number;
  /** Finalista que saiu do maior grupo sem folga. */
  maxMatchesPerTeam: number;
  eliminatedInGroups: number;
  issue: GroupsKnockoutIssue | null;
}

/** Um confronto da 1ª rodada do mata-mata. `b` nulo = quem está em `a` folga. */
export interface FirstRoundPairing {
  a: string;
  b: string | null;
}

/** Piso do mata-mata: dois classificados fazem uma final. Mesmo piso do servidor. */
const MIN_QUALIFIERS = 2;

/** Só há disputa de 3º lugar quando existem duas semifinais com perdedor. */
const MIN_QUALIFIERS_FOR_THIRD_PLACE = 4;

/** Cada grupo precisa de pelo menos um jogo. */
const MIN_TEAMS_PER_GROUP = 2;

/** Faixa de tamanho de grupo que vale sugerir: abaixo de 3 o grupo é um jogo só,
 *  acima de 6 a fase de grupos não cabe no dia. */
const SUGGESTED_MIN_GROUP_SIZE = 3;
const SUGGESTED_MAX_GROUP_SIZE = 6;
/** Com menos duplas que isso não dá para ter dois grupos de 3. */
const SUGGESTED_MIN_TEAMS_FOR_GROUPS_OF_3 = 6;
/** Tamanho de grupo "de referência" para ordenar as sugestões. */
const SUGGESTED_IDEAL_GROUP_SIZE = 4;
/** Sugestões cobrem 1 ou 2 classificados por grupo — o resto se ajusta no stepper. */
const SUGGESTED_MAX_QUALIFIERS = 2;
const DEFAULT_SUGGESTION_LIMIT = 6;

/** Teto do stepper de classificados — o mesmo do wizard de criação. */
const MAX_QUALIFIERS_PER_GROUP = 4;

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

function roundRobinMatches(teams: number): number {
  return teams < 2 ? 0 : (teams * (teams - 1)) / 2;
}

/**
 * Nome da fase pelo nº de partidas da coluna (contando as de folga). É a regra
 * do cabeçalho da tela de chaveamento — mora aqui para a prévia e a chave
 * publicada usarem o mesmo nome.
 */
export function knockoutPhaseLabel(matchCount: number): string {
  if (matchCount >= 32) return '64-avos';
  if (matchCount >= 16) return '32-avos';
  if (matchCount === 8) return 'Oitavas';
  if (matchCount === 4) return 'Quartas';
  if (matchCount === 2) return 'Semifinais';
  return 'Eliminatórias';
}

/** Tamanho de cada grupo, do maior para o menor. A sobra vai uma por grupo — é
 *  o que o snake draft da prévia produz. */
export function groupSizesFor(teams: number, groupCount: number): number[] {
  if (teams <= 0 || groupCount <= 0) return [];
  const groups = Math.min(groupCount, teams);
  const base = Math.floor(teams / groups);
  const extra = teams % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
}

/** "4 grupos de 4" · "2 grupos de 4 e 2 de 3". */
export function describeGroupSizes(sizes: readonly number[]): string {
  if (sizes.length === 0) return '';
  const counts = new Map<number, number>();
  for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  const parts = [...counts.entries()].sort(([a], [b]) => b - a);
  const [firstSize, firstCount] = parts[0]!;
  const head = `${firstCount} ${firstCount === 1 ? 'grupo' : 'grupos'} de ${firstSize}`;
  return [head, ...parts.slice(1).map(([size, count]) => `${count} de ${size}`)].join(' e ');
}

/**
 * Quem recebe as folgas da 1ª fase. A ordem é a da classificação entre grupos:
 * todos os 1ºs (do melhor ao pior), depois os 2ºs — então as folgas cobrem os
 * 1ºs antes de chegar em qualquer 2º.
 */
export function describeByeHolders(byes: number, groupCount: number): string {
  if (byes <= 0 || groupCount <= 0) return '';
  const fullTiers = Math.floor(byes / groupCount);
  const rest = byes % groupCount;
  const parts: string[] = [];
  if (fullTiers > 0) {
    const places = Array.from({ length: fullTiers }, (_, i) => `${i + 1}ºs`);
    parts.push(`todos os ${places.join(' e ')} colocados`);
  }
  if (rest > 0) {
    const place = fullTiers + 1;
    parts.push(rest === 1 ? `o melhor ${place}º colocado` : `os ${rest} melhores ${place}ºs colocados`);
  }
  return parts.join(' e ');
}

/** No máximo um grupo para cada 2 duplas — grupo de uma dupla não tem jogo. */
export function maxGroupCount(teams: number): number {
  return Math.max(1, Math.floor(teams / MIN_TEAMS_PER_GROUP));
}

/** Classificados por grupo: no máximo o tamanho do MENOR grupo — a mesma regra
 *  do servidor (`group_too_small`). Classificar o grupo inteiro é permitido: é o
 *  que mantém publicável uma categoria de 2 duplas (1 grupo × 2). */
export function maxQualifiersPerGroup(teams: number, groupCount: number): number {
  const sizes = groupSizesFor(teams, groupCount);
  const smallest = sizes[sizes.length - 1] ?? 1;
  return Math.max(1, Math.min(MAX_QUALIFIERS_PER_GROUP, smallest));
}

function knockoutPhases(bracketSize: number, byes: number): KnockoutPhase[] {
  const phases: KnockoutPhase[] = [];
  for (let slots = bracketSize / 2, first = true; slots >= 1; slots /= 2, first = false) {
    phases.push({
      label: slots === 1 ? 'Final' : knockoutPhaseLabel(slots),
      matches: first ? slots - byes : slots,
      byes: first ? byes : 0,
    });
  }
  return phases;
}

export function planGroupsKnockout(teams: number, groupCount: number, qualifiersPerGroup: number): GroupsKnockoutPlan {
  const groupSizes = groupSizesFor(teams, groupCount);
  const groups = groupSizes.length;
  const perGroup = Math.max(1, Math.floor(qualifiersPerGroup));
  const qualifiers = groups * perGroup;
  const smallest = groupSizes[groupSizes.length - 1] ?? 0;
  const largest = groupSizes[0] ?? 0;

  const issue: GroupsKnockoutIssue | null =
    teams < MIN_TEAMS_PER_GROUP || groups === 0
      ? 'too_few_teams'
      : smallest < perGroup
        ? 'group_too_small'
        : qualifiers < MIN_QUALIFIERS
          ? 'too_few_qualifiers'
          : null;

  const bracketSize = qualifiers >= MIN_QUALIFIERS ? nextPowerOfTwo(qualifiers) : 0;
  const byes = Math.max(0, bracketSize - qualifiers);
  const phases = bracketSize >= 2 ? knockoutPhases(bracketSize, byes) : [];
  const thirdPlace = qualifiers >= MIN_QUALIFIERS_FOR_THIRD_PLACE;
  const knockoutMatches = bracketSize >= 2 ? qualifiers - 1 + (thirdPlace ? 1 : 0) : 0;
  const groupMatches = groupSizes.reduce((sum, size) => sum + roundRobinMatches(size), 0);

  return {
    teams,
    groupCount: groups,
    qualifiersPerGroup: perGroup,
    groupSizes,
    groupMatches,
    qualifiers,
    bracketSize,
    byes,
    seeding: isPowerOfTwo(qualifiers) ? 'crossover' : 'ranked',
    phases,
    thirdPlace,
    knockoutMatches,
    totalMatches: groupMatches + knockoutMatches,
    minMatchesPerTeam: Math.max(0, smallest - 1),
    maxMatchesPerTeam: Math.max(0, largest - 1) + phases.length,
    eliminatedInGroups: Math.max(0, teams - qualifiers),
    issue,
  };
}

/** Ordem das sugestões: primeiro o que não tem folga, depois 2 classificados
 *  antes de 1, depois o grupo mais perto do tamanho de referência. */
function suggestionRank(plan: GroupsKnockoutPlan): [number, number, number] {
  const average = plan.teams / plan.groupCount;
  return [plan.byes > 0 ? 1 : 0, -plan.qualifiersPerGroup, Math.abs(average - SUGGESTED_IDEAL_GROUP_SIZE)];
}

/**
 * Formatos que fazem sentido para a quantidade de duplas, do mais recomendado
 * para o menos. Todos são aceitos pelo servidor — a lista existe para o
 * organizador escolher com um clique em vez de caçar a combinação nos steppers.
 */
export function suggestGroupFormats(teams: number, limit = DEFAULT_SUGGESTION_LIMIT): GroupsKnockoutPlan[] {
  const minSize = teams >= SUGGESTED_MIN_TEAMS_FOR_GROUPS_OF_3 ? SUGGESTED_MIN_GROUP_SIZE : MIN_TEAMS_PER_GROUP;
  const candidates: GroupsKnockoutPlan[] = [];
  for (let groups = 2; groups <= maxGroupCount(teams); groups++) {
    const sizes = groupSizesFor(teams, groups);
    const smallest = sizes[sizes.length - 1] ?? 0;
    const largest = sizes[0] ?? 0;
    if (smallest < minSize || largest > SUGGESTED_MAX_GROUP_SIZE) continue;
    // Sugestão sempre elimina alguém em todo grupo; classificar o grupo inteiro
    // continua possível, mas só pelo stepper.
    const maxQualifiers = Math.min(SUGGESTED_MAX_QUALIFIERS, smallest - 1);
    for (let qualifiers = 1; qualifiers <= maxQualifiers; qualifiers++) {
      const plan = planGroupsKnockout(teams, groups, qualifiers);
      if (plan.issue === null) candidates.push(plan);
    }
  }
  return candidates
    .sort((a, b) => {
      const ra = suggestionRank(a);
      const rb = suggestionRank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || a.groupCount - b.groupCount;
    })
    .slice(0, Math.max(0, limit));
}

/**
 * O formato válido mais perto do que está nos steppers — é o que a mensagem de
 * erro oferece. Devolve o próprio formato quando ele já vale, e `null` quando
 * não existe nenhum (menos de 2 duplas).
 */
export function nearestValidFormat(teams: number, groupCount: number, qualifiersPerGroup: number): GroupsKnockoutPlan | null {
  let best: { plan: GroupsKnockoutPlan; distance: number } | null = null;
  for (let groups = 1; groups <= maxGroupCount(teams); groups++) {
    for (let qualifiers = 1; qualifiers <= maxQualifiersPerGroup(teams, groups); qualifiers++) {
      const plan = planGroupsKnockout(teams, groups, qualifiers);
      if (plan.issue !== null) continue;
      // Mexer nos classificados pesa menos que mexer nos grupos: trocar o nº de
      // grupos refaz o sorteio inteiro.
      const distance = Math.abs(groups - groupCount) * 2 + Math.abs(qualifiers - qualifiersPerGroup);
      if (!best || distance < best.distance) best = { plan, distance };
    }
  }
  return best?.plan ?? null;
}

function groupLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function fixedSlotLabel(place: number, groupIndex: number): string {
  return `${place}º Grupo ${groupLetter(groupIndex)}`;
}

function rankedSlotLabel(place: number, rank: number): string {
  return rank === 1 ? `${place}º · melhor campanha` : `${place}º · ${rank}ª melhor campanha`;
}

/** Ordem de seeding padrão de uma chave de tamanho `size` (potência de 2). */
function standardSeedSlots(size: number): number[] {
  if (size < 2) return [1];
  let slots = [1, 2];
  while (slots.length < size) {
    const sum = slots.length * 2 + 1;
    slots = slots.flatMap((seed) => [seed, sum - seed]);
  }
  return slots;
}

function crossoverPairings(groupCount: number, qualifiersPerGroup: number): FirstRoundPairing[] {
  const pairs: FirstRoundPairing[] = [];
  if (groupCount === 2) {
    for (let place = 1; place <= qualifiersPerGroup; place++) {
      pairs.push({ a: fixedSlotLabel(place, 0), b: fixedSlotLabel(qualifiersPerGroup - place + 1, 1) });
    }
    return pairs;
  }
  for (let band = 1; band <= Math.floor(qualifiersPerGroup / 2); band++) {
    for (let i = 0; i < groupCount; i++) {
      pairs.push({ a: fixedSlotLabel(band, i), b: fixedSlotLabel(qualifiersPerGroup - band + 1, groupCount - 1 - i) });
    }
  }
  if (qualifiersPerGroup % 2 === 1) {
    const middle = (qualifiersPerGroup + 1) / 2;
    for (let i = 0; i < Math.floor(groupCount / 2); i++) {
      pairs.push({ a: fixedSlotLabel(middle, i), b: fixedSlotLabel(middle, groupCount - 1 - i) });
    }
  }
  return pairs;
}

function rankedPairings(groupCount: number, qualifiersPerGroup: number): FirstRoundPairing[] {
  const seeds: string[] = [];
  for (let place = 1; place <= qualifiersPerGroup; place++) {
    // Grupo único: a vaga é a colocação no próprio grupo, como no servidor.
    if (groupCount === 1) seeds.push(fixedSlotLabel(place, 0));
    else for (let rank = 1; rank <= groupCount; rank++) seeds.push(rankedSlotLabel(place, rank));
  }
  const slots = standardSeedSlots(nextPowerOfTwo(seeds.length)).map((seed) => seeds[seed - 1] ?? null);
  const pairs: FirstRoundPairing[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const first = slots[i] ?? null;
    const second = slots[i + 1] ?? null;
    if (first) pairs.push({ a: first, b: second });
    else if (second) pairs.push({ a: second, b: null });
  }
  return pairs;
}

/**
 * Confrontos da 1ª rodada do mata-mata, na ordem em que entram na chave.
 *
 * É CÓPIA da regra do servidor (`crossoverFirstRoundPairings` e a semeadura de
 * `buildGroupsKnockoutMatches`, em `functions/src/category-bracket-builders.ts`),
 * só para a prévia. Os dois lados têm teste com o MESMO gabarito; se a regra
 * mudar lá, a prévia daqui passa a prometer um cruzamento que a chave publicada
 * não entrega.
 */
export function firstRoundPairings(groupCount: number, qualifiersPerGroup: number): FirstRoundPairing[] {
  const qualifiers = groupCount * qualifiersPerGroup;
  if (groupCount < 1 || qualifiersPerGroup < 1 || qualifiers < MIN_QUALIFIERS) return [];
  return isPowerOfTwo(qualifiers)
    ? crossoverPairings(groupCount, qualifiersPerGroup)
    : rankedPairings(groupCount, qualifiersPerGroup);
}

/** Tempo de quadra para `matches` jogos em `courts` quadras ao mesmo tempo. Sem
 *  quadra cadastrada conta uma — é o pior caso, e ainda é uma estimativa útil. */
export function estimateDurationMin(matches: number, matchDurationMin: number, courts: number): number {
  if (matches <= 0 || matchDurationMin <= 0) return 0;
  return Math.ceil(matches / Math.max(1, Math.floor(courts))) * matchDurationMin;
}

const MINUTES_PER_HOUR = 60;

/** "45 min" · "4h" · "2h30". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < MINUTES_PER_HOUR) return `${total} min`;
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const rest = total % MINUTES_PER_HOUR;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}
