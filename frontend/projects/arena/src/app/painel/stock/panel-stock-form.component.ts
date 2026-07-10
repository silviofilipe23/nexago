import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

type StockCategory = 'Bebida' | 'Snack' | 'Material' | 'Aluguel';

const CATEGORY_OPTIONS: StockCategory[] = ['Bebida', 'Snack', 'Material', 'Aluguel'];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Tela Novo produto do painel (protótipo ArStockFormScreen): cadastro de item de estoque com informações, preço/custo e estoque inicial. */
@Component({
  selector: 'ar-panel-stock-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Novo produto" subtitle="Cadastrar item no estoque da arena">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          Salvar produto
        </button>
      </ar-page-header>

      <div class="body">
        <div class="form-col">
          <ar-panel-card title="Informações básicas">
            <div class="photo-row">
              <label class="dropzone" (dragover)="$event.preventDefault()" (drop)="handleDrop($event)">
                <input type="file" accept="image/*" class="sr-only" (change)="handleFileChange($event)" />
                @if (photoDataUrl(); as url) {
                  <img [src]="url" alt="Foto do produto" />
                } @else {
                  <ar-icon name="image" [size]="22" style="color: var(--nx-text-dim)" />
                }
              </label>
              <div class="photo-hint">Arraste uma foto do produto<br />ou clique para escolher um arquivo</div>
            </div>

            <div class="field-label">Nome do produto</div>
            <input
              type="text"
              class="input-box name-input"
              placeholder="Ex.: Água mineral 500ml"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />

            <div class="row-2">
              <div>
                <div class="field-label">Categoria</div>
                <div class="ar-filter-bar">
                  @for (opt of categoryOptions; track opt) {
                    <button type="button" class="ar-chip" [class.active]="category() === opt" (click)="category.set(opt)">{{ opt }}</button>
                  }
                </div>
              </div>
              <div>
                <div class="field-label">Unidade de medida</div>
                <input type="text" class="input-box" [value]="unit()" (input)="unit.set($any($event.target).value)" />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Preço e custo">
            <div class="row-2">
              <div>
                <div class="field-label">Preço de venda</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="priceValue()" (input)="priceValue.set($any($event.target).value)" />
                </div>
              </div>
              <div>
                <div class="field-label">Custo unitário</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="costValue()" (input)="costValue.set($any($event.target).value)" />
                </div>
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Estoque inicial">
            <div class="row-2">
              <div>
                <div class="field-label">Quantidade inicial</div>
                <input type="number" min="0" class="input-box" [value]="initialStock()" (input)="initialStock.set($any($event.target).valueAsNumber || 0)" />
              </div>
              <div>
                <div class="field-label">Estoque mínimo (alerta)</div>
                <input type="number" min="0" class="input-box" [value]="minStock()" (input)="minStock.set($any($event.target).valueAsNumber || 0)" />
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

    .photo-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }

    .dropzone {
      width: 120px;
      height: 120px;
      flex: none;
      border-radius: var(--nx-r-2);
      border: 1px dashed var(--nx-line-strong);
      background: var(--nx-surface-1);
      display: grid;
      place-items: center;
      cursor: pointer;
      overflow: hidden;
      transition: border-color 140ms var(--nx-ease-out);
    }

    .dropzone:hover {
      border-color: var(--nx-orange-500);
    }

    .dropzone:focus-within {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .dropzone img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .photo-hint {
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
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

    .name-input {
      margin-bottom: 18px;
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

      .photo-row {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `,
})
export class PanelStockFormComponent {
  private readonly router = inject(Router);

  protected readonly categoryOptions = CATEGORY_OPTIONS;

  protected readonly name = signal('');
  protected readonly category = signal<StockCategory>('Bebida');
  protected readonly unit = signal('un');
  protected readonly priceValue = signal('0,00');
  protected readonly costValue = signal('0,00');
  protected readonly initialStock = signal(0);
  protected readonly minStock = signal(0);
  protected readonly photoDataUrl = signal<string | null>(null);

  protected readonly canSave = computed(() => this.name().trim().length > 0);

  protected async handleFileChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.photoDataUrl.set(await readFileAsDataUrl(file));
    }
  }

  protected async handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.photoDataUrl.set(await readFileAsDataUrl(file));
    }
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    this.router.navigate(['/painel/estoque']);
  }
}
