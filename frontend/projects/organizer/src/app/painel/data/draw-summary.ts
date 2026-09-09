import { groupsOf } from './draw-session-selectors';
import type { DrawSession } from './draw-session.model';

/**
 * Números que a tela de configuração mostra sobre a sessão: formato detectado,
 * combinações possíveis e a trava de segurança antes de começar.
 *
 * Tudo derivado do que já está gravado — nenhuma métrica inventada. É o que
 * permite o organizador conferir "16 duplas, 4 grupos, nenhum bye" antes de
 * apertar o botão que congela o sorteio.
 */

export interface GroupsFormatSummary {
  kind: 'groups';
  teams: number;
  groups: number;
  perGroup: number;
  qualifiers: number;
  /** A divisão fecha sem grupo desigual. */
  exact: boolean;
}

export interface DeFormatSummary {
  kind: 'de';
  teams: number;
  locked: number;
  byes: number;
  /** Quantas posições o sorteio distribui. */
  drawn: number;
  /** A planta fecha sem bye. */
  exact: boolean;
}

export type DrawFormatSummary = GroupsFormatSummary | DeFormatSummary;

export function formatSummaryOf(session: DrawSession): DrawFormatSummary {
  const teams = session.entrants.length;

  if (session.format === 'double_elimination') {
    const locked = Math.min(session.config.lockedSeedCount, teams);
    const byes = session.bracketOutline?.byeSeeds.length ?? 0;
    return { kind: 'de', teams, locked, byes, drawn: Math.max(0, teams - locked), exact: byes === 0 };
  }

  const groups = groupsOf(session, 0);
  const capacities = groups.map((g) => g.capacity);
  return {
    kind: 'groups',
    teams,
    groups: groups.length,
    perGroup: session.config.teamsPerGroup,
    qualifiers: session.config.qualifiersPerGroup,
    // "Fecha exatamente" = todos os grupos do mesmo tamanho.
    exact: capacities.length > 0 && capacities.every((c) => c === capacities[0]),
  };
}

/** `Number` perde precisão bem antes disso; acima do teto a tela diz "praticamente infinitas". */
const MAX_DISPLAYABLE = 1e21;

function permutations(total: number, taken: number): number {
  let out = 1;
  for (let i = 0; i < taken; i++) out *= total - i;
  return out;
}

function factorial(n: number): number {
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}

/**
 * Quantos sorteios diferentes as regras ativas ainda permitem.
 *
 * Não é enfeite: é a resposta para "esse sorteio é mesmo aleatório?". Com potes
 * por ranking o número cai bastante em relação à distribuição livre, e mostrar
 * isso é mais honesto que esconder.
 *
 * `null` quando não há o que sortear ou quando o número passa do que dá para
 * exibir sem mentir sobre a precisão.
 */
export function combinationsOf(session: DrawSession): number | null {
  const teams = session.entrants.length;
  if (teams < 2) return null;

  let total: number;

  if (session.format === 'double_elimination') {
    const open = Math.max(0, teams - Math.min(session.config.lockedSeedCount, teams));
    if (open < 2) return null;
    total = factorial(open);
  } else if (session.config.constraints.potsPerGroup && session.pots.length > 0) {
    // Um slot de cada grupo por rodada de pote: o pote de tamanho k tem
    // P(grupos, k) arranjos.
    const groupCount = groupsOf(session, 0).length;
    total = session.pots.reduce(
      (acc, pot) => acc * permutations(groupCount, Math.min(pot.teamIds.length, groupCount)),
      1,
    );
  } else {
    // Distribuição livre: multinomial das capacidades dos grupos.
    const capacities = groupsOf(session, 0).map((g) => g.capacity);
    total = capacities.reduce((acc, capacity) => acc / factorial(capacity), factorial(teams));
  }

  if (!Number.isFinite(total) || total > MAX_DISPLAYABLE || total < 1) return null;
  return Math.round(total);
}

export interface ReadinessCheck {
  id: 'teams' | 'seeds' | 'exact' | 'schedule';
  label: string;
  ok: boolean;
  /** Pendência que não impede começar. */
  optional: boolean;
}

/**
 * A trava de segurança antes de iniciar o sorteio.
 *
 * Só checa o que dá para verificar de verdade a partir do que está gravado —
 * uma lista de confirmações inventadas seria pior que não ter lista, porque
 * daria falsa segurança.
 */
export function readinessChecksOf(session: DrawSession): ReadinessCheck[] {
  const summary = formatSummaryOf(session);
  const de = session.format === 'double_elimination';
  const seedsReady = de ?
    session.entrants.some((e) => e.lockedSeed != null) || session.config.lockedSeedCount === 0 :
    (session.pots[0]?.teamIds.length ?? 0) > 0;

  return [
    {
      id: 'teams',
      label: `${summary.teams} duplas confirmadas e congeladas na sessão`,
      ok: summary.teams >= 2,
      optional: false,
    },
    {
      id: 'seeds',
      label: de ? 'Cabeças de chave travadas nos primeiros seeds' : 'Potes montados por ranking',
      ok: seedsReady,
      optional: false,
    },
    {
      id: 'exact',
      label: de ?
        summary.exact ? 'A planta fecha exatamente. Nenhum bye necessário.' : `A planta usa ${summary.kind === 'de' ? summary.byes : 0} bye(s).`
        : summary.exact ? 'A chave fecha exatamente. Nenhum grupo desigual.' : 'Os grupos ficam desiguais.',
      ok: summary.exact,
      optional: true,
    },
    {
      id: 'schedule',
      label: session.scheduledAt ? 'Data e hora da transmissão definidas' : 'Data e hora da transmissão',
      ok: session.scheduledAt != null,
      optional: true,
    },
  ];
}
