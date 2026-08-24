import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import {
  setArenaFiscalMode,
  watchArenaFiscalConfig,
} from '../fiscal/fiscal-repository';
import {
  FISCAL_MODE_LABEL,
  fiscalConfigStatusLabel,
  type ArenaFiscalConfigView,
  type FiscalConfigStatus,
  type FiscalMode,
} from '../fiscal/fiscal.model';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { formatBRL, formatFinancialMovementTimestamp } from './arena-wallet.model';
import {
  FISCAL_INVOICE_ORIGIN_LABEL,
  FISCAL_INVOICE_STATUS_LABEL,
  type FiscalInvoiceItem,
  type FiscalInvoiceStatus,
} from './fiscal-invoice.model';
import { fetchFiscalInvoices } from './fiscal-invoices-repository';

type PeriodFilter = 7 | 30 | 90 | 'all';
type StatusFilter = 'all' | FiscalInvoiceStatus;

const MODE_OPTIONS: FiscalMode[] = ['always', 'on_demand', 'off'];

const CONFIG_STATUS_TONE: Record<FiscalConfigStatus, PillTone> = {
  draft: 'dim',
  testing: 'yellow',
  active: 'green',
  error: 'red',
};

const INVOICE_STATUS_TONE: Record<FiscalInvoiceStatus, PillTone> = {
  requested: 'dim',
  processing: 'yellow',
  authorized: 'green',
  rejected: 'red',
  cancelled: 'dim',
  cancellation_failed: 'red',
};

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 'all', label: 'Tudo' },
];

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'requested', label: FISCAL_INVOICE_STATUS_LABEL.requested },
  { value: 'processing', label: FISCAL_INVOICE_STATUS_LABEL.processing },
  { value: 'authorized', label: FISCAL_INVOICE_STATUS_LABEL.authorized },
  { value: 'rejected', label: FISCAL_INVOICE_STATUS_LABEL.rejected },
  { value: 'cancelled', label: FISCAL_INVOICE_STATUS_LABEL.cancelled },
  { value: 'cancellation_failed', label: FISCAL_INVOICE_STATUS_LABEL.cancellation_failed },
];

/** Aba "Notas fiscais" do financeiro: lista `fiscalInvoices` (Task 8) da arena — leitura única
 *  via `fetchFiscalInvoices`, sem listener ao vivo (mesmo padrão de `panel-orders.component.ts`,
 *  já que a mudança de status de uma nota não precisa refletir no segundo). O seletor de modo no
 *  topo reaproveita o repositório e o model do assistente fiscal (Task 9) em vez de duplicar
 *  `watchArenaFiscalConfig`/`setArenaFiscalMode` — as duas telas espelham o mesmo doc
 *  `arenas/{arenaId}/fiscal/config`. */
