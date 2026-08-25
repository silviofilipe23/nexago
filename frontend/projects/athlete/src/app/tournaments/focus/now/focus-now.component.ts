import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { matchIsLive, type TournamentMatch } from '../../../data/matches-repository';
import { MatchShareDialogComponent } from '../../match/match-share-dialog.component';
import { eliminatedFromKnockout, hasPendingKnockout } from '../../tournament-live.selectors';
import { focusViewContextOf, nextMatchViewOf, timelineOf } from '../focus-views';
import { TournamentLiveStore } from '../../tournament-live.store';

const CALLED_TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const ANNOUNCE_TIME = CALLED_TIME;

/** Estado do bloco principal, em ordem de precedência. */
export type NowState = 'called' | 'live' | 'next' | 'pending-knockout' | 'idle';

/**
 * Precedência do bloco principal do Agora, extraída em função pura pra ser testada sem
 * `TestBed`: `callMatchToCourt` (a Cloud Function que a mesa do organizador chama) grava
 * `queueStatus: 'on_court'` E `status: 'in progress'` na MESMA escrita, então "chamado" e
 * "em quadra" coexistem no dado ao mesmo tempo. "Chamado" vence enquanto o atleta não
 * reconhecer a chamada; depois disso a mesma partida passa a aparecer como "em quadra". Sem
 * essa ordem explícita o alerta vermelho ou nunca sai da tela, ou nunca aparece.
 *
 * Sem partida do atleta (`m` nulo), a categoria ainda pode ter mata-mata pendente: o atleta
 * classificou nos grupos e a chave já existe, mas `teamAId`/`teamBId` seguem vazios até o
 * `winnerAdvance` preencher o slot — `nextMatch()` não enxerga esse jogo porque ele ainda não é
 * "dele" no dado. "idle" (fim de torneio de verdade) só vale quando NÃO há mata-mata pendente
 * na categoria; caso contrário é "pending-knockout" (ver Finding 1 da revisão).
 */
export function nowStateOf(
  m: Pick<TournamentMatch, 'id' | 'queueStatus' | 'status'> | null,
  acknowledgedMatchId: string | null,
  categoryHasPendingKnockout = false,
): NowState {
  if (!m) return categoryHasPendingKnockout ? 'pending-knockout' : 'idle';
  if (m.queueStatus === 'on_court' && acknowledgedMatchId !== m.id) return 'called';
  if (matchIsLive(m)) return 'live';
  return 'next';
}

/**
 * Seção "Agora" do Modo Focus: o que o atleta precisa saber nos próximos minutos — chamada de
 * quadra, partida em andamento, próxima partida agendada ou fim do dia — seguido da ordem do
 * dia e dos avisos do organizador.
 */
@Component({
  selector: 'app-focus-now',
  imports: [RouterLink, MatchShareDialogComponent],
  templateUrl: './focus-now.component.html',
  styleUrl: './focus-now.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusNowComponent {
  protected readonly store = inject(TournamentLiveStore);

  /** Fotografia do store consumida pelas funções puras de `focus/focus-views` — ver a
   *  documentação de `FocusViewContext` sobre por que essa indireção existe. */
  private readonly ctx = computed(() => focusViewContextOf(this.store));

  /** Compartilhar a próxima partida — o MESMO diálogo da tela da partida
   *  (`MatchShareDialogComponent`), que já monta o pôster, escolhe entre a folha nativa e o
   *  download e injeta o store por conta própria. Aqui só decide quando ele aparece. */
  protected readonly shareOpen = signal(false);

  protected readonly nextMatch = computed(() => nextMatchViewOf(this.ctx(), this.store.now()));
  protected readonly timeline = computed(() => timelineOf(this.ctx(), this.store.dayTimeline()));

  /** Existe mata-mata pendente na categoria em foco enquanto o atleta não tem partida própria
   *  agendada — ver a doc de `nowStateOf` sobre o slot que ainda não tem o `teamId` dele.
   *
   *  Excluído quando o atleta já PERDEU alguma partida do próprio mata-mata
   *  (`eliminatedFromKnockout`): sem essa trava, um atleta eliminado nas quartas via a MESMA
   *  mensagem de quem está esperando o sorteio, porque `hasPendingKnockout` só olha a chave da
   *  categoria inteira, não se o slot pendente ainda é dele. Não cobre eliminação só na fase de
   *  grupos — mesma decisão de `winsToTitleOf` — mas o texto do estado (`pending-knockout` no
   *  template) já é escrito como fato da categoria, não promessa ao leitor, então continua
   *  verdadeiro mesmo nesse caso residual. */
  protected readonly pendingKnockout = computed(() => {
    const categoryId = this.store.focusCategoryId();
    if (categoryId == null) return false;
    const matches = this.store.matches();
    return hasPendingKnockout(matches, categoryId) && !eliminatedFromKnockout(matches, categoryId, this.store.myTeamIds());
  });

  /** O reconhecimento em si mora no store (`acknowledgedCall`/`acknowledgeCall`), não aqui: ver
   *  o comentário lá sobre por que ele precisa sobreviver à troca de seção dentro do Focus. Não
   *  existe callable pra avisar a mesa — o botão só recolhe o alerta, e o rótulo ("Ok, estou
   *  indo") diz exatamente isso. */
  protected readonly state = computed<NowState>(() =>
    nowStateOf(this.store.nextMatch(), this.store.acknowledgedCall, this.pendingKnockout()),
  );

  protected readonly calledAt = computed(() => {
    const at = this.store.nextMatch()?.matchStartedAt;
    return at ? CALLED_TIME.format(at) : null;
  });

  protected readonly announcements = computed(() =>
    this.store.announcements().map((a) => ({
      id: a.id,
      time: a.createdAt ? ANNOUNCE_TIME.format(a.createdAt) : '',
      message: a.message,
    })),
  );

  /** Rota até a ARENA, não até a quadra: `tournaments/{id}.courts` é só `{id, name}`, sem
   *  posição. O rótulo do botão nomeia a arena justamente para não prometer o que não temos. */
  protected readonly mapsUrl = computed(() => {
    const t = this.store.tournament();
    if (!t) return '';
    const q = t.locationAddress ?? `${t.location}, ${t.city}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly mapsLabel = computed(() => {
    const location = this.store.tournament()?.location?.trim();
    return location ? `Como chegar na ${location}` : 'Como chegar';
  });

  protected acknowledge(): void {
    const id = this.store.nextMatch()?.id;
    if (id) this.store.acknowledgeCall(id);
  }
}
