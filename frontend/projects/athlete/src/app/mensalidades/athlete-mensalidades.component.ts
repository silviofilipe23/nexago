import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import {
  billingSummary,
  buildBillingRows,
  formatCents,
  TRAINING_BILLING_API,
  ORIGIN_LABEL,
  shortDate,
  type BillingRow,
  type TrainingCenterBilling,
  type TrainingOrigin,
  type TrainingPayment,
} from '../data/training-billing';
import type { MyClassChargeItem } from '../data/class-agenda-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';

/** `YYYY-MM-DD` de hoje em São Paulo. */
function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

const STATUS_LABEL: Record<BillingRow['status'], string> = {
  open: 'EM ABERTO',
  late: 'VENCIDA',
  paid: 'PAGA',
  failed: 'NÃO APROVADO',
};

/**
 * W1 · Mensalidades — faturas de treino de todas as origens (centro, arena e professor
 * particular), com a mesma conta do app. A fatura do centro paga aqui mesmo (W2); a da arena abre
 * a fatura online; o resto é histórico.
 */
@Component({
  selector: 'app-athlete-mensalidades',
  standalone: true,
  imports: [AtPanelShellComponent, NxPageLoadingComponent, RouterLink],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <header class="ms-header">
        <h1>Mensalidades</h1>
        <div class="ms-sub">Centro, arena e professor particular · cada um cobra separado</div>
      </header>
      <div class="ms-body">
        @if (loading()) {
          <app-nx-page-loading title="Carregando suas mensalidades…" subtitle="Centro, arena e professor" />
        } @else {
          @let s = summary();
          <div class="ms-tiles">
            <div class="ms-tile">
              <div class="ms-kicker">Em aberto</div>
              <div class="ms-big">{{ money(s.openCents) }}</div>
              <div class="ms-line">
                {{ s.openCount === 0 ? 'Nada a pagar agora' : s.openCount + (s.openCount === 1 ? ' fatura' : ' faturas') + ' · próxima ' + short(s.nextDue) }}
              </div>
            </div>
            <div class="ms-tile">
              <div class="ms-kicker">Pago no ano</div>
              <div class="ms-big">{{ money(s.paidYearCents) }}</div>
              <div class="ms-line">{{ s.paidYearCount }} {{ s.paidYearCount === 1 ? 'pagamento' : 'pagamentos' }}</div>
            </div>
            <div class="ms-tile">
              <div class="ms-kicker">Recorrência</div>
              <div class="ms-big">{{ s.recurring?.name ?? '—' }}</div>
              <div class="ms-line">{{ s.recurring?.line ?? 'Sem mensalidade recorrente de centro' }}</div>
            </div>
          </div>

          @if (origins().length > 1) {
            <div class="ms-filters" role="group" aria-label="Filtrar por origem">
              <button type="button" class="ms-chip" [class.on]="filter() === null" (click)="filter.set(null)">Todos</button>
              @for (o of origins(); track o) {
                <button type="button" class="ms-chip" [class.on]="filter() === o" (click)="filter.set(filter() === o ? null : o)">
                  <span class="ms-dot" [class]="'ms-dot ' + o"></span>{{ originLabel[o] }}
                </button>
              }
            </div>
          }

          <div class="ms-table">
            <div class="ms-row head">
              <span>Fatura</span><span>Origem</span><span>Data</span><span>Forma</span><span>Valor</span><span></span>
            </div>
            @for (r of visible(); track r.key) {
              <div class="ms-row">
                <div style="min-width: 0">
                  <div class="ms-title">{{ r.title }}</div>
                  <div class="ms-meta"><span class="ms-dot" [class]="'ms-dot ' + r.origin"></span>{{ r.payee }}</div>
                </div>
                <div class="ms-meta hide-sm">{{ originLabel[r.origin] }}</div>
                <div class="ms-meta hide-sm">{{ short(r.date) }}</div>
                <div class="ms-meta hide-sm">{{ r.method }}</div>
                <div>
                  <div class="ms-amount">{{ money(r.amountCents) }}</div>
                  <div class="ms-status" [class]="'ms-status ' + r.status">{{ statusLabel[r.status] }}</div>
                </div>
                <div>
                  @if (r.action?.kind === 'center') {
                    <a class="ms-btn" [routerLink]="centerLink(r)">Pagar</a>
                  } @else if (r.action?.kind === 'url') {
                    <a class="ms-btn" [href]="actionUrl(r)" target="_blank" rel="noopener">Pagar</a>
                  } @else if (r.info) {
                    <span class="ms-info">{{ r.info }}</span>
                  }
                </div>
              </div>
            } @empty {
              <div class="ms-empty">Nenhuma mensalidade de treino por aqui ainda.</div>
            }
          </div>
          @if (error()) {
            <div class="ms-note red"><strong>Parte das mensalidades não carregou</strong>Atualize a página em instantes.</div>
          }
        }
      </div>
    </app-at-panel-shell>
  `,
  styleUrl: './mensalidades.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteMensalidadesComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(TRAINING_BILLING_API);

  protected readonly originLabel = ORIGIN_LABEL;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly filter = signal<TrainingOrigin | null>(null);
  private readonly centers = signal<TrainingCenterBilling[]>([]);
  private readonly charges = signal<MyClassChargeItem[]>([]);
  private readonly payments = signal<TrainingPayment[]>([]);
  private readonly today = todayKey();

  protected readonly rows = computed(() => buildBillingRows(this.centers(), this.charges(), this.payments(), this.today));
  protected readonly summary = computed(() => billingSummary(this.rows(), this.centers(), this.today));
  protected readonly origins = computed(() =>
    (['private', 'arena', 'center'] as TrainingOrigin[]).filter((o) => this.rows().some((r) => r.origin === o)),
  );
  protected readonly visible = computed(() => {
    const f = this.filter();
    return f ? this.rows().filter((r) => r.origin === f) : this.rows();
  });

  constructor() {
    this.api
      .fetchBillingSources()
      .then((s) => {
        this.centers.set(s.centers);
        this.charges.set(s.charges);
        this.payments.set(s.payments);
      })
      .catch(() => this.error.set(true))
      .finally(() => this.loading.set(false));
  }

  protected money(cents: number): string {
    return formatCents(cents);
  }

  protected short(d: string | null): string {
    return shortDate(d);
  }

  protected centerLink(r: BillingRow): string[] {
    return r.action?.kind === 'center' ? ['/mensalidades', 'centro', r.action.centerId, r.action.invoiceId] : [];
  }

  protected actionUrl(r: BillingRow): string | null {
    return r.action?.kind === 'url' ? r.action.url : null;
  }
}
