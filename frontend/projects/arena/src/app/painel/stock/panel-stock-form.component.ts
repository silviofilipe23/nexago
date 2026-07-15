import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ARENA_PRODUCT_CATEGORIES, ARENA_PRODUCT_CATEGORY_LABEL, parseBRLInputToCents, type ArenaProductCategory } from './product.model';
import { createProduct } from './products-repository';

/** Tela Novo produto do painel: cadastro de item de estoque em `arenas/{arenaId}/products`.
 *  Sem upload de foto (Storage não integrado ainda) — usa `emoji` como identificador visual,
 *  que é o campo real do schema (`ArenaProduct.emoji`). */
@Component({
  selector: 'ar-panel-stock-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Novo produto" subtitle="Cadastrar item no estoque da arena">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : 'Salvar produto' }}
        </button>
      </ar-page-header>

      <div class="body">
        <div class="form-col">
          @if (errorMessage(); as err) {
            <div class="error-banner">{{ err }}</div>
          }

          <ar-panel-card title="Informações básicas">
            <div class="row-2">
              <div>
                <div class="field-label">Nome do produto</div>
                <input
                  type="text"
                  class="input-box"
                  placeholder="Ex.: Água mineral 500ml"
                  [value]="name()"
                  (input)="name.set($any($event.target).value)"
                />
              </div>
              <div>
                <div class="field-label">Emoji (identificação visual)</div>
                <input
                  type="text"
                  class="input-box"
                  maxlength="8"
                  placeholder="💧"
                  [value]="emoji()"
                  (input)="emoji.set($any($event.target).value)"
                />
              </div>
            </div>

            <div class="field-label row-gap">Categoria</div>
            <div class="ar-filter-bar">
              @for (opt of categoryOptions; track opt) {
                <button type="button" class="ar-chip" [class.active]="category() === opt" (click)="category.set(opt)">
                  {{ categoryLabel[opt] }}
                </button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Preço e estoque">
            <div class="row-2">
              <div>
                <div class="field-label">Preço de venda</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="priceValue()" (input)="priceValue.set($any($event.target).value)" />
                </div>
              </div>
              <div>
                <div class="field-label">Quantidade inicial</div>
                <input
                  type="number"
                  min="0"
                  class="input-box"
                  [value]="initialStock()"
                  (input)="initialStock.set($any($event.target).valueAsNumber || 0)"
                />
              </div>
            </div>

            <div class="row-2 row-gap">
              <div>
                <div class="field-label">Estoque mínimo (alerta)</div>
                <input
                  type="number"
                  min="0"
                  class="input-box"
                  [value]="minStock()"
                  (input)="minStock.set($any($event.target).valueAsNumber || 0)"
                />
              </div>
            </div>
          </ar-panel-card>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      justify-content: center;
      overflow: auto;
    }

    .form-col {
      width: 100%;
      max-width: 860px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 13px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .row-gap {
      margin-top: 18px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .price-box {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .price-box:focus-within {
      border-color: var(--nx-orange-500);
    }

    .price-box span {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
    }

    .price-box input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
    }

    @media (max-width: 720px) {
      .row-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelStockFormComponent {
  private readonly router = inject(Router);
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly categoryOptions = ARENA_PRODUCT_CATEGORIES;
  protected readonly categoryLabel = ARENA_PRODUCT_CATEGORY_LABEL;

  protected readonly name = signal('');
  protected readonly category = signal<ArenaProductCategory>('bebidas');
  protected readonly emoji = signal('');
  protected readonly priceValue = signal('0,00');
  protected readonly initialStock = signal(0);
  protected readonly minStock = signal(0);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly canSave = computed(() => this.name().trim().length > 0 && !this.saving());

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) {
      this.errorMessage.set('Não encontramos a arena da sua conta. Recarregue a página.');
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await createProduct(arenaFirestore(), arenaId, {
        name: this.name().trim(),
        category: this.category(),
        active: true,
        priceCents: parseBRLInputToCents(this.priceValue()),
        stockQuantity: Math.max(0, Math.round(this.initialStock())),
        minStockQuantity: Math.max(0, Math.round(this.minStock())),
        emoji: this.emoji().trim() || undefined,
      });
      void this.router.navigate(['/painel/estoque']);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível salvar o produto.');
    } finally {
      this.saving.set(false);
    }
  }
}
