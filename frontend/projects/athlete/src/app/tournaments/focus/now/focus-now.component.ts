import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { matchIsLive, type TournamentMatch } from '../../../data/matches-repository';
import { focusViewContextOf, nextMatchViewOf, timelineOf } from '../focus-views';
import { TournamentLiveStore } from '../../tournament-live.store';

const CALLED_TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const ANNOUNCE_TIME = CALLED_TIME;

/** Estado do bloco principal, em ordem de precedência. */
export type NowState = 'called' | 'live' | 'next' | 'idle';

/**
 * Precedência do bloco principal do Agora, extraída em função pura pra ser testada sem
 * `TestBed`: `callMatchToCourt` (a Cloud Function que a mesa do organizador chama) grava
 * `queueStatus: 'on_court'` E `status: 'in progress'` na MESMA escrita, então "chamado" e
 * "em quadra" coexistem no dado ao mesmo tempo. "Chamado" vence enquanto o atleta não
 * reconhecer a chamada; depois disso a mesma partida passa a aparecer como "em quadra". Sem
 * essa ordem explícita o alerta vermelho ou nunca sai da tela, ou nunca aparece.
 */
export function nowStateOf(m: Pick<TournamentMatch, 'id' | 'queueStatus' | 'status'> | null, acknowledgedMatchId: string | null): NowState {
  if (!m) return 'idle';
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
  imports: [RouterLink],
  templateUrl: './focus-now.component.html',
  styleUrl: './focus-now.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusNowComponent {
  protected readonly store = inject(TournamentLiveStore);

  /** Reconhecimento LOCAL da chamada. Não existe callable para avisar a mesa — o botão só
   *  recolhe o alerta, e o rótulo ("Ok, estou indo") diz exatamente isso. */
  private readonly acknowledged = signal<string | null>(null);

  /** Fotografia do store consumida pelas funções puras de `focus/focus-views` — ver a
   *  documentação de `FocusViewContext` sobre por que essa indireção existe. */
  private readonly ctx = computed(() => focusViewContextOf(this.store));

  protected readonly nextMatch = computed(() => nextMatchViewOf(this.ctx(), this.store.now()));
  protected readonly timeline = computed(() => timelineOf(this.ctx(), this.store.dayTimeline()));

  protected readonly state = computed<NowState>(() => nowStateOf(this.store.nextMatch(), this.acknowledged()));

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
    const id = this.store.nextMatch()?.id ?? null;
    this.acknowledged.set(id);
  }
}
