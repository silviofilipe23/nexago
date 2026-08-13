import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TournamentMatch } from '../../../data/matches-repository';
import type { TournamentSummary } from '../../../data/tournaments-repository';
import { groupLabelOf, knockoutLabelOf } from '../../tournament-live.selectors';
import { TournamentLiveStore } from '../../tournament-live.store';
import { roundScenariosOf } from '../focus-scenarios';
import { focusViewContextOf, liveRowsOf, qualificationNoteOf, standingsViewOf } from '../focus-views';

export interface CrossingRow {
  /** Id da partida — só pra `@for track`, nunca exibido: duas partidas paralelas da mesma fase
   *  (ex.: duas "Quartas") têm o MESMO `label`. */
  id: string;
  label: string;
  a: string;
  b: string;
}

/**
 * Cruzamento declarado pela chave — fato, não previsão. Só existe quando os DOIS slots do
 * mata-mata já trazem a descrição do sorteio ("2º do Grupo A"): antes disso o slot é `null` e
 * afirmar quem cruza com quem seria adivinhar um resultado de grupo que ainda não aconteceu.
 * Extraída como função pura (parâmetros crus, não `this.store`) pra ser testável sem `TestBed` —
 * ver `focus-group.component.spec.ts`.
 */
export function crossingRowsOf(matches: readonly TournamentMatch[], categoryId: string | null): CrossingRow[] {
  if (!categoryId) return [];
  return matches
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch)
    .filter((m) => m.teamADescription != null && m.teamBDescription != null)
    .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber)
    .slice(0, 4)
    .map((m) => ({ id: m.id, label: knockoutLabelOf(m), a: m.teamADescription!, b: m.teamBDescription! }));
}

export interface WherePlayView {
  court: string | null;
  arena: string | null;
  address: string | null;
  /** `null` sem endereço nenhum pra apontar o mapa. */
  mapsUrl: string | null;
}

/**
 * "Onde jogar": o nome da quadra da PRÓXIMA partida do atleta + o endereço da ARENA — nunca a
 * posição da quadra dentro da arena, porque `tournaments/{id}.courts` é só `{id, name}`, sem
 * coordenada nenhuma (mesma régua de `mapsUrl`/`mapsLabel` em `focus-now.component.ts`, que este
 * arquivo replica de propósito em vez de importar: são views de seções diferentes, e a única
 * coisa em comum é a fórmula do endereço). Função pura pra ser testável sem `TestBed`.
 */
export function wherePlayOf(courtName: string | null, tournament: Pick<TournamentSummary, 'location' | 'locationAddress' | 'city'> | null): WherePlayView {
  const arena = tournament?.location || null;
  const address = tournament ? (tournament.locationAddress ?? `${tournament.location}, ${tournament.city}`) : null;
  return {
    court: courtName,
    arena,
    address,
    mapsUrl: address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null,
  };
}

/**
 * Seção "Grupo" do Modo Focus: a classificação do atleta, o que a rodada atual decide, o
 * cruzamento que a chave já declara, o que está em quadra na categoria e onde jogar.
 *
 * `standingsViewOf`/`qualificationNoteOf` (Task 3) e `roundScenariosOf` (Task 4) já carregam sua
 * própria cobertura — nada disso é retestado aqui. Só `crossingRowsOf` e `wherePlayOf`, que são
 * NOVOS desta seção, ganham spec própria.
 */
@Component({
  selector: 'app-focus-group',
  imports: [RouterLink],
  templateUrl: './focus-group.component.html',
  styleUrl: './focus-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusGroupComponent {
  protected readonly store = inject(TournamentLiveStore);

  /** Fotografia do store consumida pelas funções puras de `focus/focus-views` — ver a
   *  documentação de `FocusViewContext` sobre por que essa indireção existe. */
  private readonly ctx = computed(() => focusViewContextOf(this.store));

  protected readonly standings = computed(() =>
    standingsViewOf(this.ctx(), this.store.focusPoolId() ?? '', this.store.focusCategory()?.qualifiersPerGroup ?? 2, this.store.myTeamIdInFocus()),
  );

  protected readonly qualificationNote = computed(() =>
    qualificationNoteOf(this.ctx(), this.store.focusPoolId() ?? '', this.store.focusCategory(), this.store.myTeamIdInFocus()),
  );

  protected readonly standingsTitle = computed(() => {
    const poolId = this.store.focusPoolId();
    return poolId ? `${groupLabelOf(poolId, this.store.matches())} · classificação parcial` : null;
  });

  /** `roundScenariosOf` é deliberadamente conservadora (ver a doc dela em `focus-scenarios.ts`)
   *  — só roda quando a partida do atleta é a próxima dele DENTRO do grupo em foco; fora disso
   *  devolve `[]` e a seção "Cenários da rodada" some por completo. */
  protected readonly scenarios = computed(() => {
    const poolId = this.store.focusPoolId();
    const myMatch = this.store.nextMatch();
    const qualifiers = this.store.focusCategory()?.qualifiersPerGroup ?? 2;
    if (!poolId || !myMatch || myMatch.poolId !== poolId) return [];
    return roundScenariosOf(this.store.matches(), poolId, this.store.myTeamIdInFocus(), myMatch.id, qualifiers);
  });

  protected readonly crossing = computed(() => crossingRowsOf(this.store.matches(), this.store.focusCategoryId()));

  protected readonly liveNow = computed(() => liveRowsOf(this.ctx(), this.store.focusCategoryId()));

  protected readonly where = computed(() => wherePlayOf(this.store.nextMatch()?.courtName ?? null, this.store.tournament()));

  protected readonly mapsLabel = computed(() => {
    const arena = this.where().arena?.trim();
    return arena ? `Como chegar na ${arena}` : 'Como chegar';
  });

  /** Categoria sem fase de grupos (só mata-mata), ou grupo ainda sem nenhuma partida: a seção
   *  inteira degrada mostrando só os cards que têm conteúdo — nunca quebra. Este signal só
   *  cobre o caso extremo em que NENHUM dos cinco cards tem nada pra mostrar. */
  protected readonly hasAnyContent = computed(
    () =>
      this.standingsTitle() != null ||
      this.scenarios().length > 0 ||
      this.crossing().length > 0 ||
      this.liveNow().length > 0 ||
      this.where().court != null ||
      this.where().arena != null,
  );
}
