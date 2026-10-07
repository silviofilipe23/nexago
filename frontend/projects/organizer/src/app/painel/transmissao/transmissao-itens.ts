import type { BroadcastControl, BroadcastGraphicId, BroadcastInterview } from '../data/broadcast-control';
import { INTERVALO_BADGE } from '../data/broadcast-intervalo';
import type { InterviewQueue } from '../data/interview-queue';
import type { TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { categoriasComGrupos, gruposDaCategoria } from './transmissao-grupo';
import { BROADCAST_GRAPHICS, tournamentHasKoc } from './broadcast-graphics';

/** Cada linha da lista "Gráficos" do painel de Transmissão. As chaves de `BroadcastGraphicId`
 *  valem como são; o resto (Multi, Pré-jogo, Ranking, Grade, Entrevista, Resumo) é controle
 *  próprio, fora de `control.graphics`. */
export type TxItemKey = BroadcastGraphicId | 'multi' | 'prejogo' | 'ranking' | 'grade' | 'intervalo' | 'grupo' | 'chave' | 'interview' | 'summary';

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

/** Duração da contagem como "5:00". */
function intervaloClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

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
  const grupoResumo = (): string => {
    if (!c.grupo.on) return 'Desligado';
    const comGrupos = categoriasComGrupos(x.matches, t?.categories ?? []);
    const categoria = comGrupos.find((k) => k.id === c.grupo.categoryId) ?? comGrupos[0];
    const nome = categoria?.name ?? 'Sem categoria';
    if (c.grupo.mode === 'todos') return `Todos os grupos · ${nome}`;
    const letra = c.grupo.group ?? (categoria ? gruposDaCategoria(x.matches, categoria.id)[0] : undefined);
    return `${letra ? `Grupo ${letra}` : 'Primeiro grupo'} · ${nome}`;
  };
  const chaveResumo = (): string => {
    if (!c.chave.on) return 'Desligado';
    return (t?.categories ?? []).find((k) => k.id === c.chave.categoryId)?.name ?? 'Automática';
  };
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
        {
          key: 'intervalo',
          nome: 'Intervalo',
          on: c.intervalo.on,
          locked: false,
          warn: false,
          resumo: c.intervalo.on
            ? `${INTERVALO_BADGE[c.intervalo.mode]} · ${c.intervalo.durationSec > 0 ? intervaloClock(c.intervalo.durationSec) : 'sem contagem'}`
            : 'Desligado',
          agora: false,
        },
        {
          key: 'grupo',
          nome: 'Tabela do grupo',
          on: c.grupo.on,
          locked: false,
          warn: false,
          resumo: grupoResumo(),
          agora: false,
        },
        {
          key: 'chave',
          nome: 'Chaves',
          on: c.chave.on,
          locked: false,
          warn: false,
          resumo: chaveResumo(),
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
