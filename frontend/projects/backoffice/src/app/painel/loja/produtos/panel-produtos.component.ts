import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { callableErrorMessage } from '../../data/callable-error';
import { CheckboxComponent, type CheckboxToggle } from '../../ui/checkbox.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import {
  EMPTY_CRITERIA,
  PRODUCT_TABS,
  criteriaFromParams,
  filterProducts,
  paramsFromCriteria,
  tabCounts,
  type ProductCriteria,
  type ProductTab,
} from './data/product-filters';
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_COLLECTIONS,
  ProductsRepository,
  type ProductCategory,
  type StoreProduct,
} from './data/products.repository';
import { ProductRowComponent } from './ui/product-row.component';

type LoadState = 'loading' | 'ok' | 'error';

/** Catálogo da loja nexaGO. Fase de desenho: lê dados de exemplo (ver o kicker do card). */
@Component({
  selector: 'bo-panel-produtos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  imports: [
    CheckboxComponent,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    ProductRowComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Produtos" subtitle="Loja">
        <span class="count-pill">{{ countLabel() }}</span>
        <div class="header-actions">
          <button type="button" class="bo-mini-btn" disabled title="Em breve">
            <bo-icon name="download" [size]="13" />
            Importar planilha
          </button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" disabled title="Em breve">
            <bo-icon name="plus" [size]="13" />
            Novo produto
          </button>
        </div>
      </bo-page-header>

      <div class="tabs">
        @for (tab of productTabs; track tab.id) {
          <button
            type="button"
            [class.active]="criteria().tab === tab.id"
            [attr.aria-pressed]="criteria().tab === tab.id"
            (click)="setTab(tab.id)"
          >
            {{ tab.label }}
            <span class="tab-count">{{ counts()[tab.id] }}</span>
          </button>
        }
      </div>

      <div class="bo-filter-bar">
        <div class="search">
          <bo-icon name="search" [size]="15" />
          <input
            type="search"
            class="search-input"
            placeholder="Nome, SKU ou código de barras"
            aria-label="Buscar produto"
            [value]="criteria().q"
            (input)="setSearch(value($event))"
          />
        </div>

        <select class="bo-select" aria-label="Categoria" (change)="setCategoryFromSelect(value($event))">
          <option value="" [selected]="criteria().category === null">Categoria</option>
          @for (category of categories; track category.id) {
            <option [value]="category.id" [selected]="criteria().category === category.id">
              {{ category.label }}
            </option>
          }
        </select>

        <select class="bo-select" aria-label="Canal" (change)="setChannel(value($event))">
          <option value="" [selected]="criteria().channel === null">Canal</option>
          @for (channel of channels; track channel.id) {
            <option [value]="channel.id" [selected]="criteria().channel === channel.id">
              {{ channel.label }}
            </option>
          }
        </select>

        <select class="bo-select" aria-label="Coleção" (change)="setCollection(value($event))">
          <option value="" [selected]="criteria().collection === null">Coleção</option>
          @for (collection of collections; track collection.id) {
            <option [value]="collection.id" [selected]="criteria().collection === collection.id">
              {{ collection.label }}
            </option>
          }
        </select>

        <div class="spacer"></div>

        @for (category of categories; track category.id) {
          <button
            type="button"
            class="bo-chip"
            [class.active]="criteria().category === category.id"
            [attr.aria-pressed]="criteria().category === category.id"
            (click)="toggleCategory(category.id)"
          >
            {{ category.label }}
          </button>
        }
      </div>

      <div class="body">
        @if (notice(); as text) {
          <div class="bo-feedback" role="status" aria-live="polite">
            <bo-icon name="check" [size]="15" />
            <span>{{ text }}</span>
          </div>
        }

        <bo-panel-card pad="sm" kicker="dados de exemplo" title="Catálogo">
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else if (state() === 'loading') {
            <div class="table-head">
              <span></span><span>Produto</span><span>Categoria</span><span>Variações</span>
              <span>Preço</span><span>Estoque</span><span>Vendas 30d</span><span>Canais</span>
              <span>Ativo</span><span></span>
            </div>
            @for (slot of skeleton; track slot) {
              <div class="skeleton-row"></div>
            }
          } @else if (rows().length === 0) {
            <div class="empty">
              <bo-icon name="archive" [size]="20" />
              @if (all().length === 0) {
                <p>Nenhum produto cadastrado</p>
              } @else {
                <p>Nenhum produto com esses filtros</p>
                <button type="button" class="bo-mini-btn" (click)="clearFilters()">
                  Limpar filtros
                </button>
              }
            </div>
          } @else {
            @if (selectedVisible().length > 0) {
              <div class="bulk-bar" role="status" aria-live="polite">
                <bo-checkbox
                  ariaLabel="Limpar a seleção"
                  [checked]="allSelected()"
                  [indeterminate]="someSelected()"
                  (checkedChange)="toggleAll()"
                />
                <strong>{{ selectionLabel() }}</strong>
                <button type="button" class="bo-mini-btn" disabled title="Em breve">Ativar</button>
                <button type="button" class="bo-mini-btn" disabled title="Em breve">Desativar</button>
                <button type="button" class="bo-mini-btn" disabled title="Em breve">Exportar</button>
                <div class="spacer"></div>
                <button type="button" class="bo-ghost-btn" (click)="clearSelection()">Limpar</button>
              </div>
            }

            <div class="table-head">
              <span class="select-all">
                <bo-checkbox
                  ariaLabel="Selecionar todos os produtos da página"
                  [checked]="allSelected()"
                  [indeterminate]="someSelected()"
                  (checkedChange)="toggleAll()"
                />
              </span>
              <span>Produto</span><span>Categoria</span><span>Variações</span>
              <span>Preço</span><span>Estoque</span><span>Vendas 30d</span><span>Canais</span>
              <span>Ativo</span><span></span>
            </div>
            @for (product of rows(); track product.id) {
              <bo-product-row
                [product]="product"
                [selected]="isSelected(product.id)"
                (selectedChange)="setSelected(product.id, $event)"
                (activeChange)="setActive(product.id, $event)"
              />
            }
          }
        </bo-panel-card>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .count-pill {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 5px 10px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      white-space: nowrap;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .search {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 11px;
      min-width: 280px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
      flex: none;
    }

    .search-input {
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-size: 12.5px;
      width: 100%;
    }

    .search-input::placeholder {
      color: var(--nx-text-dim);
    }

    .bo-filter-bar .spacer {
      flex: 1;
      min-width: 12px;
    }

    .tabs {
      display: flex;
      gap: 4px;
      padding: 10px 32px 0;
      border-bottom: 1px solid var(--nx-line);
      overflow-x: auto;
      flex: none;
    }

    .tabs button {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 36px;
      padding: 0 12px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    }

    .tabs button:hover {
      color: var(--nx-text);
    }

    .tabs button.active {
      color: var(--nx-orange-500);
      border-bottom-color: var(--nx-orange-500);
    }

    .tab-count {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .tabs button.active .tab-count {
      color: var(--nx-orange-500);
    }

    .body {
      padding: 20px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
    }

    .table-head {
      display: grid;
      grid-template-columns: 34px minmax(200px, 1.6fr) 120px 70px 110px 110px 70px 92px 54px 34px;
      gap: 10px;
      padding: 0 14px 9px;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .skeleton-row {
      height: 54px;
      border-top: 1px solid var(--nx-line);
      background: linear-gradient(
        90deg,
        var(--nx-surface-1) 25%,
        var(--nx-surface-2) 37%,
        var(--nx-surface-1) 63%
      );
      background-size: 400% 100%;
      animation: shimmer 1.3s ease-in-out infinite;
    }

    @keyframes shimmer {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: 0 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton-row {
        animation: none;
      }
    }

    .select-all {
      display: grid;
      place-items: center;
    }

    .bulk-bar {
      animation: bulk-in 150ms var(--nx-ease-out);
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding: 9px 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
    }

    .bulk-bar strong {
      font-family: var(--nx-font-display);
      font-size: 12.5px;
      color: var(--nx-orange-500);
      margin-right: 4px;
    }

    .bulk-bar .spacer {
      flex: 1;
    }

    @keyframes bulk-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bulk-bar {
        animation: none;
      }
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 44px 0;
      color: var(--nx-text-dim);
    }

    .empty p {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 13px;
    }

    .retry {
      margin-top: 12px;
    }
  `,
})
export class PanelProdutosComponent {
  private readonly repository = inject(ProductsRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly categories = (Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).map(
    (id) => ({ id, label: PRODUCT_CATEGORY_LABELS[id] }),
  );
  protected readonly channels = [
    { id: 'web', label: 'Web' },
    { id: 'app', label: 'App' },
  ] as const;
  protected readonly collections = PRODUCT_COLLECTIONS;

  protected readonly skeleton = [0, 1, 2, 3, 4, 5, 6, 7];

  protected readonly all = signal<StoreProduct[]>([]);
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');

  protected readonly productTabs = PRODUCT_TABS;
  protected readonly criteria = signal<ProductCriteria>(EMPTY_CRITERIA);

  protected readonly rows = computed(() => filterProducts(this.all(), this.criteria()));
  protected readonly counts = computed(() => tabCounts(this.all(), this.criteria()));

  protected readonly countLabel = computed(() => {
    const rows = this.all();
    const skus = rows.reduce((total, p) => total + p.variations, 0);
    return `${rows.length} produtos · ${skus} SKUs`;
  });

  constructor() {
    // Sem isto o debounce dispara depois da tela morrer e navega de volta para cá.
    this.destroyRef.onDestroy(() => {
      this.cancelSearchTimer();
      this.cancelNoticeTimer();
    });

    const params = this.route.snapshot.queryParamMap;
    const raw = Object.fromEntries(params.keys.map((k) => [k, params.get(k)]));
    this.criteria.set(criteriaFromParams(raw));
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    try {
      this.all.set(await this.repository.list());
      this.state.set('ok');
    } catch (error) {
      this.errorMessage.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  private readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  private rangeAnchorId: string | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly notice = signal('');

  /** Só conta quem está visível: o filtro pode ter tirado da tela uma linha marcada. */
  protected readonly selectedVisible = computed(() => {
    const ids = this.selectedIds();
    return this.rows().filter((p) => ids.has(p.id));
  });

  protected readonly selectionLabel = computed(() => {
    const n = this.selectedVisible().length;
    return n === 1 ? '1 selecionado' : `${n} selecionados`;
  });

  protected readonly allSelected = computed(
    () => this.rows().length > 0 && this.selectedVisible().length === this.rows().length,
  );

  /** Parcial: alguma linha marcada, mas não a página inteira. */
  protected readonly someSelected = computed(
    () => this.selectedVisible().length > 0 && !this.allSelected(),
  );

  protected isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  protected setSelected(id: string, toggle: CheckboxToggle): void {
    const rows = this.rows();
    const index = rows.findIndex((p) => p.id === id);
    const anchor = rows.findIndex((p) => p.id === this.rangeAnchorId);
    // Shift+clique aplica o novo estado ao intervalo inteiro desde o último clicado.
    const ids = toggle.shift && anchor >= 0 && index >= 0
      ? rows.slice(Math.min(anchor, index), Math.max(anchor, index) + 1).map((p) => p.id)
      : [id];

    this.selectedIds.update((current) => {
      const next = new Set(current);
      for (const each of ids) {
        if (toggle.checked) {
          next.add(each);
        } else {
          next.delete(each);
        }
      }
      return next;
    });
    this.rangeAnchorId = id;
  }

  protected onEscape(): void {
    if (this.selectedVisible().length > 0) {
      this.clearSelection();
    }
  }

  protected toggleAll(): void {
    this.selectedIds.set(this.allSelected() ? new Set() : new Set(this.rows().map((p) => p.id)));
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  /** Único ponto de escrita do critério, para a URL nunca discordar da tela. */
  private apply(next: ProductCriteria): void {
    // Um debounce pendente aplicaria um critério velho e limparia a seleção recém-feita.
    this.cancelSearchTimer();
    this.criteria.set(next);
    // A seleção some junto com as linhas; sem o aviso o usuário não entende para onde ela foi.
    if (this.selectedVisible().length > 0) {
      this.showNotice('Seleção limpa');
    }
    this.clearSelection();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: paramsFromCriteria(next),
      replaceUrl: true,
    });
  }

  protected setTab(tab: ProductTab): void {
    this.apply({ ...this.criteria(), tab });
  }

  protected clearFilters(): void {
    this.apply(EMPTY_CRITERIA);
  }

  protected setCategory(category: ProductCategory | null): void {
    this.apply({ ...this.criteria(), category });
  }

  protected toggleCategory(category: ProductCategory): void {
    this.setCategory(this.criteria().category === category ? null : category);
  }

  /** O `<select>` devolve string: valida contra a lista em vez de forçar o tipo. */
  protected setCategoryFromSelect(value: string): void {
    this.setCategory(this.categories.find((c) => c.id === value)?.id ?? null);
  }

  protected setChannel(value: string): void {
    const channel = this.channels.find((c) => c.id === value)?.id ?? null;
    this.apply({ ...this.criteria(), channel });
  }

  protected setCollection(value: string): void {
    this.apply({ ...this.criteria(), collection: value === '' ? null : value });
  }

  /** A busca filtra a cada tecla; só a URL espera, senão cada letra vira uma entrada no histórico. */
  protected setSearch(q: string): void {
    this.criteria.update((c) => ({ ...c, q }));
    this.cancelSearchTimer();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.apply(this.criteria());
    }, 300);
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    this.cancelNoticeTimer();
    this.noticeTimer = setTimeout(() => {
      this.noticeTimer = null;
      this.notice.set('');
    }, 3000);
  }

  private cancelNoticeTimer(): void {
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
  }

  private cancelSearchTimer(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setActive(id: string, active: boolean): void {
    this.all.update((rows) => rows.map((p) => (p.id === id ? { ...p, active } : p)));
  }
}
