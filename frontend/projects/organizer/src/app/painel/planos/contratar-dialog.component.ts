import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import {
  CANCEL_LABEL,
  balanceDueDateOf,
  brl,
  contractAmounts,
  contractBlockers,
  contractableTournaments,
  courtsWarning,
  dayLabel,
  dayRangeLabel,
  recommendedPlanId,
  saoPauloDate,
  type CatalogPlan,
  type PlanCatalog,
  type PlanContract,
} from '../data/plan-contracts';
import { requestPlanContract } from '../data/plan-contracts-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';
import { OgIconComponent } from '../ui/icon.component';
import { OgPlanCardComponent } from './plan-card.component';

/** Pedido de contratação de um plano para um evento (protótipo 04b, fora do wizard): escolhe o
 *  evento, o plano e confere o que paga. O pedido nasce `requested` — a NexaGO confirma a data
 *  e envia a cobrança do sinal; a tela não promete reserva antes disso. */
@Component({
  selector: 'og-contratar-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgIconComponent, OgPlanCardComponent],
  host: {
    class: 'og-dialog-backdrop',
    '(click)': 'close()',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <div class="og-dialog" role="dialog" aria-modal="true" aria-labelledby="og-contratar-title" (click)="$event.stopPropagation()">
      <div class="top">
        <div>
          <div class="kicker">Planos NexaGO</div>
          <h2 id="og-contratar-title" class="title">Contratar para um evento</h2>
        </div>
        <button type="button" class="og-ghost-btn close" aria-label="Fechar" (click)="close()">
          <og-icon name="close" [size]="16" />
        </button>
      </div>

      @if (loading()) {
        <p class="muted">Carregando seus eventos…</p>
      } @else if (loadError()) {
        <p class="error">Não foi possível carregar seus eventos. Feche e tente de novo.</p>
      } @else if (options().length === 0) {
        <div class="empty">
          <p>
            Nenhum evento apto agora. O plano é contratado para um torneio que você organiza, com data definida, ainda
            por acontecer e sem outro plano ativo.
          </p>
          <a class="og-mini-btn" routerLink="/painel/novo-evento" (click)="close()">
            <og-icon name="plus" [size]="14" />Criar evento
          </a>
        </div>
      } @else {
        <label class="og-field">
          <span class="og-field-label">Evento</span>
          <select class="og-select-el" [value]="tournamentId()" (change)="pickTournament($event)">
            @for (t of options(); track t.id) {
              <option [value]="t.id" [selected]="t.id === tournamentId()">{{ t.name }}</option>
            }
          </select>
          @if (tournament(); as t) {
            <span class="hint">{{ eventLine() }}</span>
          }
        </label>

        <div class="og-field">
          <span class="og-field-label">Plano</span>
          <div class="plans" role="radiogroup" aria-label="Plano">
            @for (p of plans(); track p.id; let i = $index) {
              <og-plan-card
                role="radio"
                tabindex="0"
                [attr.aria-checked]="p.id === planId()"
                [plan]="p"
                [prev]="i > 0 ? plans()[i - 1]! : null"
                [selected]="p.id === planId()"
                [badge]="p.id === recommendedId() ? 'Para suas ' + eventCourts() + ' quadras' : null"
                (click)="planId.set(p.id)"
                (keydown.enter)="planId.set(p.id)"
                (keydown.space)="$event.preventDefault(); planId.set(p.id)"
              />
            }
          </div>
        </div>

        @if (warning(); as w) {
          <div class="note warn"><og-icon name="alert" [size]="15" />{{ w }}</div>
        }
        @for (b of blockers(); track b) {
          <div class="note block"><og-icon name="alert" [size]="15" />{{ b }}</div>
        }

        @if (plan(); as p) {
          <div class="summary">
            <div class="summary-kicker">Resumo · quanto você paga</div>
            <div class="row"><span>Plano</span><b>{{ p.name }} · {{ brl(p.priceCents) }}</b></div>
            <div class="row">
              <span>Sinal {{ p.depositPct }}%</span>
              <b>{{ brl(amounts().depositCents) }} para reservar a data, cobrado pela NexaGO ao confirmar</b>
            </div>
            <div class="row"><span>Até {{ balanceDue() }}</span><b>{{ brl(amounts().balanceCents) }} restantes</b></div>
            <div class="row"><span>Cancelamento</span><b>{{ cancelLabel() }}</b></div>
            <div class="row">
              <span>Comissão {{ catalog().feePercent }}%</span>
              <b>Sobre as inscrições pagas no app, à parte do plano</b>
            </div>
          </div>
        }

        @if (error(); as e) {
          <p class="error">{{ e }}</p>
        }
      }

      <div class="actions">
        <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="close()">Voltar</button>
        @if (options().length > 0) {
          <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="!canSubmit()" (click)="submit()">
            {{ busy() ? 'Enviando…' : 'Solicitar contratação' }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(7, 7, 8, 0.66);
      backdrop-filter: blur(4px);
    }
    .og-dialog {
      width: min(720px, 100%);
      max-height: calc(100dvh - 40px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 22px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .kicker,
    .summary-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .title {
      margin: 4px 0 0;
      font-family: var(--nx-font-display);
      font-size: 19px;
      font-weight: 800;
      color: var(--nx-text);
    }
    .close {
      flex: none;
    }
    .hint,
    .muted {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .muted {
      margin: 0;
      font-size: 13px;
    }
    .plans {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      padding-top: 8px;
    }
    @media (max-width: 560px) {
      .plans {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .note {
      display: flex;
      gap: 10px;
      padding: 11px 13px;
      border-radius: var(--nx-r-2);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--nx-text-mute);
    }
    .note og-icon {
      flex: none;
      display: inline-flex;
      margin-top: 1px;
    }
    .note.warn {
      background: rgba(244, 197, 67, 0.06);
      border: 1px solid rgba(244, 197, 67, 0.25);
    }
    .note.warn og-icon {
      color: var(--nx-pending);
    }
    .note.block {
      background: rgba(255, 59, 48, 0.07);
      border: 1px solid rgba(255, 59, 48, 0.3);
      color: var(--nx-text);
    }
    .note.block og-icon {
      color: var(--nx-live);
    }
    .summary {
      display: flex;
      flex-direction: column;
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
    }
    .summary-kicker {
      margin-bottom: 6px;
    }
    .row {
      display: grid;
      grid-template-columns: 130px minmax(0, 1fr);
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }
    .row:last-child {
      border-bottom: none;
    }
    .row span {
      color: var(--nx-text-dim);
    }
    .row b {
      font-weight: 600;
      color: var(--nx-text);
    }
    @media (max-width: 560px) {
      .row {
        grid-template-columns: minmax(0, 1fr);
        gap: 2px;
      }
    }
    .empty p {
      margin: 0 0 12px;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .error {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class OgContratarDialogComponent {
  private readonly auth = inject(AuthService);

  readonly catalog = input.required<PlanCatalog>();
  readonly contracts = input<PlanContract[]>([]);
  /** Evento já escolhido (atalho vindo do card do evento); `null` = primeiro apto. */
  readonly initialTournamentId = input<string | null>(null);

  readonly closed = output<void>();
  /** Nome do evento do pedido aceito — a página mostra a confirmação. */
  readonly requested = output<string>();

  protected readonly brl = brl;

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  private readonly tournaments = signal<OrganizerTournament[]>([]);
  protected readonly tournamentId = signal('');
  protected readonly planId = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly plans = computed(() => this.catalog().plans);
  protected readonly options = computed(() =>
    contractableTournaments(this.tournaments(), this.contracts(), this.catalog().today),
  );
  protected readonly tournament = computed(() => this.options().find((t) => t.id === this.tournamentId()) ?? null);
  protected readonly eventCourts = computed(() => this.tournament()?.courtsCount ?? 1);
  protected readonly recommendedId = computed(() => recommendedPlanId(this.plans(), this.eventCourts()));
  protected readonly plan = computed<CatalogPlan | null>(() => this.plans().find((p) => p.id === this.planId()) ?? null);
  private readonly startDate = computed(() => {
    const t = this.tournament();
    return t?.startAt ? saoPauloDate(t.startAt) : null;
  });

  protected readonly eventLine = computed(() => {
    const t = this.tournament();
    const start = this.startDate();
    if (!t || !start) return '';
    const end = t.endAt ? saoPauloDate(t.endAt) : start;
    const courts = `${t.courtsCount} ${t.courtsCount === 1 ? 'quadra' : 'quadras'}`;
    return [dayRangeLabel(start, end > start ? end : start), t.city ?? 'Cidade não informada', courts].join(' · ');
  });
  protected readonly warning = computed(() => {
    const p = this.plan();
    return p ? courtsWarning(p, this.eventCourts()) : null;
  });
  protected readonly blockers = computed(() => {
    const p = this.plan();
    const start = this.startDate();
    if (!p || !start) return [];
    return contractBlockers(p, { startDate: start, city: this.tournament()?.city ?? null }, this.catalog().today);
  });
  protected readonly amounts = computed(() => contractAmounts(this.plan() ?? { priceCents: 0, depositPct: 0 }));
  protected readonly balanceDue = computed(() => {
    const p = this.plan();
    const start = this.startDate();
    return p && start ? dayLabel(balanceDueDateOf(start, p.balanceDays, this.catalog().today)) : '';
  });
  protected readonly cancelLabel = computed(() => {
    const p = this.plan();
    return p ? CANCEL_LABEL[p.cancelPolicy] : '';
  });
  protected readonly canSubmit = computed(
    () => !this.busy() && this.tournament() != null && this.plan() != null && this.blockers().length === 0,
  );

  constructor() {
    void this.loadTournaments();

    // Trocou de evento: volta pro plano que cobre as quadras dele.
    effect(() => {
      this.tournamentId();
      this.planId.set(this.recommendedId() ?? '');
      this.error.set(null);
    });
  }

  private async loadTournaments(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loadError.set(true);
      this.loading.set(false);
      return;
    }
    try {
      this.tournaments.set(await listMyTournaments(uid));
      const options = this.options();
      const initial = this.initialTournamentId();
      this.tournamentId.set(options.find((t) => t.id === initial)?.id ?? options[0]?.id ?? '');
    } catch (err) {
      console.warn('Planos: falha ao ler os eventos do organizador', err);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected pickTournament(event: Event): void {
    this.tournamentId.set((event.target as HTMLSelectElement).value);
  }

  protected async submit(): Promise<void> {
    const t = this.tournament();
    const p = this.plan();
    if (!t || !p || !this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await requestPlanContract(t.id, p.id, p.priceCents);
      this.requested.emit(t.name);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar o pedido.');
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }
}
