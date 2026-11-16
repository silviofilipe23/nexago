export type Side = 'us' | 'them';

export interface MatchBeat {
  us: number;
  them: number;
  /** Quem fez o ponto que levou a este placar (`null` no placar de partida da cena). */
  scorer: Side | null;
  serving: Side;
  call: string;
  note: string;
}

/** Duplas fictícias da cena. "Você" de propósito: quem rola a página está jogando. */
export const TEAMS: Record<Side, string> = { us: 'Você e Duda', them: 'Rafa e Tito' };

/** Sets já fechados antes da cena: 1º set 21–17 para "você". */
export const SETS_BEFORE: Record<Side, number> = { us: 1, them: 0 };
export const FIRST_SET = '21–17';

/**
 * O fim do 2º set de uma semifinal de vôlei de praia (set até 21, com dois de vantagem), ponto a
 * ponto. O último item é sempre a vitória — o componente trata o último índice como "fim de jogo".
 */
export const MATCH_BEATS: MatchBeat[] = [
  {
    us: 19,
    them: 19,
    scorer: null,
    serving: 'them',
    call: 'Tá 19 a 19.',
    note: 'Semifinal, segundo set. Role a página e jogue os últimos pontos.',
  },
  {
    us: 20,
    them: 19,
    scorer: 'us',
    serving: 'us',
    call: 'Match point.',
    note: 'Um ponto para a final. Quem ficou em casa está vendo esse placar agora.',
  },
  {
    us: 20,
    them: 20,
    scorer: 'them',
    serving: 'them',
    call: 'Empatou.',
    note: 'Bloqueio deles. Respira, que set de areia só acaba com dois de vantagem.',
  },
  {
    us: 21,
    them: 20,
    scorer: 'us',
    serving: 'us',
    call: 'Match point de novo.',
    note: 'O saque é seu.',
  },
  {
    us: 22,
    them: 20,
    scorer: 'us',
    serving: 'us',
    call: 'Vitória.',
    note: 'O placar fecha, a chave avança e o resultado entra no seu histórico. Sem planilha, sem print.',
  },
];

export interface LoggedPoint {
  score: string;
  scorer: Side;
}

/** Histórico "ponto a ponto" até o `beat` atual, do mais recente para o mais antigo. */
export function pointLog(beat: number): LoggedPoint[] {
  return MATCH_BEATS.slice(1, beat + 1)
    .filter((b): b is MatchBeat & { scorer: Side } => b.scorer !== null)
    .map((b) => ({ score: `${b.us}–${b.them}`, scorer: b.scorer }))
    .reverse();
}
