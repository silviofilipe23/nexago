import type { BroadcastControl, BroadcastGraphicId, BroadcastInterview } from '../data/broadcast-control';
import type { InterviewQueue } from '../data/interview-queue';
import type { TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { BROADCAST_GRAPHICS, tournamentHasKoc } from './broadcast-graphics';

/** Cada linha da lista "Gráficos" do painel de Transmissão. As chaves de `BroadcastGraphicId`
 *  valem como são; o resto (Multi, Pré-jogo, Ranking, Grade, Entrevista, Resumo) é controle
 *  próprio, fora de `control.graphics`. */
export type TxItemKey = BroadcastGraphicId | 'multi' | 'prejogo' | 'ranking' | 'grade' | 'interview' | 'summary';

export interface TxItem {
  key: TxItemKey;
  nome: string;
  on: boolean;
  /** Sem como ligar daqui (Pré-jogo/Ranking sem card; Entrevista sem tarja): o switch fica travado. */
  locked: boolean;
  /** Resumo em amarelo (ex.: "Monte o card primeiro"). */
  warn: boolean;
  resumo: string;
  /** Tem o botão "Mostrar agora" (Patrocinadores e Doação). */
  agora: boolean;
}

export interface TxGroup {
  label: string;
  itens: TxItem[];
}

export interface TxInput {
  control: BroadcastControl;
  tournament: OrganizerTournament | null;
  matches: readonly TournamentMatch[];
  queue: InterviewQueue;
  /** Tarja no ar agora (a tela decide pelo relógio). */
  interview: BroadcastInterview | null;
}

const KOC_ITEMS = BROADCAST_GRAPHICS.filter((g) => g.grupo === 'koc');
const GRAPHIC = (id: BroadcastGraphicId) => BROADCAST_GRAPHICS.find((g) => g.id === id)!;

/** Grupos da lista, na ordem da tela. O King of the Court só entra em torneio que o usa. */
export function txGroupsOf(x: TxInput): TxGroup[] {
  const { control: c, tournament: t } = x;
  const graphic = (id: BroadcastGraphicId, resumo: string, extra: Partial<TxItem> = {}): TxItem => ({
    key: id,
    nome: GRAPHIC(id).nome,
    on: c.graphics[id],
    locked: false,
    warn: false,
    resumo,
    agora: GRAPHIC(id).controle === 'chave+agora',
    ...extra,
  });
  const courtName = (id: string | null) => (id ? ((t?.courts ?? []).find((q) => q.id === id)?.name ?? 'Nenhuma') : 'Nenhuma');
  const categoryName = (id: string | null) => (id ? ((t?.categories ?? []).find((k) => k.id === id)?.name ?? 'Todas') : 'Todas');
  const semPatrocinador = (t?.sponsors ?? []).length === 0;

  const prejogoCard = c.prejogo.card;
  const rankingCard = c.ranking.card;
  const groups: TxGroup[] = [
    {
      label: 'Partida',
      itens: [
        graphic('scoreboard', 'Canto inferior esquerdo'),
        {
          key: 'multi',
          nome: 'Multi-quadras',
          on: c.multi.on,
          locked: false,
          warn: false,
          resumo: `${c.multi.mode === 'full' ? 'Tela cheia' : 'Faixa'} · destaque: ${courtName(c.multi.focusCourtId)}`,
          agora: false,
        },
      ],
    },
  ];
  if (t && tournamentHasKoc(t, x.matches)) {
    groups.push({ label: 'King of the Court', itens: KOC_ITEMS.map((g) => graphic(g.id, g.descricao)) });
  }
  groups.push(
    {
      label: 'Apresentação',
      itens: [
        {
          key: 'prejogo',
          nome: 'Pré-jogo',
          on: c.prejogo.on,
          locked: !prejogoCard && !c.prejogo.on,
          warn: !prejogoCard,
          resumo: prejogoCard ? `${prejogoCard.a.names.join(' / ')} × ${prejogoCard.b.names.join(' / ')}` : 'Monte o card primeiro',
          agora: false,
        },
        {
          key: 'ranking',
          nome: 'Ranking Top 10',
          on: c.ranking.on,
          locked: !rankingCard && !c.ranking.on,
          warn: !rankingCard,
          resumo: rankingCard ? `Ranking ${rankingCard.categoryLabel}` : 'Monte o card primeiro',
          agora: false,
        },
        {
          key: 'grade',
          nome: 'Grade do dia',
          on: c.grade.on,
          locked: false,
          warn: false,
          resumo: c.grade.categoryId ? `Destaque: ${categoryName(c.grade.categoryId)}` : 'Programação das quadras · todas as categorias',
          agora: false,
        },
      ],
    },
    {
      label: 'Entrevista',
      itens: [
        {
          key: 'interview',
          nome: 'Entrevista',
          on: x.interview != null,
          locked: x.interview == null,
          warn: false,
          resumo: `Fila · ${x.queue.items.length}${x.interview ? ' · Tarja no ar' : ''}`,
          agora: false,
        },
      ],
    },
    {
      label: 'Encerramento',
      itens: [
        graphic('champions', GRAPHIC('champions').descricao),
        {
          key: 'summary',
          nome: 'Resumo da partida',
          on: c.summaryOn,
          locked: false,
          warn: false,
          resumo: c.summaryOn ? 'Ligado à mão' : 'Entra sozinho ao fim da partida',
          agora: false,
        },
      ],
    },
    {
      label: 'Patrocínio',
      itens: [
        graphic('sponsors', semPatrocinador ? 'Nenhum patrocinador cadastrado' : GRAPHIC('sponsors').descricao, { warn: semPatrocinador }),
        graphic('donation', GRAPHIC('donation').descricao),
      ],
    },
  );
  return groups;
}

export function txItemsOf(groups: readonly TxGroup[]): TxItem[] {
  return groups.flatMap((g) => g.itens);
}
