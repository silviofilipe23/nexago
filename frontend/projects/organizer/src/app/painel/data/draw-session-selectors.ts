import type {
  DrawDestination,
  DrawGroupView,
  DrawSession,
  DrawSessionEntrant,
} from './draw-session.model';

/**
 * Leituras derivadas da sessão de sorteio — grade de grupos, ordem de seeds,
 * pote restante.
 *
 * Nada aqui é gravado: o servidor guarda só o log, e a colocação é dobrada a
 * cada render. É o que faz o telão que reconecta no meio da transmissão chegar
 * ao mesmo estado sem depender de ter recebido cada evento.
 *
 * `visibleCount` é o detalhe que não pode ser esquecido: o servidor já gravou a
 * revelação quando os dados COMEÇAM a rolar, mas a grade só pode mostrar a
 * dupla depois que o spotlight dela terminou. Sem esse recorte, a grade
 * entregaria o resultado antes do show.
 */

const entrantOf = (session: DrawSession, teamId: string): DrawSessionEntrant | undefined =>
  session.entrants.find((e) => e.teamId === teamId);

export function groupsOf(
  session: DrawSession,
  visibleCount: number = session.reveals.length,
): DrawGroupView[] {
  const total = session.entrants.length;
  const per = Math.max(2, session.config.teamsPerGroup);
  const groupCount = Math.max(1, Math.ceil(total / per));
  const base = Math.floor(total / groupCount);
  const remainder = total % groupCount;

  const groups: DrawGroupView[] = Array.from({ length: groupCount }, (_, i) => ({
    groupId: String.fromCharCode(65 + i),
    capacity: base + (i < remainder ? 1 : 0),
    entrants: [],
  }));

  for (const reveal of session.reveals.slice(0, visibleCount)) {
    const destination = reveal.destination;
    if (destination.type !== 'group') continue;
    const group = groups.find((g) => g.groupId === destination.groupId);
    const entrant = entrantOf(session, reveal.teamId);
    if (group && entrant) group.entrants.push(entrant);
  }
  return groups;
}

export function seedOrderOf(
  session: DrawSession,
  visibleCount: number = session.reveals.length,
): Array<DrawSessionEntrant | null> {
  const order: Array<DrawSessionEntrant | null> = new Array(session.entrants.length).fill(null);
  for (const entrant of session.entrants) {
    if (entrant.lockedSeed != null) order[entrant.lockedSeed - 1] = entrant;
  }
  for (const reveal of session.reveals.slice(0, visibleCount)) {
    const destination = reveal.destination;
    if (destination.type !== 'seed') continue;
    order[destination.seed - 1] = entrantOf(session, reveal.teamId) ?? null;
  }
  return order;
}

/** Duplas ainda no pote. Cabeça travada nunca entra: ela não é sorteada. */
export function remainingInPot(session: DrawSession): DrawSessionEntrant[] {
  const revealed = new Set(session.reveals.map((r) => r.teamId));
  const locked = new Set(
    session.entrants.filter((e) => e.lockedSeed != null).map((e) => e.teamId),
  );
  const ordered = session.pots.flatMap((p) => p.teamIds);
  const fromPots = ordered.filter((id) => !revealed.has(id) && !locked.has(id));
  // Dupla que ficou de fora dos potes (elenco mudou entre criação e sorteio)
  // ainda precisa aparecer na fila — some da tela é pior que aparecer no fim.
  const extras = session.entrants
    .map((e) => e.teamId)
    .filter((id) => !ordered.includes(id) && !revealed.has(id) && !locked.has(id));

  return [...fromPots, ...extras]
    .map((id) => entrantOf(session, id))
    .filter((e): e is DrawSessionEntrant => !!e);
}

/** Rótulo do destino pra tela: `GRUPO C` ou `POSIÇÃO 12`. */
export function destinationLabelOf(destination: DrawDestination): string {
  return destination.type === 'group' ? `GRUPO ${destination.groupId}` : `POSIÇÃO ${destination.seed}`;
}

/**
 * Como citar uma seed na dramaturgia do telão: se a posição já tem equipe
 * (travada ou sorteada), usa o nome; senão fica "a cabeça N".
 */
export function seedRivalPhrase(
  seedOrder: ReadonlyArray<DrawSessionEntrant | null>,
  seed: number,
): string {
  const label = seedOrder[seed - 1]?.label?.trim();
  return label || `a cabeça ${seed}`;
}

/** Aproveitamento em %; `null` pra dupla estreante — mostrar 0% seria mentira. */
export function winRateOf(entrant: DrawSessionEntrant): number | null {
  const played = entrant.stats.wins + entrant.stats.losses;
  return played === 0 ? null : Math.round((entrant.stats.wins / played) * 100);
}
