import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  COUPON_STATUS_LABEL,
  deriveCouponStatus,
  formatCouponDiscount,
  formatCouponUsage,
  formatCouponValidity,
  type ArenaCoupon,
  type CouponDisplayStatus,
} from './coupon.model';
import { deactivateArenaCoupon, listArenaCoupons } from './coupons-repository';

type StatusFilter = 'todos' | CouponDisplayStatus;

const STATUS_TONE: Record<CouponDisplayStatus, PillTone> = {
  ativo: 'green',
  agendado: 'yellow',
  expirado: 'dim',
  inativo: 'dim',
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativo', label: 'Ativos' },
  { key: 'agendado', label: 'Agendados' },
  { key: 'expirado', label: 'Expirados' },
  { key: 'inativo', label: 'Desativados' },
];

/** Tela Cupons do painel: lista `arenas/{arenaId}/coupons` via callable (`listArenaCoupons`).
 *  Qualquer cupom pode ser editado (o código não muda); desativado volta a valer ao reativar na edição. */
@Component({
  selector: 'ar-panel-coupons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Cupons" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="createCoupon()">
          <ar-icon name="plus" [size]="14" />
          Novo cupom
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando cupons…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else {
          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Cupons ativos</div>
              <div class="summary-value">{{ activeCount() }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Resgates totais</div>
              <div class="summary-value">{{ totalRedemptions() }}</div>
            </ar-panel-card>
          </div>

          <ar-panel-card [kicker]="listKicker()" title="Cupons" class="table-card">
            <div class="ar-filter-bar" card-actions>
              @for (f of statusFilters; track f.key) {
                <button type="button" class="ar-chip" [class.active]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
              }
            </div>

            <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Tabela de cupons">
              <div class="ar-table-inner">
                <div class="table-head">
                  <span>Código</span>
                  <span>Desconto</span>
                  <span>Validade</span>
                  <span>Usos</span>
                  <span>Status</span>
                  <span></span>
                </div>
                <div class="table-list">
                  @for (row of filteredCoupons(); track row.coupon.id) {
                    <div class="table-row">
                      <div class="coupon-code">{{ row.coupon.code }}</div>
                      <div class="coupon-discount"><span class="col-label">Desconto</span>{{ formatCouponDiscount(row.coupon) }}</div>
                      <div class="coupon-validity"><span class="col-label">Validade</span>{{ formatCouponValidity(row.coupon) }}</div>
                      <div class="coupon-usage"><span class="col-label">Usos</span>{{ formatCouponUsage(row.coupon) }}</div>
                      <div class="coupon-status"><ar-pill [tone]="statusTone[row.status]">{{ statusLabel[row.status] }}</ar-pill></div>
                      <div class="coupon-actions">
                        <button type="button" class="ar-mini-btn" (click)="editCoupon(row.coupon)">
                          <ar-icon name="edit" [size]="13" />
                          Editar
                        </button>
                        @if (row.coupon.active) {
                          <button type="button" class="ar-mini-btn" (click)="askDeactivate(row.coupon)">
                            <ar-icon name="alert-triangle" [size]="13" />
                            Desativar
                          </button>
                        }
                      </div>
                    </div>
                  } @empty {
                    <p class="state-text empty-text">Nenhum cupom criado ainda.</p>
                  }
                </div>
              </div>
            </div>
          </ar-panel-card>
        }
      </div>

      @if (couponToDeactivate(); as coupon) {
        <ar-modal (close)="couponToDeactivate.set(null)">
          <h2 class="confirm-title">Desativar cupom {{ coupon.code }}?</h2>
          <p class="confirm-body">
            Clientes não vão conseguir mais aplicar este código. Para voltar a usá-lo, reative pela edição do cupom.
          </p>
          @if (deactivateError(); as err) {
            <p class="confirm-error">{{ err }}</p>
          }
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="deactivating()" (click)="couponToDeactivate.set(null)">Cancelar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="deactivating()" (click)="confirmDeactivate()">
              {{ deactivating() ? 'Desativando…' : 'Desativar cupom' }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    @use 'breakpoints' as ar;

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;

      @include ar.below(sm) {
        padding: 16px var(--ar-pad-page-x) 24px;
      }
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .empty-text {
      margin: 12px 0;
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
      max-width: 240px;
      min-width: 0;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1fr 110px 200px 130px 110px 200px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;

      @include ar.below(sm) {
        display: none;
      }
    }

    /* Celular: cada cupom vira cartão empilhado (Editar/Desativar ficavam no fim
       da rolagem horizontal). Desliga o max-content do .ar-table-scroll. */
    .ar-table-inner {
      @include ar.below(sm) {
        min-width: 0;
      }
    }

    .col-label {
      display: none;

      @include ar.below(sm) {
        display: block;
        font-family: var(--nx-font-mono);
        font-size: 9px;
        font-weight: 500;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--nx-text-dim);
      }
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

    .table-row {
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);

      @include ar.below(sm) {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-areas:
          'code status'
          'discount usage'
          'validity validity'
          'actions actions';
        gap: 8px 12px;

        .coupon-code { grid-area: code; min-width: 0; overflow-wrap: anywhere; }
        .coupon-status { grid-area: status; justify-self: end; }
        .coupon-discount { grid-area: discount; }
        .coupon-usage { grid-area: usage; }
        .coupon-validity { grid-area: validity; }
        .coupon-actions { grid-area: actions; justify-content: flex-start; flex-wrap: wrap; }
      }
    }

    .coupon-actions .ar-mini-btn {
      @include ar.touch {
        height: 40px;
      }
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .coupon-code {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.04em;
      color: var(--nx-text);
    }

    .coupon-discount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-orange-500);
    }

    .coupon-validity,
    .coupon-usage {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .coupon-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .confirm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 22px;
    }

    .confirm-error {
      font-size: 12.5px;
      color: var(--nx-live);
      margin: -10px 0 18px;
    }

    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
      flex-wrap: wrap;
    }

    .danger-btn {
      height: 44px;
      padding: 0 20px;
      background: var(--nx-live);
      color: #fff;
      border: none;
    }

    .danger-btn:hover:not(:disabled) {
      background: #ff564c;
    }

    @include ar.below(lg) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelCouponsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  protected readonly formatCouponDiscount = formatCouponDiscount;
  protected readonly formatCouponValidity = formatCouponValidity;
  protected readonly formatCouponUsage = formatCouponUsage;
  protected readonly statusLabel = COUPON_STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly statusFilters = STATUS_FILTERS;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly coupons = signal<ArenaCoupon[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly filter = signal<StatusFilter>('todos');

  protected readonly couponToDeactivate = signal<ArenaCoupon | null>(null);
  protected readonly deactivating = signal(false);
  protected readonly deactivateError = signal<string | null>(null);

  protected readonly rows = computed(() => this.coupons().map((coupon) => ({ coupon, status: deriveCouponStatus(coupon) })));

  protected readonly filteredCoupons = computed(() => {
    const f = this.filter();
    return f === 'todos' ? this.rows() : this.rows().filter((r) => r.status === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredCoupons().length} de ${this.coupons().length}`);
  protected readonly activeCount = computed(() => this.rows().filter((r) => r.status === 'ativo').length);
  protected readonly totalRedemptions = computed(() => this.coupons().reduce((sum, c) => sum + c.redemptionsCount, 0));

  protected readonly headerSubtitle = computed(() => `${this.arenaContext.arenaName() ?? 'Arena'} · códigos de desconto`);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.coupons.set(await listArenaCoupons(arenaFunctions(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar os cupons.');
    } finally {
      this.loading.set(false);
    }
  }

  protected createCoupon(): void {
    this.router.navigate(['/painel/cupons/novo']);
  }

  protected editCoupon(coupon: ArenaCoupon): void {
    this.router.navigate(['/painel/cupons', coupon.id, 'editar']);
  }

  protected askDeactivate(coupon: ArenaCoupon): void {
    this.deactivateError.set(null);
    this.couponToDeactivate.set(coupon);
  }

  protected async confirmDeactivate(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const coupon = this.couponToDeactivate();
    if (!arenaId || !coupon) return;

    this.deactivating.set(true);
    this.deactivateError.set(null);
    try {
      await deactivateArenaCoupon(arenaFunctions(), arenaId, coupon.id);
      this.coupons.update((list) => list.map((c) => (c.id === coupon.id ? { ...c, active: false } : c)));
      this.couponToDeactivate.set(null);
    } catch (err) {
      this.deactivateError.set(err instanceof Error ? err.message : 'Não foi possível desativar o cupom.');
    } finally {
      this.deactivating.set(false);
    }
  }
}
