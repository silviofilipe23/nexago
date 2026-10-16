import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { KpiCardComponent } from '../../ui/kpi-card.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../../ui/pill.component';
import { ToggleComponent } from '../../ui/toggle.component';
import {
  couponStatus,
  discountLabel,
  ruleLabel,
  todaySaoPaulo,
  usageRatio,
  validityLabel,
  type AutoDiscount,
  type AutoDiscountId,
  type Coupon,
  type CouponStatus,
} from './data/coupon';
import { CouponsRepository } from './data/coupons.repository';
import { CouponPanelComponent, type CouponPanelMode } from './ui/coupon-panel.component';

interface CouponRow {
  coupon: Coupon;
  status: CouponStatus;
  discount: string;
  rule: string;
  validity: string;
  ratio: number | null;
  usage: string;
}

const STATUS: Record<CouponStatus, { label: string; tone: PillTone }> = {
  ativo: { label: 'Ativo', tone: 'green' },
  agendado: { label: 'Agendado', tone: 'yellow' },
  encerrado: { label: 'Encerrado', tone: 'dim' },
  pausado: { label: 'Pausado', tone: 'dim' },
};

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/** Loja › Cupons & promoções. */
@Component({
  selector: 'bo-panel-cupons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menuOpenId.set(null)', '(document:keydown.escape)': 'onEscape()' },
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiCardComponent,
    IconComponent,
    PillComponent,
    ToggleComponent,
    ConfirmDialogComponent,
    CouponPanelComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Cupons & promoções" subtitle="Loja">
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="openPanel({ kind: 'new' })">
          <bo-icon name="plus" [size]="13" />
          Novo cupom
        </button>
      </bo-page-header>

      <div class="body" [class.with-panel]="panel() !== null">
        <div class="main">
          @if (notice(); as text) {
            <div class="bo-feedback" role="status" aria-live="polite">
              <bo-icon name="check" [size]="15" />
              <span>{{ text }}</span>
            </div>
          }
          @if (actionError(); as text) {
            <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ text }}</span></div>
          }

          <!-- A Loja ainda não tem pedidos: os indicadores mostram "sem dados" em vez de inventar números. -->
          <div class="kpis">
            <bo-kpi-card label="Pedidos com cupom" value="—" [empty]="true" />
            <bo-kpi-card label="Desconto concedido" value="—" [empty]="true" />
            <bo-kpi-card label="Receita via cupom" value="—" [empty]="true" />
          </div>

          <bo-panel-card pad="sm">
            @if (loading()) {
              @for (slot of [0, 1, 2, 3]; track slot) {
                <div class="skeleton-row"></div>
              }
            } @else if (loadError(); as err) {
              <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
              <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
            } @else if (rows().length === 0) {
              <div class="empty">
                <bo-icon name="ticket" [size]="20" />
                <p>Nenhum cupom ainda</p>
                <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="openPanel({ kind: 'new' })">
                  <bo-icon name="plus" [size]="13" />
                  Criar primeiro cupom
                </button>
              </div>
            } @else {
              <div class="table" role="table" aria-label="Cupons">
                <div class="table-head" role="row">
                  <span role="columnheader">Código</span><span role="columnheader">Desconto</span>
                  <span role="columnheader">Regra</span><span role="columnheader">Uso</span>
                  <span role="columnheader">Validade</span><span role="columnheader">Status</span><span></span>
                </div>
                @for (r of rows(); track r.coupon.id) {
                  <div
                    class="row"
                    role="row"
                    [class.selected]="selectedId() === r.coupon.id"
                    (click)="openPanel({ kind: 'edit', coupon: r.coupon })"
                  >
                    <span class="code" role="cell">
                      <bo-icon name="ticket" [size]="14" />
                      <button type="button" class="code-btn" (click)="$event.stopPropagation(); openPanel({ kind: 'edit', coupon: r.coupon })">
                        {{ r.coupon.code }}
                      </button>
                    </span>
                    <span class="discount" role="cell">{{ r.discount }}</span>
                    <span class="rule" role="cell">{{ r.rule }}</span>
                    <span class="usage" role="cell">
                      <span>{{ r.usage }}</span>
                      @if (r.ratio !== null) {
                        <span class="bar" aria-hidden="true"><span [style.width.%]="r.ratio * 100"></span></span>
                      }
                    </span>
                    <span class="muted" role="cell">{{ r.validity }}</span>
                    <span role="cell"><bo-pill [tone]="statusOf(r.status).tone">{{ statusOf(r.status).label }}</bo-pill></span>
                    <span class="menu-wrap" role="cell">
                      <button
                        type="button"
                        class="more"
                        [attr.aria-label]="'Ações de ' + r.coupon.code"
                        aria-haspopup="menu"
                        [attr.aria-expanded]="menuOpenId() === r.coupon.id"
                        (click)="toggleMenu($event, r.coupon.id)"
                      >
                        ⋯
                      </button>
                      @if (menuOpenId() === r.coupon.id) {
                        <div class="menu" role="menu" (click)="$event.stopPropagation()">
                          <button type="button" role="menuitem" (click)="openPanel({ kind: 'edit', coupon: r.coupon })">Editar</button>
                          <button type="button" role="menuitem" (click)="openPanel({ kind: 'duplicate', coupon: r.coupon })">Duplicar</button>
                          @if (r.status !== 'encerrado') {
                            <button type="button" role="menuitem" (click)="setPaused(r.coupon, !r.coupon.paused)">
                              {{ r.coupon.paused ? 'Reativar' : 'Pausar' }}
                            </button>
                          }
                          <button type="button" role="menuitem" disabled title="Em breve">Ver pedidos</button>
                          @if (!r.coupon.ended) {
                            <button type="button" role="menuitem" class="danger" (click)="askEnd(r.coupon)">Encerrar</button>
                          }
                        </div>
                      }
                    </span>
                  </div>
                }
              </div>
            }
          </bo-panel-card>

          <bo-panel-card kicker="Aplicados sem cupom" title="Descontos automáticos">
            @for (d of discounts(); track d.id) {
              <div class="auto">
                <div>
                  <div class="name">{{ d.name }}</div>
                  <div class="sub">{{ d.description }}</div>
                </div>
                <bo-toggle
                  [ariaLabel]="'Ativar ' + d.name"
                  [checked]="d.active"
                  [disabled]="loading() || busyIds().has(d.id)"
                  (checkedChange)="setAutoDiscount(d.id, $event)"
                />
              </div>
            }
          </bo-panel-card>
        </div>

        @for (p of panelList(); track p.key) {
          <bo-coupon-panel
            class="side"
            [mode]="p.mode"
            [today]="today"
            (closed)="closePanel()"
            (saved)="onSaved(p.mode)"
          />
        }
      </div>

      @if (ending(); as c) {
        <bo-confirm-dialog
          [open]="true"
          [title]="'Encerrar ' + c.code + '?'"
          description="O cupom deixa de valer agora. Pedidos já feitos com ele não mudam, e o código não pode ser reaproveitado."
          confirmLabel="Encerrar cupom"
          tone="danger"
          [busy]="endBusy()"
          [error]="endError()"
          (confirmed)="confirmEnd(c)"
          (dismissed)="ending.set(null)"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 20px 32px 40px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; min-width: 0; }
    .body.with-panel { grid-template-columns: minmax(0, 1fr) 380px; }
    @media (max-width: 1180px) { .body.with-panel { grid-template-columns: minmax(0, 1fr); } }
    .main { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .kpis { display: flex; gap: 14px; }
    @media (max-width: 760px) { .kpis { flex-direction: column; } }

    .table-head, .row { display: grid; grid-template-columns: minmax(130px, 1.2fr) 86px minmax(130px, 1.4fr) minmax(110px, 1fr) 96px 104px 34px; gap: 10px; align-items: center; padding: 0 14px; }
    .table-head { padding-bottom: 9px; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .row { min-height: 56px; border-top: 1px solid var(--nx-line); cursor: pointer; border-radius: var(--nx-r-2); }
    .row:hover, .row.selected { background: var(--nx-surface-1); }
    .code { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--nx-orange-500); }
    .code-btn { border: none; background: transparent; padding: 0; color: var(--nx-text); font-family: var(--nx-font-mono); font-size: 12px; font-weight: 600; letter-spacing: 0.04em; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .discount { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-text); white-space: nowrap; }
    .rule { font-size: 12px; line-height: 1.35; color: var(--nx-text-mute); }
    .usage { display: flex; flex-direction: column; gap: 6px; font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text); }
    .bar { display: block; height: 4px; border-radius: var(--nx-r-pill); background: var(--nx-surface-2); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--nx-orange-500); }
    .muted { font-size: 12px; color: var(--nx-text-mute); }

    .menu-wrap { position: relative; }
    .more { width: 28px; height: 28px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; font-size: 16px; line-height: 1; }
    .more:hover { background: var(--nx-surface-2); color: var(--nx-text); }
    .menu { position: absolute; right: 0; top: 32px; z-index: 5; min-width: 170px; padding: 4px; display: flex; flex-direction: column; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); cursor: default; }
    .menu button { text-align: left; padding: 8px 10px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text); font-family: var(--nx-font-display); font-size: 12.5px; cursor: pointer; }
    .menu button:hover:not(:disabled) { background: var(--nx-surface-2); }
    .menu button:disabled { opacity: 0.5; cursor: default; }
    .menu button.danger { color: var(--nx-live); }

    .auto { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; border-top: 1px solid var(--nx-line); }
    .auto:first-of-type { border-top: none; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .sub { font-size: 11.5px; color: var(--nx-text-dim); }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 0; color: var(--nx-text-dim); }
    .empty p { margin: 0; font-size: 13px; }
    .skeleton-row { height: 56px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); opacity: 0.6; }
    .retry { margin-top: 12px; align-self: flex-start; }
    .side { min-width: 0; }
  `,
})
export class PanelCuponsComponent {
  private readonly repository = inject(CouponsRepository);

  protected readonly today = todaySaoPaulo();
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly coupons = signal<Coupon[]>([]);
  protected readonly discounts = signal<AutoDiscount[]>([]);
  protected readonly notice = signal('');
  protected readonly actionError = signal('');
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly busyIds = signal<ReadonlySet<string>>(new Set());

  protected readonly panel = signal<{ key: number; mode: CouponPanelMode } | null>(null);
  /** Lista de um item só: o `track` pela chave recria o painel a cada abertura. */
  protected readonly panelList = computed(() => {
    const p = this.panel();
    return p ? [p] : [];
  });
  protected readonly selectedId = computed(() => {
    const m = this.panel()?.mode;
    return m?.kind === 'edit' ? m.coupon.id : null;
  });

  protected readonly ending = signal<Coupon | null>(null);
  protected readonly endBusy = signal(false);
  protected readonly endError = signal<string | null>(null);

  protected readonly rows = computed<CouponRow[]>(() =>
    this.coupons().map((c) => ({
      coupon: c,
      status: couponStatus(c, this.today),
      discount: discountLabel(c),
      rule: ruleLabel(c),
      validity: validityLabel(c, this.today),
      ratio: usageRatio(c),
      usage: c.usageLimit === null ? String(c.uses) : `${c.uses} / ${c.usageLimit}`,
    })),
  );

  private panelKey = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const data = await this.repository.load();
      this.coupons.set(data.coupons);
      this.discounts.set(data.discounts);
    } catch (error) {
      this.loadError.set(errorText(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusOf(status: CouponStatus): { label: string; tone: PillTone } {
    return STATUS[status];
  }

  protected openPanel(mode: CouponPanelMode): void {
    this.menuOpenId.set(null);
    this.panel.set({ key: ++this.panelKey, mode });
  }

  protected closePanel(): void {
    this.panel.set(null);
  }

  protected onEscape(): void {
    if (this.menuOpenId()) {
      this.menuOpenId.set(null);
    } else if (!this.ending()) {
      this.closePanel();
    }
  }

  protected async onSaved(mode: CouponPanelMode): Promise<void> {
    this.closePanel();
    this.showNotice(mode.kind === 'edit' ? 'Cupom salvo' : 'Cupom criado');
    await this.reload();
  }

  protected toggleMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.menuOpenId.update((current) => (current === id ? null : id));
  }

  protected async setPaused(c: Coupon, paused: boolean): Promise<void> {
    this.menuOpenId.set(null);
    this.actionError.set('');
    const set = (value: boolean) =>
      this.coupons.update((rows) => rows.map((r) => (r.id === c.id ? { ...r, paused: value } : r)));
    set(paused);
    try {
      await this.repository.setPaused(c.id, paused);
      this.showNotice(paused ? `${c.code} pausado` : `${c.code} reativado`);
    } catch (error) {
      set(!paused);
      this.actionError.set(errorText(error));
    }
  }

  protected askEnd(c: Coupon): void {
    this.menuOpenId.set(null);
    this.endError.set(null);
    this.ending.set(c);
  }

  protected async confirmEnd(c: Coupon): Promise<void> {
    this.endBusy.set(true);
    this.endError.set(null);
    try {
      await this.repository.end(c.id);
      this.coupons.update((rows) => rows.map((r) => (r.id === c.id ? { ...r, ended: true } : r)));
      this.ending.set(null);
      this.showNotice(`${c.code} encerrado`);
    } catch (error) {
      this.endError.set(errorText(error));
    } finally {
      this.endBusy.set(false);
    }
  }

  /** Mostra o novo estado na hora e desfaz se o servidor recusar. */
  protected async setAutoDiscount(id: AutoDiscountId, active: boolean): Promise<void> {
    this.actionError.set('');
    const set = (value: boolean) =>
      this.discounts.update((rows) => rows.map((d) => (d.id === id ? { ...d, active: value } : d)));
    this.busyIds.update((ids) => new Set(ids).add(id));
    set(active);
    try {
      await this.repository.setAutoDiscountActive(id, active);
    } catch (error) {
      set(!active);
      this.actionError.set(errorText(error));
    } finally {
      this.busyIds.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3000);
  }
}
