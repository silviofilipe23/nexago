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
import { OgIconComponent, type OgIconName } from '../ui/icon.component';
import { OgPlanCardComponent } from './plan-card.component';

interface EventChip {
  icon: OgIconName;
  text: string;
  missing?: boolean;
}

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
        <div class="event">
          <label class="og-field event-field">
            <span class="og-field-label">Evento</span>
            <select class="og-select-el" [value]="tournamentId()" (change)="pickTournament($event)">
              @for (t of options(); track t.id) {
                <option [value]="t.id" [selected]="t.id === tournamentId()">{{ t.name }}</option>
              }
            </select>
          </label>
          @if (eventMeta().length > 0) {
            <div class="chips">
              @for (m of eventMeta(); track m.icon) {
                <span class="chip" [class.missing]="m.missing"><og-icon [name]="m.icon" [size]="13" />{{ m.text }}</span>
              }
            </div>
          }
        </div>

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

        @if (warning() || blockers().length > 0) {
          <div class="notes">
            @if (warning(); as w) {
              <div class="note warn"><og-icon name="alert" [size]="15" />{{ w }}</div>
            }
            @for (b of blockers(); track b) {
              <div class="note block"><og-icon name="alert" [size]="15" />{{ b }}</div>
            }
          </div>
        }

        @if (plan(); as p) {
          <div class="summary" role="group" aria-label="Resumo: quanto você paga">
            <div class="cell">
              <span class="cell-label">Plano</span>
              <b class="cell-value">{{ brl(p.priceCents) }}</b>
              <span class="cell-sub">{{ p.name }}, por evento</span>
            </div>
            <div class="cell">
              <span class="cell-label">Sinal {{ p.depositPct }}%</span>
              <b class="cell-value">{{ brl(amounts().depositCents) }}</b>
              <span class="cell-sub">Reserva a data. Cobrado pela NexaGO ao confirmar</span>
            </div>
            <div class="cell">
              <span class="cell-label">Saldo até {{ balanceDue() }}</span>
              <b class="cell-value">{{ brl(amounts().balanceCents) }}</b>
              <span class="cell-sub">Restante do plano</span>
            </div>
            <div class="cell">
              <span class="cell-label">Cancelamento</span>
              <b class="cell-value sm">{{ cancelLabel() }}</b>
            </div>
            <div class="cell">
              <span class="cell-label">Comissão {{ catalog().feePercent }}%</span>
              <b class="cell-value sm">Sobre as inscrições</b>
              <span class="cell-sub">Pagas no app, à parte do plano</span>
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
    /* Largo de propósito: os 4 planos lado a lado e o resumo numa faixa cabem num notebook sem
       rolar. Abaixo disso as consultas de contêiner descem pra 2 e 1 coluna. */
    .og-dialog {
      container: contratar / inline-size;
      box-sizing: border-box;
      width: min(1080px, 100%);
      max-height: calc(100dvh - 40px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 22px 24px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .kicker,
    .cell-label {
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
    .muted {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .event {
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 10px 16px;
    }
    .event-field {
      flex: 1 1 320px;
      max-width: 460px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-bottom: 7px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border-radius: 99px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
    }
    .chip og-icon {
      display: inline-flex;
      color: var(--nx-orange-500);
    }
    .chip.missing {
      color: var(--nx-text-mute);
    }
    .plans {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      padding-top: 8px;
    }
    .notes {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .note {
      display: flex;
      gap: 10px;
      padding: 8px 13px;
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
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding: 13px 16px;
    }
    .cell + .cell {
      border-left: 1px solid var(--nx-line);
    }
    .cell-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    .cell-value.sm {
      font-size: 13.5px;
      font-weight: 700;
      letter-spacing: 0;
      line-height: 1.35;
    }
    .cell-sub {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.4;
      color: var(--nx-text-dim);
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
    @container contratar (max-width: 860px) {
      .plans {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        row-gap: 20px;
      }
      .summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .cell + .cell {
        border-left: none;
      }
      .cell {
        border-top: 1px solid var(--nx-line);
      }
      .cell:first-child,
      .cell:nth-child(2) {
        border-top: none;
      }
      .cell:nth-child(even) {
        border-left: 1px solid var(--nx-line);
      }
    }
    @container contratar (max-width: 480px) {
      .plans,
      .summary {
        grid-template-columns: minmax(0, 1fr);
      }
      .cell:nth-child(2) {
        border-top: 1px solid var(--nx-line);
      }
      .cell:nth-child(even) {
        border-left: none;
      }
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

  /** Data, cidade e quadras do evento escolhido — as três coisas que mudam o plano indicado. */
  protected readonly eventMeta = computed<EventChip[]>(() => {
    const t = this.tournament();
    const start = this.startDate();
    if (!t || !start) return [];
    const end = t.endAt ? saoPauloDate(t.endAt) : start;
    return [
      { icon: 'calendar', text: dayRangeLabel(start, end > start ? end : start) },
      { icon: 'pin', text: t.city ?? 'Cidade não informada', missing: !t.city },
      { icon: 'court', text: `${t.courtsCount} ${t.courtsCount === 1 ? 'quadra' : 'quadras'}` },
    ];
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
