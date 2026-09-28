import { isKingOfCourtMatchType, kocPointsOf } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { kocPreRoundOf } from '../overlay/overlay-koc-preround';
import { ledSequenciaTier } from './led-sequencia';

export type LedProximosPapel = 'trono' | 'desafia' | 'sequencia' | 'aguardando';

export interface LedProximosRow {
  teamId: string;
  /** Ordem INTEIRA: o trono é o 1, a fila segue do 2 — como o atleta conta a própria vez. */
  posicao: number;
  papel: LedProximosPapel;
  rotulo: string;
}

/** Tela "Próximos em quadra" do painel de LED. */
export interface LedProximos {
  /** Início de rodada: ninguém pontuou ainda, os rótulos falam de ENTRADA. */
  inicio: boolean;
  trono: LedProximosRow & {
    /** Número grande da faixa: "1" no início, os pontos do trono durante a rodada. */
    numero: number;
  };
  /** Desafiante e fila, na ordem em que entram (2, 3, 4…). */
  fila: LedProximosRow[];
}

/** Nome do atleta no painel: as 3 primeiras letras em maiúsculas ("Vanessa" → "VAN").
 *  Lido do fundo do ginásio, três letras grandes identificam mais rápido que o nome inteiro
 *  encolhido. `Array.from` conta "Ö" como uma letra, não como dois pedaços de UTF-16. */
export function ledNomeCurto(name: string): string {
  return Array.from(name.trim()).slice(0, 3).join('').trim().toLocaleUpperCase('pt-BR');
}

function papelDe(index: number): LedProximosPapel {
  if (index === 0) return 'trono';
  if (index === 1) return 'desafia';
  if (index === 2) return 'sequencia';
  return 'aguardando';
}

/** Defesas seguidas do rei atual, desde a PRIMEIRA — o selo do overlay tem piso de 3, mas aqui
 *  quem lê é quem está na fila, e "2 seguidas" já diz alguma coisa. Coroação e bola de ouro
 *  quebram; erro de saque do desafiante é neutro. */
export function ledSeguidasDe(rallyLog: readonly { winner: string }[]): number {
  let n = 0;
  for (let i = rallyLog.length - 1; i >= 0; i--) {
    const w = rallyLog[i]!.winner;
    if (w === 'king') n++;
    else if (w === 'serve_fault') continue;
    else break;
  }
  return n;
}

function rotuloDe(papel: LedProximosPapel, inicio: boolean, seguidas: number): string {
  if (inicio) {
    if (papel === 'trono') return 'Entra no trono';
    if (papel === 'desafia') return 'Desafia o trono';
    return 'Na fila';
  }
  switch (papel) {
    case 'trono': {
      // A tag de sequência (EM CHAMAS…LENDA DA AREIA), a mesma do bloco do trono na tela de jogo.
      const tag = ledSequenciaTier(seguidas);
      return tag ? `No trono · ${tag.nome}` : 'No trono';
    }
    case 'desafia':
      return 'Desafiante · Em quadra';
    case 'sequencia':
      return 'Próxima a desafiar';
    case 'aguardando':
      return 'Aguardando';
  }
}

/** Quem está e quem entra na quadra, nos dois momentos da tela:
 *
 *  - antes do apito (e logo depois, enquanto ninguém pontuou): a ordem de ENTRADA
 *    (`kocTeamIds`), todos com 0 ponto;
 *  - durante a rodada: rei, desafiante e a fila na ordem atual, com os pontos do rei.
 *
 *  `null` quando não há o que anunciar (não é KOTC, elenco não resolvido, rodada encerrada). */
export function ledProximosOf(match: TournamentMatch | null): LedProximos | null {
  if (!match || !isKingOfCourtMatchType(match.matchType) || !match.koc) return null;
  const round = match.koc;

  let ordem: string[];
  let inicio: boolean;
  if (match.status === 'scheduled') {
    const pre = kocPreRoundOf(match);
    if (!pre) return null;
    ordem = pre.rows.map((r) => r.teamId);
    inicio = true;
  } else if (match.status === 'in_progress') {
    if (!round.kingTeamId || !round.challengerTeamId) return null;
    ordem = [round.kingTeamId, round.challengerTeamId, ...round.queue].filter((id) => id !== '');
    inicio = round.rallyLog.length === 0;
  } else {
    return null;
  }
  if (ordem.length < 2) return null;

  const seguidas = inicio ? 0 : ledSeguidasDe(round.rallyLog);
  const rows = ordem.map<LedProximosRow>((teamId, i) => {
    const papel = papelDe(i);
    return { teamId, posicao: i + 1, papel, rotulo: rotuloDe(papel, inicio, seguidas) };
  });
  const [trono, ...fila] = rows;
  return {
    inicio,
    trono: { ...trono!, numero: inicio ? 1 : kocPointsOf(round, trono!.teamId) },
    fila,
  };
}
