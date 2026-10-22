import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { callableErrorMessage } from '../data/callable-error';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import {
  activationGaps,
  formatBRL,
  formatDate,
  parseCents,
  statusPill,
  SUBSCRIPTION_STATUSES,
  type CenterDetail,
  type CenterStatus,
} from './data/training-centers';
import { TrainingCentersRepository } from './data/training-centers.repository';

type Decision = { status: CenterStatus; title: string; description: string; confirm: string; tone: 'primary' | 'danger' };

const DECISIONS: Record<CenterStatus, Omit<Decision, 'status'>> = {
  active: {
    title: 'Ativar centro',
    description: 'Libera matrículas e cobranças. O owner vê o centro como ativo na hora.',
    confirm: 'Ativar',
    tone: 'primary',
  },
  suspended: {
    title: 'Suspender centro',
    description: 'O centro fica somente leitura: sem matrícula, cobrança nem chamada. Nada é apagado. O motivo aparece para o centro.',
    confirm: 'Suspender',
    tone: 'danger',
  },
  pending: {
    title: 'Voltar para pendente',
    description: 'Bloqueia matrícula e cobrança novas até nova ativação.',
    confirm: 'Voltar para pendente',
    tone: 'danger',
  },
};

/** Detalhe do centro no backoffice: o que o owner não faz sozinho pelo portal. */
@Component({
  selector: 'bo-centro-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PanelCardComponent, PillComponent, IconComponent, KpiMiniComponent, ConfirmDialogComponent],
  templateUrl: './centro-detalhe.component.html',
  styles: `
    .status { margin: 0; font-size: 12px; color: var(--nx-text-dim); }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px; }
    .form label { display: flex; flex-direction: column; gap: 6px; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .form .full { grid-column: 1 / -1; }
    .gap { display: flex; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; color: var(--nx-text-mute); }
    .ok { color: var(--nx-win); }
    .warn { color: var(--nx-pending); }
    .ok-text { font-size: 12.5px; color: var(--nx-win); margin-top: 8px; }
    .reason { margin-top: 12px; }
    @media (max-width: 1100px) { .bo-detail-grid { grid-template-columns: 1fr; } }
  `,
})
export class CentroDetalheComponent implements OnInit {
  readonly id = input.required<string>();

  private readonly repo = inject(TrainingCentersRepository);
  private token = 0;

  protected readonly detail = signal<CenterDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly subscriptionStatuses = SUBSCRIPTION_STATUSES;

  protected readonly center = computed(() => this.detail()?.center ?? null);
  protected readonly pill = computed(() => (this.center() ? statusPill(this.center()!) : null));
  protected readonly gaps = computed(() => {
    const d = this.detail();
    return d ? activationGaps(d.center, d.programs) : [];
  });

  // Decisão de situação (confirmação com motivo).
  protected readonly decision = signal<Decision | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  // Recebimento.
  protected readonly walletId = signal('');
  protected readonly asaasEnv = signal('production');
  protected readonly fee = signal('');
  protected readonly receivingMsg = signal('');
  protected readonly receivingError = signal('');

  // Assinatura.
  protected readonly plan = signal('');
  protected readonly subStatus = signal('trial');
  protected readonly openInvoice = signal('');
  protected readonly dueDate = signal('');
  protected readonly attempts = signal('');
  protected readonly subMsg = signal('');
  protected readonly subError = signal('');

  ngOnInit(): void {
    void this.reload();
  }

  protected date(ms: number | null): string {
    return formatDate(ms);
  }

  protected brl(cents: number | null): string {
    return formatBRL(cents);
  }

  protected subscriptionLabel(id: string): string {
    return SUBSCRIPTION_STATUSES.find((s) => s.id === id)?.label ?? id;
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected async reload(): Promise<void> {
    const t = ++this.token;
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await this.repo.get(this.id());
      if (t !== this.token) return;
      this.detail.set(d);
      const sub = d.center.subscription;
      this.plan.set(sub?.plan ?? 'NexaGO Centro');
      this.subStatus.set(sub?.status ?? 'trial');
      this.openInvoice.set(sub?.openInvoiceCents != null ? (sub.openInvoiceCents / 100).toFixed(2).replace('.', ',') : '');
      this.dueDate.set(sub?.dueDate ?? '');
      this.attempts.set(sub?.attempts ?? '');
      this.asaasEnv.set(d.receiving?.asaasEnv ?? 'production');
      this.fee.set(d.receiving?.feePercent != null ? String(d.receiving.feePercent) : '');
    } catch (err) {
      if (t === this.token) this.error.set(callableErrorMessage(err));
    } finally {
      if (t === this.token) this.loading.set(false);
    }
  }

  protected ask(status: CenterStatus): void {
    this.reason.set('');
    this.actionError.set(null);
    this.decision.set({ status, ...DECISIONS[status] });
  }

  protected async confirmDecision(): Promise<void> {
    const d = this.decision();
    if (!d) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.repo.setStatus(this.id(), d.status, this.reason().trim());
      this.decision.set(null);
      await this.reload();
    } catch (err) {
      this.actionError.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveReceiving(): Promise<void> {
    this.receivingMsg.set('');
    this.receivingError.set('');
    const feeRaw = this.fee().trim().replace(',', '.');
    const fee = feeRaw ? Number(feeRaw) : null;
    if (fee != null && !Number.isFinite(fee)) {
      this.receivingError.set('Taxa inválida.');
      return;
    }
    this.busy.set(true);
    try {
      await this.repo.setReceiving(this.id(), this.walletId().trim(), this.asaasEnv(), fee);
      this.walletId.set('');
      this.receivingMsg.set('Conta de recebimento conectada.');
      await this.reload();
    } catch (err) {
      this.receivingError.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveSubscription(): Promise<void> {
    this.subMsg.set('');
    this.subError.set('');
    const open = parseCents(this.openInvoice());
    if (Number.isNaN(open)) {
      this.subError.set('Valor em aberto inválido.');
      return;
    }
    this.busy.set(true);
    try {
      await this.repo.setSubscription(this.id(), {
        plan: this.plan().trim(),
        status: this.subStatus(),
        openInvoiceCents: open,
        dueDate: this.dueDate() || null,
        attempts: this.attempts().trim() || null,
      });
      this.subMsg.set('Assinatura atualizada.');
      await this.reload();
    } catch (err) {
      this.subError.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
