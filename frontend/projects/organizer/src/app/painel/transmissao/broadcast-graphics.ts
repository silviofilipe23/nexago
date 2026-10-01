import type { BroadcastGraphicId } from '../data/broadcast-control';
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
  aparece?: (t: OrganizerTournament) => boolean;
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

export function tournamentHasKoc(t: OrganizerTournament): boolean {
  return t.categories.some((c) => bracketSystemFromRaw(c.bracketFormat ?? '') === 'kingOfCourt');
}

export const BROADCAST_GRAPHICS: readonly BroadcastGraphicDef[] = [
  { id: 'scoreboard', nome: 'Placar', descricao: 'Placar da partida no canto inferior esquerdo', grupo: 'partida', controle: 'chave' },
  { id: 'kocBar', nome: 'Faixa da rodada', descricao: 'Rei, desafiante, fila e cronômetro no rodapé', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'kocPreRound', nome: 'Próximos em quadra', descricao: 'Elenco da rodada antes do apito', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'kocRoundEnd', nome: 'Fim de rodada', descricao: 'Classificação da rodada e classificadas da fase', grupo: 'koc', controle: 'chave', aparece: tournamentHasKoc },
  { id: 'champions', nome: 'Campeões', descricao: 'Pódio quando a final termina', grupo: 'encerramento', controle: 'chave' },
  { id: 'sponsors', nome: 'Patrocinadores', descricao: 'Card "Oferecimento" em ciclo', grupo: 'patrocinio', controle: 'chave+agora' },
  { id: 'donation', nome: 'Doação PIX', descricao: 'QR de doação no canto, em ciclo', grupo: 'patrocinio', controle: 'chave+agora' },
];

/** Grupos na ordem da tela, sem os que não fazem sentido pro torneio. */
export function broadcastGroupsFor(t: OrganizerTournament): BroadcastGroupView[] {
  return GROUP_ORDER.map((grupo) => ({
    grupo,
    label: GROUP_LABEL[grupo],
    itens: BROADCAST_GRAPHICS.filter((g) => g.grupo === grupo && (g.aparece?.(t) ?? true)),
  })).filter((g) => g.itens.length > 0);
}
