import type { BroadcastGraphicId } from '../data/broadcast-control';
import { isKingOfCourtMatchType } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import { bracketSystemFromRaw } from '../data/tournament-create.model';
import type { OrganizerTournament } from '../data/tournament.model';

/** Registro dos gráficos da transmissão — a extensibilidade. Gráfico novo = entrada aqui +
 *  campo em `BroadcastGraphics` + componente no overlay + regra em `overlayLayersOf`. Controles
 *  de MODO (fim de rodada, Grande final) e a tarja são seções próprias da tela, não linhas. */
export type BroadcastGraphicGroup = 'partida' | 'koc' | 'encerramento' | 'patrocinio';

export interface BroadcastGraphicDef {
  id: BroadcastGraphicId;
  nome: string;
  descricao: string;
  grupo: BroadcastGraphicGroup;
  controle: 'chave' | 'chave+agora';
  /** A linha só aparece quando faz sentido pro torneio (ex.: KOTC). */
  aparece?: (t: OrganizerTournament, matches: readonly TournamentMatch[]) => boolean;
}

export interface BroadcastGroupView {
  grupo: BroadcastGraphicGroup;
  label: string;
  itens: BroadcastGraphicDef[];
}

const GROUP_ORDER: readonly BroadcastGraphicGroup[] = ['partida', 'koc', 'encerramento', 'patrocinio'];

const GROUP_LABEL: Record<BroadcastGraphicGroup, string> = {
  partida: 'Partida',
  koc: 'King of the Court',
  encerramento: 'Encerramento',
  patrocinio: 'Patrocínio',
};

/** KOTC pela categoria OU pelas partidas: no dev, o "Queen & King of the court" tem as categorias
 *  gravadas como `groups_knockout` e as partidas como `koc_round` — só a categoria esconderia o
 *  grupo justamente no torneio que mais o usa. */
export function tournamentHasKoc(t: OrganizerTournament, matches: readonly TournamentMatch[]): boolean {
  return (
    t.categories.some((c) => bracketSystemFromRaw(c.bracketFormat ?? '') === 'kingOfCourt') ||
    matches.some((m) => isKingOfCourtMatchType(m.matchType))
  );
}

export const BROADCAST_GRAPHICS: readonly BroadcastGraphicDef[] = [
  { id: 'scoreboard', nome: 'Placar', descricao: 'Placar da partida no canto inferior esquerdo', grupo: 'partida', controle: 'chave' },
  { id: 'decisivo', nome: 'Momento decisivo', descricao: 'Alerta de set point, match point e tie-break (entra sozinho)', grupo: 'partida', controle: 'chave' },
  { id: 'kocBar', nome: 'Faixa da rodada', descricao: 'Rei, desafiante, fila e cronômetro no rodapé', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'kocPreRound', nome: 'Próximos em quadra', descricao: 'Elenco da rodada antes do apito', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'kocRoundEnd', nome: 'Fim de rodada', descricao: 'Classificação da rodada e classificadas da fase', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'champions', nome: 'Campeões', descricao: 'Pódio quando a final termina', grupo: 'encerramento', controle: 'chave' },
  { id: 'sponsors', nome: 'Patrocinadores', descricao: 'Card "Oferecimento" em ciclo', grupo: 'patrocinio', controle: 'chave+agora' },
  { id: 'donation', nome: 'Doação PIX', descricao: 'QR de doação no canto, em ciclo', grupo: 'patrocinio', controle: 'chave+agora' },
];

/** Grupos na ordem da tela, sem os que não fazem sentido pro torneio. */
export function broadcastGroupsFor(t: OrganizerTournament, matches: readonly TournamentMatch[]): BroadcastGroupView[] {
  return GROUP_ORDER.map((grupo) => ({
    grupo,
    label: GROUP_LABEL[grupo],
    itens: BROADCAST_GRAPHICS.filter((g) => g.grupo === grupo && (g.aparece?.(t, matches) ?? true)),
  })).filter((g) => g.itens.length > 0);
}