@Component({
  selector: 'ar-panel-fiscal-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Notas fiscais" [subtitle]="arenaName() + ' · NFS-e emitidas'">
        <a routerLink="/painel/fiscal" class="ar-mini-btn">
          <ar-icon name="gear" [size]="14" />
          Configuração fiscal
        </a>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || configLoading()) {
          <p class="state-text">Carregando…</p>
        } @else if (config(); as cfg) {
          <ar-panel-card title="Modo de emissão" kicker="NFS-e automática">
            <div class="mode-head">
              <ar-pill [tone]="configStatusTone[cfg.status]">{{ configStatusLabel(cfg.status) }}</ar-pill>
              @if (cfg.status !== 'active') {
                <a routerLink="/painel/fiscal" class="ar-mini-btn">
                  <ar-icon name="gear" [size]="14" />
                  Concluir configuração
                </a>
              }
            </div>
            @if (cfg.status !== 'active') {
              <p class="hint">
                O seletor de modo só é liberado depois que a configuração fiscal for concluída e a nota de teste for
                aprovada pela prefeitura. Acesse a Configuração fiscal para continuar de onde parou.
              </p>
            }
            <div class="mode-options">
              @for (m of modeOptions; track m) {
                <button
                  type="button"
                  class="ar-chip"
                  [class.active]="cfg.mode === m"
                  [disabled]="!isOwner() || settingMode() || cfg.status !== 'active'"
                  (click)="chooseMode(m)"
                >
                  {{ modeLabel[m] }}
                </button>
              }
            </div>
            @if (modeError(); as merr) {
              <div class="error-banner">{{ merr }}</div>
            }
          </ar-panel-card>

          <ar-panel-card [kicker]="filteredInvoices().length + ' registros'" title="Notas emitidas" class="table-card">
            <div class="filters-row" card-actions>
              <div class="ar-filter-bar">
                @for (p of periodOptions; track p.value) {
                  <button type="button" class="ar-chip" [class.active]="period() === p.value" (click)="period.set(p.value)">
                    {{ p.label }}
                  </button>
                }
              </div>
              <div class="ar-filter-bar">
                @for (s of statusOptions; track s.value) {
                  <button type="button" class="ar-chip" [class.active]="statusFilter() === s.value" (click)="statusFilter.set(s.value)">
                    {{ s.label }}
                  </button>
                }
              </div>
            </div>

            @if (loading()) {
              <p class="state-text">Carregando notas fiscais…</p>
            } @else if (errorMessage(); as err) {
              <p class="state-text">{{ err }}</p>
              <button type="button" class="ar-mini-btn" (click)="retry()">Tentar de novo</button>
            } @else {
              <div class="table-head">
                <span>Data</span>
                <span>Origem</span>
                <span>Tomador</span>
                <span>Número</span>
                <span class="right">Valor</span>
                <span>Status</span>
                <span>Arquivos</span>
              </div>
              <div class="table-list">
                @for (inv of filteredInvoices(); track inv.id) {
                  <div class="invoice-block">
                    <div class="table-row">
                      <div class="inv-date">{{ formatDate(inv.createdAt) }}</div>
                      <div class="inv-origin">{{ originLabel[inv.origin] }}</div>
                      <div class="inv-tomador">
                        {{ inv.tomadorNome }}
                        @if (inv.tomadorDocumento) {
                          <span class="inv-doc">{{ inv.tomadorDocumento }}</span>
                        }
                      </div>
                      <div class="inv-numero">{{ inv.numero ?? '—' }}</div>
                      <div class="inv-valor right">{{ formatBRL(inv.valorBrutoReais) }}</div>
                      <div><ar-pill [tone]="statusTone[inv.status]">{{ statusLabel[inv.status] }}</ar-pill></div>
                      <div class="inv-files">
                        @if (inv.pdfUrl; as pdf) {
                          <a [href]="pdf" target="_blank" rel="noopener" class="ar-ghost-btn file-btn">PDF</a>
                        }
                        @if (inv.xmlUrl; as xml) {
                          <a [href]="xml" target="_blank" rel="noopener" class="ar-ghost-btn file-btn">XML</a>
                        }
                      </div>
                    </div>
                    @if (invoiceError(inv); as err) {
                      <div class="error-line">
                        <ar-icon name="alert-triangle" [size]="13" />
                        {{ err }}
                      </div>
                    }
                  </div>
                } @empty {
                  <p class="state-text empty-text">{{ emptyInvoicesMessage() }}</p>
                }
              </div>
            }
          </ar-panel-card>
        } @else {
          <ar-panel-card pad="lg">
            <p class="empty-title">A arena ainda não configurou a emissão de notas fiscais</p>
            <p class="state-text">
              Conclua o assistente de configuração fiscal para começar a emitir NFS-e das reservas e do clubinho
              automaticamente.
            </p>
            <a routerLink="/painel/fiscal" class="ar-mini-btn ar-mini-btn-primary">
              <ar-icon name="gear" [size]="14" />
              Configurar emissão fiscal
            </a>
          </ar-panel-card>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .empty-text {
      margin: 12px 0;
    }

    .empty-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .mode-head {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .hint {
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-dim);
      margin: 0 0 16px;
    }

    .mode-options {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-top: 16px;
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .filters-row {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .ar-filter-bar {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 100px 90px 1.3fr 90px 110px 130px 110px;
      gap: 14px;
      align-items: center;
    }

    .table-head {
      padding: 16px 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .invoice-block {
      border-bottom: 1px solid var(--nx-line);
    }

    .invoice-block:last-child {
      border-bottom: none;
    }

    .table-row {
      padding: 14px 0;
    }

    .inv-date,
    .inv-numero {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .inv-origin {
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .inv-tomador {
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .inv-doc {
      display: block;
      font-family: var(--nx-font-mono);
      font-weight: 500;
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .inv-valor {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .right {
      text-align: right;
    }

    .inv-files {
      display: flex;
      gap: 6px;
    }

    .file-btn {
      height: 26px;
      padding: 0 10px;
      font-size: 11px;
    }

    .error-line {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 0 0 12px;
      font-size: 12px;
      color: var(--nx-live);
    }

    @media (max-width: 1180px) {
      .table-head,
      .table-row {
        grid-template-columns: 90px 80px 1fr 80px 100px 120px 100px;
      }
    }
  `,
})
export class PanelFiscalInvoicesComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly destroyRef = inject(DestroyRef);

  private unsubConfig: Unsubscribe | null = null;

  protected readonly formatBRL = formatBRL;
  protected readonly formatDate = formatFinancialMovementTimestamp;
  protected readonly statusLabel = FISCAL_INVOICE_STATUS_LABEL;
  protected readonly statusTone = INVOICE_STATUS_TONE;
  protected readonly originLabel = FISCAL_INVOICE_ORIGIN_LABEL;
  protected readonly configStatusTone = CONFIG_STATUS_TONE;
  protected readonly configStatusLabel = fiscalConfigStatusLabel;
  protected readonly modeLabel = FISCAL_MODE_LABEL;
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly statusOptions = STATUS_FILTER_OPTIONS;

  /** Só o dono pode ligar/desligar a emissão automática — mesma regra da Task 9
   *  (`assertManagesArena` na Cloud Function `setArenaFiscalMode`). */
  protected readonly isOwner = computed(() => this.access.isOwner());

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'Arena');

  protected readonly configLoading = signal(true);
  protected readonly config = signal<ArenaFiscalConfigView | null>(null);
  protected readonly settingMode = signal(false);
  protected readonly modeError = signal<string | null>(null);

  protected readonly invoices = signal<FiscalInvoiceItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly period = signal<PeriodFilter>(30);
  protected readonly statusFilter = signal<StatusFilter>('all');

  protected readonly filteredInvoices = computed(() => {
    const period = this.period();
    const status = this.statusFilter();
    const cutoff = period === 'all' ? null : Date.now() - period * 24 * 60 * 60 * 1000;
    return this.invoices().filter((inv) => {
      if (status !== 'all' && inv.status !== status) return false;
      if (cutoff != null && (!inv.createdAt || inv.createdAt.getTime() < cutoff)) return false;
      return true;
    });
  });

  protected readonly emptyInvoicesMessage = computed(() =>
    this.invoices().length === 0
      ? 'Nenhuma nota fiscal emitida ainda — as notas aparecem aqui assim que forem geradas.'
      : 'Nenhuma nota encontrada com esses filtros.',
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.unsubConfig?.());

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubConfig?.();
      this.unsubConfig = null;
      if (!arenaId) return;

      this.configLoading.set(true);
      this.unsubConfig = watchArenaFiscalConfig(arenaFirestore(), arenaId, (cfg) => {
        this.config.set(cfg);
        this.configLoading.set(false);
      });

      void this.loadInvoices(arenaId);
    });
  }

  private async loadInvoices(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.invoices.set(await fetchFiscalInvoices(arenaFirestore(), arenaId));
    } catch {
      this.errorMessage.set('Não foi possível carregar as notas fiscais. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  protected retry(): void {
    const arenaId = this.arenaContext.arenaId();
    if (arenaId) void this.loadInvoices(arenaId);
  }

  /** Mensagem crua do emissor/prefeitura — visível direto na linha, sem exigir clique. */
  protected invoiceError(item: FiscalInvoiceItem): string | null {
    if ((item.status === 'rejected' || item.status === 'cancellation_failed') && item.errorMessage) {
      return item.errorMessage;
    }
    return null;
  }

  protected async chooseMode(mode: FiscalMode): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || !this.isOwner() || this.config()?.status !== 'active') return;

    this.settingMode.set(true);
    this.modeError.set(null);
    try {
      await setArenaFiscalMode(arenaFunctions(), arenaId, mode);
    } catch (err) {
      this.modeError.set(err instanceof Error ? err.message : 'Não foi possível alterar o modo de emissão.');
    } finally {
      this.settingMode.set(false);
    }
  }
}
