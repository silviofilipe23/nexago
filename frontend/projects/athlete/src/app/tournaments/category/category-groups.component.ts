import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { buildGroupStandings, distinctPoolIds, matchIsCompleted, type TournamentMatch } from '../../data/matches-repository';
import { ordinalOf } from '../tournament-format';
import { groupLabelOf, qualificationOf } from '../tournament-live.selectors';
import { TournamentLiveStore, type DuoPlayer } from '../tournament-live.store';
import { parentCategoryId } from './category-route';

export interface GroupRowView {
  rank: number;
  teamId: string;
  name: string;
  players: [DuoPlayer, DuoPlayer];
  isMine: boolean;
  wins: number;
  losses: number;
  sets: string;
  points: number;
  /** Entre os N primeiros que avançam — o par textual do destaque é o rodapé do card. */
  qualifies: boolean;
}

export interface GroupCardView {
  id: string;
  title: string;
  progressLabel: string;
  rows: GroupRowView[];
}

/**
 * Sub-visão "Grupos": a tabela de cada grupo da categoria, um card por grupo — o desenho do site
 * da Copa VH.
 *
 * Existe porque as duplas de um grupo não apareciam em lugar nenhum do portal: a chave só
 * mostrava a eliminatória e a aba de partidas trazia a classificação de um grupo só, na lateral.
 * As linhas saem de `buildGroupStandings`, que lista toda dupla sorteada mesmo antes do primeiro
 * resultado.
 */
@Component({
  selector: 'app-category-groups',
  templateUrl: './category-groups.component.html',
  styleUrl: './category-groups.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryGroupsComponent {
  protected readonly store = inject(TournamentLiveStore);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Vitória lançada na mesa muda a classificação na hora, sem recarregar.
    this.destroyRef.onDestroy(this.store.acquireLive());
  }

  private readonly categoryId = parentCategoryId();

  private readonly categoryMatches = computed<TournamentMatch[]>(() => this.store.matchesOfCategory(this.categoryId()));

  protected readonly groups = computed<GroupCardView[]>(() => {
    const matches = this.categoryMatches();
    const qualifiers = this.store.categoryById(this.categoryId())?.qualifiersPerGroup ?? 2;
    const myTeamIds = this.store.myTeamIds();

    return distinctPoolIds(matches).map((poolId) => {
      const poolMatches = matches.filter((m) => m.poolId === poolId);
      const played = poolMatches.filter((m) => matchIsCompleted(m)).length;
      return {
        id: poolId,
        title: groupLabelOf(poolId, matches),
        progressLabel: `${played}/${poolMatches.length} jogos`,
        rows: buildGroupStandings(matches, this.categoryId(), poolId).map((s, index) => ({
          rank: index + 1,
          teamId: s.teamId,
          name: this.store.duoNameOf(s.teamId),
          players: this.store.duoPlayersOf(s.teamId),
          isMine: myTeamIds.has(s.teamId),
          wins: s.wins,
          losses: s.losses,
          sets: `${s.setsWon}·${s.setsLost}`,
          points: s.points,
          qualifies: index < qualifiers,
        })),
      };
    });
  });

  /** "Você está em 2º. Faltam 2 partidas no grupo." — vinha da lateral da antiga aba Partidas e
   *  fora da aba Hoje só existia lá; sem esta linha o atleta perderia a leitura da própria
   *  situação nos dias em que não joga. */
  protected readonly myStatusNote = computed<string | null>(() => {
    const category = this.store.categoryById(this.categoryId());
    const matches = this.categoryMatches();
    const myTeamIds = this.store.myTeamIds();
    if (!category || myTeamIds.size === 0) return null;

    const mine = matches.find((m) => m.poolId && (myTeamIds.has(m.teamAId) || myTeamIds.has(m.teamBId)));
    if (!mine) return null;
    const myTeamId = myTeamIds.has(mine.teamAId) ? mine.teamAId : mine.teamBId;

    const info = qualificationOf(matches, mine.poolId, myTeamId, buildGroupStandings(matches, this.categoryId(), mine.poolId), category.qualifiersPerGroup);
    if (!info) return null;
    if (info.decided) {
      return info.qualifies
        ? `${groupLabelOf(mine.poolId, matches)} encerrado em ${ordinalOf(info.rank)}. Você avançou.`
        : `${groupLabelOf(mine.poolId, matches)} encerrado em ${ordinalOf(info.rank)}. Passavam os ${info.qualifiersPerGroup} primeiros.`;
    }
    const remaining = info.remainingMatches === 1 ? 'Falta 1 partida' : `Faltam ${info.remainingMatches} partidas`;
    return `Você está em ${ordinalOf(info.rank)} no ${groupLabelOf(mine.poolId, matches).toLowerCase()}. ${remaining} para fechar.`;
  });

  protected readonly qualifyNote = computed(() => {
    const qualifiers = this.store.categoryById(this.categoryId())?.qualifiersPerGroup ?? 0;
    if (qualifiers <= 0 || this.groups().length === 0) return null;
    return qualifiers === 1
      ? 'O primeiro de cada grupo avança para a eliminatória.'
      : `Os ${qualifiers} primeiros de cada grupo avançam para a eliminatória.`;
  });
}
