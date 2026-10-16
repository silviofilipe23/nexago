import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { callableErrorMessage } from '../../data/callable-error';
import { StoreBadgesService } from '../../data/store-badges.service';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { relativeStamp } from '../estoque/data/stock';
import type { PhotoSides } from '../produtos/data/photo-sides';
import { customizationFromDoc, type CustomizationConfig } from '../produtos/personalizacao/data/customization';
import {
  REASON_LABELS,
  STATUS_INFO,
  STATUS_ORDER,
  batchCsv,
  customKpis,
  hasLowResolution,
  itemsForTab,
  nameCell,
  slaOverdue,
  tabCounts,
  type CustomItem,
  type CustomStatus,
  type NewImageReason,
  type RefundScope,
} from './data/custom-item';
import { CustomItemsRepository, type ReviewRequest } from './data/custom-items.repository';
import { CustomDetailComponent } from './ui/custom-detail.component';

const DEFAULT_CONFIG = customizationFromDoc(undefined);
const NO_SIDES: PhotoSides = { frente: null, costas: null };

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/** Loja › Personalizados: fila de arte (tela 10). */
@Component({
  selector: 'bo-panel-personalizados',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PanelCardComponent, IconComponent, PillComponent, ConfirmDialogComponent, CustomDetailComponent],
  template: `
    <bo-panel-shell>
      <header class="header">
        <div class="titles">
          <div class="subtitle">Loja</div>
          <div class="title-row">
            <h1>Personalizados</h1>
            @if (counts().aprovar > 0) {
              <bo-pill tone="orange">{{ counts().aprovar }} {{ counts().aprovar === 1 ? 'arte para aprovar' : 'artes para aprovar' }}</bo-pill>
            }
          </div>
        </div>
        <span class="spacer"></span>
        <button type="button" class="bo-mini-btn" [disabled]="loading() || batchBusy() || kpis().withoutBatch === 0" [title]="kpis().withoutBatch === 0 ? 'Nenhuma arte aprovada esperando lote' : ''" (click)="downloadBatch()">
          <bo-icon name="download" [size]="13" />
          {{ batchBusy() ? 'Gerando lote…' : 'Baixar lote p/ estamparia' }}
        </button>
      </header>

      <div class="body">
        @if (notice(); as text) {
          <div class="bo-feedback" role="status" aria-live="polite"><bo-icon name="check" [size]="15" /><span>{{ text }}</span></div>
        }
        @if (actionError(); as text) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ text }}</span></div>
        }

        <div class="kpis">
          <bo-panel-card pad="sm">
            <div class="k-label">Aprovar arte</div>
            <div class="k-value">{{ loading() ? '—' : kpis().toApprove }}</div>
            <div class="k-hint">SLA 4 h úteis</div>
          </bo-panel-card>
          <bo-panel-card pad="sm">
            <div class="k-label">Aguardando cliente</div>
            <div class="k-value">{{ loading() ? '—' : kpis().waitingCustomer }}</div>
            <div class="k-hint">nova imagem pedida</div>
          </bo-panel-card>
          <bo-panel-card pad="sm">
            <div class="k-label">Em produção</div>
            <div class="k-value">{{ loading() ? '—' : kpis().inProductionUnits + (kpis().inProductionUnits === 1 ? ' item' : ' itens') }}</div>
            <div class="k-hint">{{ productionHint() }}</div>
          </bo-panel-card>
          <bo-panel-card pad="sm">
            <div class="k-label">Prazo médio</div>
            <div class="k-value" [class.dim]="kpis().avgDays === null">{{ avgLabel() }}</div>
            <div class="k-hint">
              @if (kpis().avgDeltaDays !== null) {
                <span [class.good]="kpis().avgDeltaDays! <= 0" [class.bad]="kpis().avgDeltaDays! > 0">{{ deltaLabel() }}</span>
              }
              aprovação → pronto
            </div>
          </bo-panel-card>
        </div>

        <div class="tabs" role="tablist" aria-label="Situação">
          @for (s of statuses; track s) {
            <button type="button" role="tab" [attr.aria-selected]="tab() === s" [class.active]="tab() === s" (click)="setTab(s)">
              {{ statusInfo[s].tab }} <span class="tab-count">{{ counts()[s] }}</span>
            </button>
          }
        </div>

        <div class="grid">
          <bo-panel-card pad="sm">
            @if (loading()) {
              @for (slot of [0, 1, 2, 3]; track slot) { <div class="skeleton-row"></div> }
            } @else if (loadError(); as err) {
              <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
              <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
            } @else if (rows().length === 0) {
              <div class="empty"><bo-icon name="edit" [size]="20" /><p>{{ statusInfo[tab()].empty }}</p></div>
            } @else {
              <div class="table-head">
                <span>Pedido</span><span>Cliente · item</span><span>Nome</span><span>Imagem</span><span>Status</span>
              </div>
              @for (it of rows(); track it.id) {
                <button type="button" class="row" [class.selected]="selected()?.id === it.id" [attr.aria-pressed]="selected()?.id === it.id" (click)="select(it.id)">
                  <span class="code">
                    @if (overdue(it)) { <span class="sla" title="SLA estourado" aria-label="SLA estourado"></span> }
                    #{{ it.orderCode }}
                  </span>
                  <span class="who">
                    <span class="name">{{ it.customerName }}</span>
                    <span class="sub">{{ it.productName }} · {{ it.variantLabel }} · {{ stamp(it.createdAt) }}</span>
                  </span>
                  <span class="custom-name">{{ nameCell(it) }}</span>
                  <span>
                    @if (it.image) {
                      <span class="thumb">@if (it.image.url) { <img [src]="it.image.url" alt="" loading="lazy" /> }</span>
                    } @else { <span class="dim">—</span> }
                  </span>
                  <span><bo-pill [tone]="statusInfo[it.status].tone">{{ statusInfo[it.status].label }}</bo-pill></span>
                </button>
              }
            }
          </bo-panel-card>

          @if (selected(); as it) {
            <bo-custom-detail
              [item]="it"
              [config]="configOf(it)"
              [sides]="sides().get(it.productId) ?? noSides"
              [blocklist]="blocklist()"
              [busy]="busyId() === it.id"
              (approve)="approve(it)"
              (requestImage)="openRequest()"
              (reject)="openReject()"
              (ready)="review(it, { action: 'pronto' }, 'Marcado como pronto')"
              (download)="downloadFiles(it)"
            />
          } @else {
            <div class="placeholder">Selecione um item</div>
          }
        </div>
      </div>

      <!-- Pedir nova imagem -->
      <bo-confirm-dialog
        [open]="requestOpen()"
        title="Pedir nova imagem"
        description="O item volta para o cliente reenviar. Ele vê o motivo escolhido."
        confirmLabel="Pedir nova imagem"
        [busy]="dialogBusy()"
        [error]="dialogError()"
        [confirmDisabled]="requestReason() === 'outro' && !requestNote().trim()"
        (confirmed)="confirmRequest()"
        (dismissed)="requestOpen.set(false)"
      >
        <div class="radios" role="radiogroup" aria-label="Motivo">
          @for (r of reasons; track r.id) {
            <label><input type="radio" name="reason" [checked]="requestReason() === r.id" (change)="requestReason.set(r.id)" /> {{ r.label }}</label>
          }
        </div>
        <textarea class="bo-input note" rows="3" maxlength="300" [placeholder]="requestReason() === 'outro' ? 'Explique o motivo (obrigatório)' : 'Observação (opcional)'" [value]="requestNote()" (input)="requestNote.set(text($event))"></textarea>
      </bo-confirm-dialog>

      <!-- Reprovar -->
      <bo-confirm-dialog
        [open]="rejectOpen()"
        title="Reprovar e reembolsar"
        description="O item é cancelado. O reembolso fica registrado como pendente até a Loja ter o estorno automático."
        confirmLabel="Reprovar"
        tone="danger"
        [busy]="dialogBusy()"
        [error]="dialogError()"
        (confirmed)="confirmReject()"
        (dismissed)="rejectOpen.set(false)"
      >
        <div class="radios" role="radiogroup" aria-label="O que reembolsar">
          <label><input type="radio" name="scope" [checked]="refundScope() === 'personalizacao'" (change)="refundScope.set('personalizacao')" /> Só o valor da personalização</label>
          <label><input type="radio" name="scope" [checked]="refundScope() === 'item'" (change)="refundScope.set('item')" /> O item inteiro</label>
        </div>
      </bo-confirm-dialog>

      <!-- Aprovar com resolução abaixo do mínimo -->
      <bo-confirm-dialog
        [open]="lowResOpen()"
        title="Aprovar mesmo assim?"
        description="Uma imagem (frente ou costas) está abaixo da resolução mínima do produto e pode sair borrada na estampa."
        confirmLabel="Aprovar e produzir"
        [busy]="dialogBusy()"
        [error]="dialogError()"
        (confirmed)="confirmLowRes()"
        (dismissed)="lowResOpen.set(false)"
      />
    </bo-panel-shell>
  `,
  styles: `
    .header { display: flex; align-items: center; gap: 16px; padding: 20px 32px; border-bottom: 1px solid var(--nx-line); }
    .titles { display: flex; flex-direction: column; gap: 3px; }
    .subtitle { font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .title-row { display: flex; align-items: center; gap: 12px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; color: var(--nx-text); }
    .spacer { flex: 1; }
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    @media (max-width: 960px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .k-label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); margin-bottom: 10px; }
    .k-value { font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.03em; line-height: 1; color: var(--nx-text); margin-bottom: 8px; }
    .k-value.dim { color: var(--nx-text-dim); }
    .k-hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .good { color: var(--nx-win); font-weight: 600; }
    .bad { color: var(--nx-live); font-weight: 600; }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--nx-line); overflow-x: auto; }
    .tabs button { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; cursor: pointer; }
    .tabs button:hover { color: var(--nx-text); }
    .tabs button.active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); }
    .tab-count { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); }
    .tabs button.active .tab-count { color: var(--nx-orange-500); }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 470px; gap: 16px; align-items: start; }
    @media (max-width: 1200px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .table-head, .row { display: grid; grid-template-columns: 96px minmax(150px, 1.6fr) minmax(70px, 0.8fr) 56px 120px; gap: 10px; align-items: center; padding: 0 12px; }
    .table-head { padding-bottom: 9px; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .row { width: 100%; min-height: 58px; border: none; border-top: 1px solid var(--nx-line); background: transparent; text-align: left; cursor: pointer; color: inherit; font: inherit; border-radius: var(--nx-r-2); }
    .row:hover { background: var(--nx-surface-1); }
    .row.selected { background: var(--nx-orange-tint); }
    .code { display: flex; align-items: center; gap: 6px; font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text); }
    .sla { width: 7px; height: 7px; border-radius: 50%; background: var(--nx-live); box-shadow: 0 0 0 3px rgba(255, 59, 48, 0.2); }
    .who { display: flex; flex-direction: column; min-width: 0; }
    .who .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .who .sub { font-size: 11.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .custom-name { font-family: var(--nx-font-display); font-weight: 800; font-size: 13px; color: var(--nx-text); }
    .thumb { display: block; width: 30px; height: 30px; border-radius: 6px; overflow: hidden; background: repeating-linear-gradient(135deg, rgba(255, 106, 26, 0.35) 0 4px, rgba(255, 106, 26, 0.12) 4px 8px); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .dim { color: var(--nx-text-dim); }
    .placeholder { display: grid; place-items: center; min-height: 240px; border: 1px dashed var(--nx-line-strong); border-radius: var(--nx-r-4); color: var(--nx-text-dim); font-size: 13px; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 0; color: var(--nx-text-dim); }
    .empty p { margin: 0; font-size: 13px; }
    .skeleton-row { height: 58px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); opacity: 0.6; }
    .retry { margin-top: 12px; }
    .radios { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; font-size: 13px; color: var(--nx-text); }
    .radios label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .note { height: auto; padding: 10px 13px; resize: vertical; }
  `,
})
export class PanelPersonalizadosComponent {
  private readonly repository = inject(CustomItemsRepository);
  private readonly badges = inject(StoreBadgesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly statuses = STATUS_ORDER;
  protected readonly statusInfo = STATUS_INFO;
  protected readonly reasons = (Object.keys(REASON_LABELS) as NewImageReason[]).map((id) => ({ id, label: REASON_LABELS[id] }));
  protected readonly nameCell = nameCell;
  protected readonly noSides = NO_SIDES;

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly items = signal<CustomItem[]>([]);
  private readonly configs = signal<Map<string, CustomizationConfig>>(new Map());
  protected readonly sides = signal<Map<string, PhotoSides>>(new Map());
  protected readonly blocklist = signal<string[]>([]);
  protected readonly now = signal(new Date());

  protected readonly tab = signal<CustomStatus>(this.tabFromUrl());
  private readonly selectedId = signal<string | null>(null);

  protected readonly notice = signal('');
  protected readonly actionError = signal('');
  protected readonly busyId = signal<string | null>(null);
  protected readonly batchBusy = signal(false);

  protected readonly requestOpen = signal(false);
  protected readonly requestReason = signal<NewImageReason>('baixa_resolucao');
  protected readonly requestNote = signal('');
  protected readonly rejectOpen = signal(false);
  protected readonly refundScope = signal<RefundScope>('personalizacao');
  protected readonly lowResOpen = signal(false);
  protected readonly dialogBusy = signal(false);
  protected readonly dialogError = signal<string | null>(null);

  protected readonly counts = computed(() => tabCounts(this.items()));
  protected readonly kpis = computed(() => customKpis(this.items(), this.now()));
  protected readonly rows = computed(() => itemsForTab(this.items(), this.tab()));
  /** Sem seleção explícita, abre o primeiro da aba: na aba "Aprovar arte" é o de SLA mais apertado. */
  protected readonly selected = computed<CustomItem | null>(() => {
    const rows = this.rows();
    return rows.find((r) => r.id === this.selectedId()) ?? rows[0] ?? null;
  });

  protected readonly productionHint = computed(() => {
    const shops = new Set(
      this.items().filter((i) => i.status === 'producao').map((i) => this.configOf(i).production.printShop).filter(Boolean),
    );
    const shop = shops.size === 1 ? [...shops][0]! : 'Estamparia';
    const pending = this.kpis().withoutBatch;
    return `${shop} · ${pending === 0 ? 'tudo em lote' : `${pending} sem lote`}`;
  });

  protected readonly avgLabel = computed(() => {
    const d = this.kpis().avgDays;
    return d === null ? '—' : `${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
  });

  protected readonly deltaLabel = computed(() => {
    const d = this.kpis().avgDeltaDays ?? 0;
    return `${d <= 0 ? '▼' : '▲'} ${Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`;
  });

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const snap = await this.repository.load();
      this.items.set(snap.items);
      this.configs.set(snap.configs);
      this.sides.set(snap.sides);
      this.blocklist.set(snap.blocklist);
      this.now.set(new Date());
      this.badges.setCustom(tabCounts(snap.items).aprovar);
    } catch (error) {
      this.loadError.set(errorText(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected configOf(item: CustomItem): CustomizationConfig {
    return this.configs().get(item.productId) ?? DEFAULT_CONFIG;
  }

  protected overdue(item: CustomItem): boolean {
    return slaOverdue(item, this.now());
  }

  protected stamp(date: Date | null): string {
    return relativeStamp(date, this.now());
  }

  private tabFromUrl(): CustomStatus {
    const raw = this.route.snapshot.queryParamMap.get('aba');
    return (STATUS_ORDER as string[]).includes(raw ?? '') ? (raw as CustomStatus) : 'aprovar';
  }

  protected setTab(tab: CustomStatus): void {
    this.tab.set(tab);
    this.selectedId.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { aba: tab === 'aprovar' ? null : tab }, replaceUrl: true });
  }

  protected select(id: string): void {
    this.selectedId.set(id);
  }

  // ── Decisões ──
  protected approve(item: CustomItem): void {
    const lowRes = hasLowResolution(item, this.configOf(item));
    if (lowRes) {
      this.dialogError.set(null);
      this.lowResOpen.set(true);
      return;
    }
    void this.review(item, { action: 'aprovar' }, 'Arte aprovada: vai para produção');
  }

  protected async confirmLowRes(): Promise<void> {
    const item = this.selected();
    if (item && (await this.review(item, { action: 'aprovar' }, 'Arte aprovada: vai para produção', true))) {
      this.lowResOpen.set(false);
    }
  }

  protected openRequest(): void {
    this.requestReason.set('baixa_resolucao');
    this.requestNote.set('');
    this.dialogError.set(null);
    this.requestOpen.set(true);
  }

  protected async confirmRequest(): Promise<void> {
    const item = this.selected();
    const request: ReviewRequest = { action: 'nova_imagem', reason: this.requestReason(), note: this.requestNote().trim() };
    if (item && (await this.review(item, request, 'Nova imagem pedida ao cliente', true))) {
      this.requestOpen.set(false);
    }
  }

  protected openReject(): void {
    this.refundScope.set('personalizacao');
    this.dialogError.set(null);
    this.rejectOpen.set(true);
  }

  protected async confirmReject(): Promise<void> {
    const item = this.selected();
    if (item && (await this.review(item, { action: 'reprovar', refundScope: this.refundScope() }, 'Item reprovado', true))) {
      this.rejectOpen.set(false);
    }
  }

  /** Chama o servidor e recarrega a fila: outro admin pode ter mexido no mesmo item. */
  protected async review(item: CustomItem, request: ReviewRequest, done: string, inDialog = false): Promise<boolean> {
    this.actionError.set('');
    this.dialogError.set(null);
    this.busyId.set(item.id);
    this.dialogBusy.set(inDialog);
    try {
      await this.repository.review(item, request);
      // O próximo da aba vira o selecionado: é o fluxo de quem está zerando a fila.
      this.selectedId.set(null);
      await this.reload();
      this.showNotice(done);
      return true;
    } catch (error) {
      const text = errorText(error);
      if (inDialog) {
        this.dialogError.set(text);
      } else {
        this.actionError.set(text);
      }
      return false;
    } finally {
      this.busyId.set(null);
      this.dialogBusy.set(false);
    }
  }

  // ── Lote e arquivos ──
  protected async downloadBatch(): Promise<void> {
    this.batchBusy.set(true);
    this.actionError.set('');
    try {
      const { itemIds } = await this.repository.createBatch();
      const byId = new Map(this.items().map((i) => [i.id, i]));
      const rows = itemIds
        .map((id) => byId.get(id))
        .filter((i): i is CustomItem => i !== undefined)
        .map((item) => {
          const area = this.configOf(item).image.areas.find((a) => a.id === item.imageArea);
          return { item, areaLabel: area ? `${area.name} ${area.widthCm}×${area.heightCm} cm` : '' };
        });
      this.saveFile(batchCsv(rows), `lote-estamparia-${new Date().toISOString().slice(0, 10)}.csv`);
      await this.reload();
      this.showNotice(`Lote com ${itemIds.length} ${itemIds.length === 1 ? 'item' : 'itens'} gerado`);
    } catch (error) {
      this.actionError.set(errorText(error));
    } finally {
      this.batchBusy.set(false);
    }
  }

  protected downloadFiles(item: CustomItem): void {
    for (const f of item.finalFiles) {
      if (f.url) {
        window.open(f.url, '_blank', 'noopener');
      }
    }
  }

  private saveFile(content: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3500);
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
