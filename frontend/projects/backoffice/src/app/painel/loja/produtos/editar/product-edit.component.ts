import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { callableErrorMessage } from '../../../data/callable-error';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { PanelShellComponent } from '../../../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../../../ui/pill.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { AuthService } from '../../../../auth/auth.service';
import { PRODUCT_CATEGORY_LABELS, PRODUCT_COLLECTIONS } from '../data/products.repository';
import { toggleBold, toggleList } from './description-format';
import {
  MAX_PHOTOS,
  dimensionError,
  fileError,
  moveItem,
  type PhotoItem,
} from './product-photos';
import { ProductEditRepository } from './product-edit.repository';
import {
  BADGE_OPTIONS,
  MAX_FEATURED,
  MAIN_LOCATION,
  baseSkuFromName,
  discountPercent,
  draftErrors,
  emptyForm,
  firstErrorField,
  headerStatus,
  idFromLabel,
  marginOf,
  parseMoney,
  publishErrors,
  reconcileSkus,
  skuTotal,
  skusLostWithStock,
  stockCell,
  withTotalStock,
  type AxisForm,
  type FormErrors,
  type HeaderStatus,
  type ProductForm,
  type ProductStatusValue,
  type SkuForm,
} from './product-form';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const STATUS_PILL: Record<HeaderStatus, { tone: PillTone; label: string }> = {
  ativo: { tone: 'green', label: 'Ativo' },
  rascunho: { tone: 'dim', label: 'Rascunho' },
  esgotado: { tone: 'red', label: 'Esgotado' },
  arquivado: { tone: 'dim', label: 'Arquivado' },
};

type LoadState = 'loading' | 'ok' | 'missing' | 'error';

/** Criar e editar produto da loja numa tela só. */
@Component({
  selector: 'bo-product-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  imports: [
    ConfirmDialogComponent,
    FieldComponent,
    IconComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    ToggleComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Loja › Produtos</div>
          <h1>{{ title() }}</h1>
        </div>
        <bo-pill [tone]="pill().tone">{{ pill().label }}</bo-pill>
        <div class="spacer"></div>
        @if (!isNew() && loadState() === 'ok') {
          <button type="button" class="bo-mini-btn" [disabled]="locked()" (click)="duplicate()">Duplicar</button>
        }
        <button type="button" class="bo-mini-btn" [disabled]="locked()" (click)="requestLeave()">Voltar</button>
        @if (isNew() || form().status === 'rascunho') {
          <button type="button" class="bo-mini-btn" [disabled]="locked() || (!isNew() && !dirty())" (click)="save('rascunho')">
            Salvar rascunho
          </button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="locked()" (click)="save('ativo')">
            Publicar
          </button>
        } @else {
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="locked() || !dirty()" (click)="save(form().status)">
            @if (busy()) { <span class="bo-spinner small" aria-hidden="true"></span> }
            Salvar alterações
          </button>
        }
      </header>

      @switch (loadState()) {
        @case ('loading') { <div class="state">Carregando produto…</div> }
        @case ('missing') { <div class="state">Produto não encontrado.</div> }
        @case ('error') { <div class="state">Não foi possível carregar o produto.</div> }
        @default {
          <div class="body">
            @if (!canEdit()) {
              <div class="bo-alert" role="status"><bo-icon name="lock" [size]="16" /><span>Somente leitura: sua conta não pode editar o catálogo.</span></div>
            }
            @if (conflict(); as c) {
              <div class="bo-alert" role="alert">
                <bo-icon name="alert" [size]="16" />
                <span>{{ c }}</span>
                <button type="button" class="bo-mini-btn" (click)="reload()">Recarregar</button>
              </div>
            }
            @if (error(); as e) {
              <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
            }
            @if (toast(); as t) {
              <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div>
            }

            <div class="cols">
              <div class="main">
                <bo-panel-card kicker="Mídia" title="Fotos" id="f-photos">
                  @if (errors().photos; as pe) { <p class="error">{{ pe }}</p> }
                  @if (isNew()) {
                    <p class="muted">Salve o rascunho para adicionar fotos.</p>
                  } @else {
                    <div class="photos" (dragover)="$event.preventDefault()" (drop)="onDropFiles($event)">
                      @for (p of photos(); track p.id; let i = $index) {
                        <div class="photo" [class.cover-photo]="i === 0" [class.failed]="p.error" draggable="true"
                          (dragstart)="dragFrom = i" (dragover)="$event.preventDefault()" (drop)="onDropPhoto($event, i)">
                          <img [src]="p.url" alt="" />
                          @if (i === 0) { <span class="badge">Capa</span> }
                          @if (p.progress !== null) { <div class="bar"><span [style.width.%]="p.progress"></span></div> }
                          @if (p.error) {
                            <div class="photo-err">{{ p.error }}
                              <button type="button" class="bo-mini-btn" (click)="retryPhoto(p.id)">Tentar de novo</button>
                            </div>
                          }
                          <div class="photo-actions">
                            @if (i > 0 && !p.error) {
                              <button type="button" class="bo-mini-btn" title="Definir como capa" aria-label="Definir como capa" [disabled]="locked()" (click)="makeCover(i)"><bo-icon name="star" [size]="13" /></button>
                            }
                            @if (form().axes.length > 0 && !p.error) {
                              <select class="bo-select mini" aria-label="Associar à cor" [disabled]="locked()" (change)="setPhotoColor(p.id, val($event))">
                                <option value="" [selected]="!p.colorValueId">Sem cor</option>
                                @for (v of form().axes[0]!.values; track v.id) { <option [value]="v.id" [selected]="p.colorValueId === v.id">{{ v.label }}</option> }
                              </select>
                            }
                            <button type="button" class="bo-mini-btn" title="Remover" aria-label="Remover foto" [disabled]="locked()" (click)="removePhoto(p.id)"><bo-icon name="trash" [size]="13" /></button>
                          </div>
                        </div>
                      }
                      @if (photos().length < maxPhotos) {
                        <label class="drop"><bo-icon name="plus" [size]="16" /> Adicionar ou soltar imagem
                          <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" [disabled]="locked()" (change)="onPick($event)" />
                        </label>
                      }
                    </div>
                    @if (photoError(); as pe) { <p class="error">{{ pe }}</p> }
                    <p class="muted">JPG, PNG ou WebP, até 10 MB, mínimo 1200×1200 px, máx. {{ maxPhotos }}. Arraste para reordenar; a primeira é a capa.</p>
                  }
                </bo-panel-card>

                <bo-panel-card kicker="Dados" title="Informações">
                  <div class="grid">
                    <bo-field label="Nome" [hint]="errors().name ?? ''">
                      <input id="f-name" class="bo-input" [class.err]="errors().name" [value]="form().name" [disabled]="locked()"
                        (input)="setName(val($event))" maxlength="80" />
                    </bo-field>
                    <bo-field label="SKU raiz" [hint]="errors().baseSku ?? 'Base dos códigos das variações'">
                      <input id="f-baseSku" class="bo-input" [class.err]="errors().baseSku" [value]="form().baseSku" [disabled]="locked() || !isNew()"
                        (input)="set('baseSku', val($event).toUpperCase())" />
                    </bo-field>
                    <bo-field label="Categoria" [hint]="errors().category ?? ''">
                      <select id="f-category" class="bo-select" [disabled]="locked()" (change)="set('category', val($event))">
                        <option value="" [selected]="!form().category">Selecione</option>
                        @for (c of categories; track c.id) {
                          <option [value]="c.id" [selected]="form().category === c.id">{{ c.label }}</option>
                        }
                      </select>
                    </bo-field>
                    <bo-field label="Coleção">
                      <select class="bo-select" [disabled]="locked()" (change)="set('collection', val($event))">
                        <option value="" [selected]="!form().collection">Nenhuma</option>
                        @for (c of collections; track c.id) {
                          <option [value]="c.id" [selected]="form().collection === c.id">{{ c.label }}</option>
                        }
                      </select>
                    </bo-field>
                    <bo-field label="Marca">
                      <input class="bo-input" [value]="form().brand" [disabled]="locked()" (input)="set('brand', val($event))" />
                    </bo-field>
                  </div>
                  <bo-field label="Descrição" [hint]="form().description.length + ' / 2000 · **negrito** e listas com “- ”'">
                    <div class="toolbar">
                      <button type="button" class="bo-mini-btn" aria-label="Negrito" [disabled]="locked()" (click)="format('bold')"><strong>B</strong></button>
                      <button type="button" class="bo-mini-btn" aria-label="Lista" [disabled]="locked()" (click)="format('list')">• Lista</button>
                    </div>
                    <textarea #desc class="bo-input area" maxlength="2000" [value]="form().description" [disabled]="locked()"
                      (input)="set('description', val($event))"></textarea>
                  </bo-field>
                  <div class="details">
                    <div class="sub">Detalhes técnicos</div>
                    @for (d of form().technicalDetails; track $index) {
                      <div class="detail-row">
                        <input class="bo-input" placeholder="Tecido" [value]="d.label" (input)="setDetail($index, 'label', val($event))" />
                        <input class="bo-input" placeholder="Poliéster" [value]="d.value" (input)="setDetail($index, 'value', val($event))" />
                        <button type="button" class="bo-mini-btn" aria-label="Remover detalhe" (click)="removeDetail($index)">
                          <bo-icon name="trash" [size]="13" />
                        </button>
                      </div>
                    }
                    <button type="button" class="bo-mini-btn add" (click)="addDetail()">
                      <bo-icon name="plus" [size]="13" /> Adicionar detalhe
                    </button>
                  </div>
                </bo-panel-card>

                <bo-panel-card kicker="Valores" title="Preço">
                  <div class="grid">
                    <bo-field label="Preço de venda (R$)" [hint]="errors().price ?? ''">
                      <input id="f-price" class="bo-input" inputmode="decimal" [class.err]="errors().price" [value]="form().price"
                        [disabled]="locked()" (input)="set('price', val($event))" />
                    </bo-field>
                    <bo-field label='Preço "de" (R$)' [hint]="errors().compareAtPrice ?? (discount() ? 'Selo -' + discount() + '%' : '')">
                      <input id="f-compareAtPrice" class="bo-input" inputmode="decimal" [class.err]="errors().compareAtPrice"
                        [value]="form().compareAtPrice" [disabled]="locked()" (input)="set('compareAtPrice', val($event))" />
                    </bo-field>
                    <bo-field label="Custo (R$)" [hint]="errors().cost ?? 'Só visível no backoffice'">
                      <input id="f-cost" class="bo-input" inputmode="decimal" [class.err]="errors().cost" [value]="form().cost"
                        [disabled]="locked()" (input)="set('cost', val($event))" />
                    </bo-field>
                    <bo-field label="Margem">
                      @if (margin(); as m) {
                        <div class="margin" [class]="'margin tone-' + m.tone">
                          {{ m.percent.toFixed(0) }}% · {{ money(m.perUnitCents) }}/un.
                        </div>
                      } @else {
                        <div class="margin muted">—</div>
                      }
                    </bo-field>
                  </div>
                  <p class="muted">Preço no Pix e parcelamento seguem as regras de Cupons & promoções.</p>
                </bo-panel-card>

                <bo-panel-card kicker="Estoque" title="Variações e estoque">
                  <div class="var-head">
                    <span class="muted">Alerta de estoque baixo:</span>
                    <input class="bo-input narrow" type="number" min="0" [value]="form().lowStockThreshold" [disabled]="locked()"
                      (input)="set('lowStockThreshold', toInt(val($event)))" aria-label="Alerta de estoque baixo" />
                    <div class="spacer"></div>
                    <button type="button" class="bo-mini-btn" [disabled]="locked()" (click)="openAxes()">Editar opções</button>
                  </div>
                  @if (form().axes.length === 0) {
                    <bo-field label="Estoque">
                      <input class="bo-input narrow" type="number" min="0" [value]="cellValue(0)" [disabled]="locked()"
                        (input)="setStock(0, toInt(val($event)))" />
                    </bo-field>
                  } @else {
                    <div class="table-wrap">
                      <table class="stock">
                        <thead>
                          <tr>
                            <th>{{ rowAxis().label }}</th>
                            @for (col of colValues(); track col.id) { <th>{{ col.label }}</th> }
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (row of rowValues(); track row.id) {
                            <tr>
                              <th>
                                @if (row.hex) { <span class="swatch" [style.background]="row.hex"></span> }
                                {{ row.label }}
                              </th>
                              @for (col of colValues(); track col.id) {
                                <td>
                                  <input type="number" min="0" [class]="'cell cell-' + cellState(skuIndex(row.id, col.id))"
                                    [value]="cellValue(skuIndex(row.id, col.id))" [disabled]="locked()"
                                    [attr.aria-label]="row.label + ' ' + col.label"
                                    (input)="setStock(skuIndex(row.id, col.id), toInt(val($event)))"
                                    (click)="onCellClick($event, skuIndex(row.id, col.id))" />
                                </td>
                              }
                              <td class="total">{{ rowTotal(row.id) }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                    <p class="muted">Alt+clique numa célula para código de barras e preço próprio. O número ajusta o estoque do CD.</p>
                  }
                </bo-panel-card>
              </div>

              <aside class="side">
                <bo-panel-card kicker="Canais" title="Publicação">
                  <div class="toggle-row"><span>Visível no app</span>
                    <bo-toggle ariaLabel="Visível no app" [checked]="form().channels.app" (checkedChange)="setChannel('app', $event)" /></div>
                  <div class="toggle-row"><span>Visível no portal web</span>
                    <bo-toggle ariaLabel="Visível no portal web" [checked]="form().channels.web" (checkedChange)="setChannel('web', $event)" /></div>
                  <div class="toggle-row"><span>Permite retirada na arena</span>
                    <bo-toggle ariaLabel="Permite retirada" [checked]="form().fulfillment.pickup" (checkedChange)="setFulfillment('pickup', $event)" /></div>
                  <div class="toggle-row"><span>Permite entrega</span>
                    <bo-toggle ariaLabel="Permite entrega" [checked]="form().fulfillment.delivery" (checkedChange)="setFulfillment('delivery', $event)" /></div>
                  <div class="toggle-row"><span>Destaque na vitrine</span>
                    <bo-toggle ariaLabel="Destaque" [checked]="form().featured" (checkedChange)="set('featured', $event)" /></div>
                  <p class="muted">Destaque: até {{ maxFeatured }} produtos na vitrine.</p>
                  @if (errors().channels ?? errors().fulfillment; as msg) {
                    <p id="f-channels" class="error">{{ msg }}</p>
                  }
                  <bo-field label="Selo">
                    <select class="bo-select" (change)="setBadge(val($event))">
                      @for (b of badges; track b.id) {
                        <option [value]="b.id" [selected]="form().badge === b.id">{{ b.label }}</option>
                      }
                    </select>
                  </bo-field>
                  @if (!isNew() && slug()) { <p class="muted">URL: /loja/{{ slug() }}</p> }
                </bo-panel-card>

                <bo-panel-card kicker="Vitrine" title="Prévia">
                  <div class="preview">
                    <div class="cover">
                      @if (coverUrl()) { <img [src]="coverUrl()" alt="" /> }
                      @if (form().badge) { <span class="badge">{{ badgeLabel() }}</span> }
                    </div>
                    <div class="p-name">{{ form().name || 'Nome do produto' }}</div>
                    <div class="p-price">
                      <strong>{{ money(priceCents() ?? 0) }}</strong>
                      @if (compareCents() && discount()) { <s>{{ money(compareCents()!) }}</s> <em>-{{ discount() }}%</em> }
                    </div>
                  </div>
                </bo-panel-card>

                <bo-panel-card kicker="Logística" title="Envio">
                  <div class="grid two">
                    <bo-field label="Peso (kg)"><input id="f-shipping" class="bo-input" [class.err]="errors().shipping" [value]="form().weightKg" (input)="set('weightKg', val($event))" /></bo-field>
                    <bo-field label="Comprimento (cm)"><input class="bo-input" [value]="form().lengthCm" (input)="set('lengthCm', val($event))" /></bo-field>
                    <bo-field label="Largura (cm)"><input class="bo-input" [value]="form().widthCm" (input)="set('widthCm', val($event))" /></bo-field>
                    <bo-field label="Altura (cm)"><input class="bo-input" [value]="form().heightCm" (input)="set('heightCm', val($event))" /></bo-field>
                  </div>
                  @if (errors().shipping; as s) { <p class="error">{{ s }}</p> }
                </bo-panel-card>

                @if (!isNew()) {
                  <button type="button" class="bo-mini-btn danger-btn" [disabled]="locked()" (click)="archiveOpen.set(true)">
                    {{ form().status === 'arquivado' ? 'Restaurar produto' : 'Arquivar produto' }}
                  </button>
                }
              </aside>
            </div>
          </div>
        }
      }
    </bo-panel-shell>

    <bo-confirm-dialog [open]="leaveOpen()" title="Descartar alterações?"
      description="Você tem alterações não salvas. Se sair agora, elas serão perdidas." confirmLabel="Descartar" tone="danger"
      (confirmed)="resolveLeave(true)" (dismissed)="resolveLeave(false)" />

    <bo-confirm-dialog [open]="archiveOpen()" [title]="form().status === 'arquivado' ? 'Restaurar produto?' : 'Arquivar produto?'"
      [description]="form().status === 'arquivado' ? 'O produto volta como rascunho.' : 'O produto sai da loja e dos favoritos dos atletas. Pedidos antigos continuam visíveis.'"
      [confirmLabel]="form().status === 'arquivado' ? 'Restaurar' : 'Arquivar'" tone="danger" [busy]="busy()"
      (confirmed)="archive()" (dismissed)="archiveOpen.set(false)" />

    <bo-confirm-dialog [open]="axesOpen()" title="Editar opções" size="md" confirmLabel="Aplicar"
      description="Até 2 eixos de variação (ex.: Cor, Tamanho)." [error]="axesError()"
      (confirmed)="applyAxes()" (dismissed)="axesOpen.set(false)">
      @for (axis of axesDraft(); track $index; let ai = $index) {
        <div class="axis">
          <div class="detail-row">
            <input class="bo-input" placeholder="Nome do eixo (Cor)" [value]="axis.label" (input)="setAxisLabel(ai, val($event))" />
            <button type="button" class="bo-mini-btn" (click)="removeAxis(ai)" aria-label="Remover eixo"><bo-icon name="trash" [size]="13" /></button>
          </div>
          @for (v of axis.values; track $index; let vi = $index) {
            <div class="detail-row">
              <input class="bo-input" placeholder="Valor" [value]="v.label" (input)="setAxisValue(ai, vi, 'label', val($event))" />
              <input class="bo-input hex" placeholder="#FF6A1A" [value]="v.hex" (input)="setAxisValue(ai, vi, 'hex', val($event))" />
              <button type="button" class="bo-mini-btn" (click)="removeAxisValue(ai, vi)" aria-label="Remover valor"><bo-icon name="trash" [size]="13" /></button>
            </div>
          }
          <button type="button" class="bo-mini-btn add" (click)="addAxisValue(ai)"><bo-icon name="plus" [size]="13" /> Valor</button>
        </div>
      }
      @if (axesDraft().length < 2) {
        <button type="button" class="bo-mini-btn add" (click)="addAxis()"><bo-icon name="plus" [size]="13" /> Eixo</button>
      }
    </bo-confirm-dialog>

    <bo-confirm-dialog [open]="skuOpen() !== null" title="Detalhe do SKU" size="md" confirmLabel="Fechar"
      (confirmed)="skuOpen.set(null)" (dismissed)="skuOpen.set(null)">
      @if (skuDetail(); as sku) {
        <bo-field label="Código de barras"><input class="bo-input" [value]="sku.barcode" (input)="setSku('barcode', val($event))" /></bo-field>
        <bo-field label="Preço próprio (R$)" hint="Vazio usa o preço do produto"><input class="bo-input" [value]="sku.price" (input)="setSku('price', val($event))" /></bo-field>
        @for (loc of locations(sku); track loc) {
          <div class="toggle-row"><span>Estoque · {{ loc.toUpperCase() }}</span><strong>{{ sku.stockByLocation[loc] }}</strong></div>
        }
      }
    </bo-confirm-dialog>
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 12px; padding: 20px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 3px 0 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -.02em; }
    .spacer { flex: 1; }
    .state { padding: 48px 32px; color: var(--nx-text-mute); }
    .body { padding: 24px 32px; display: flex; flex-direction: column; gap: 16px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
    .main, .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
    .grid.two { margin: 0; }
    .muted { color: var(--nx-text-dim); font-size: 12px; margin: 8px 0 0; }
    .error { color: var(--nx-live); font-size: 12px; margin: 6px 0 0; }
    .bo-input.err { border-color: var(--nx-live); }
    .area { height: 120px; padding: 10px 13px; resize: vertical; }
    .narrow { width: 90px; }
    .hex { max-width: 120px; }
    .sub { font-size: 12px; color: var(--nx-text-mute); margin: 14px 0 8px; }
    .detail-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .add { margin-top: 4px; }
    .margin { height: 42px; display: flex; align-items: center; font-weight: 600; }
    .tone-green { color: var(--nx-win); } .tone-yellow { color: var(--nx-pending); } .tone-red { color: var(--nx-live); }
    .var-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .table-wrap { overflow-x: auto; }
    table.stock { border-collapse: collapse; width: 100%; font-size: 13px; }
    table.stock th, table.stock td { padding: 6px 8px; text-align: center; }
    table.stock tbody th { text-align: left; white-space: nowrap; }
    .swatch { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; border: 1px solid var(--nx-line-strong); }
    .cell { width: 64px; height: 34px; text-align: center; background: var(--nx-surface-1); border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); color: var(--nx-text); }
    .cell-zero { background: rgba(255, 59, 48, .12); border-color: rgba(255, 59, 48, .35); }
    .cell-low { background: rgba(244, 197, 67, .12); border-color: rgba(244, 197, 67, .35); }
    .total { font-weight: 700; }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 13px; }
    .preview { display: flex; flex-direction: column; gap: 8px; }
    .cover { position: relative; aspect-ratio: 1; background: var(--nx-surface-1); border-radius: var(--nx-r-3); overflow: hidden; }
    .cover img { width: 100%; height: 100%; object-fit: cover; }
    .badge { position: absolute; top: 8px; left: 8px; background: var(--nx-orange-500); color: #fff; font-size: 10px; padding: 3px 8px; border-radius: var(--nx-r-pill); }
    .p-name { font-weight: 600; }
    .p-price s { color: var(--nx-text-dim); margin: 0 6px; } .p-price em { color: var(--nx-win); font-style: normal; }
    .danger-btn { color: var(--nx-live); border-color: rgba(255, 59, 48, .35); justify-content: center; }
    .axis { border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); padding: 12px; }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, 110px); gap: 10px; }
    .photo { position: relative; width: 110px; height: 110px; border-radius: var(--nx-r-3); overflow: hidden; background: var(--nx-surface-1); border: 1px solid var(--nx-line); cursor: grab; }
    .photo.cover-photo { grid-column: span 2; grid-row: span 2; width: 230px; height: 230px; }
    .photo.failed { border-color: var(--nx-live); }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(0,0,0,.4); }
    .bar span { display: block; height: 100%; background: var(--nx-orange-500); }
    .photo-err { position: absolute; inset: 0; background: rgba(0,0,0,.7); color: #fff; font-size: 11px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
    .photo-actions { position: absolute; top: 4px; right: 4px; display: none; gap: 4px; }
    .photo:hover .photo-actions, .photo:focus-within .photo-actions { display: flex; flex-direction: column; align-items: flex-end; }
    .bo-select.mini { height: 28px; font-size: 11px; width: 90px; padding: 0 6px; }
    .drop { width: 110px; height: 110px; border: 1px dashed var(--nx-line-strong); border-radius: var(--nx-r-3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 11px; text-align: center; color: var(--nx-text-mute); cursor: pointer; }
    .toolbar { display: flex; gap: 6px; }
    @media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
  `,
})
export class ProductEditComponent {
  private readonly repo = inject(ProductEditRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly categories = Object.entries(PRODUCT_CATEGORY_LABELS).map(([id, label]) => ({ id, label }));
  protected readonly collections = PRODUCT_COLLECTIONS;
  protected readonly badges = BADGE_OPTIONS;
  protected readonly maxFeatured = MAX_FEATURED;

  private readonly productId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isNew = computed(() => this.productId() === null);
  protected readonly loadState = signal<LoadState>('loading');
  protected readonly form = signal<ProductForm>(emptyForm());
  private readonly baseline = signal(JSON.stringify(emptyForm()));
  private version: number | null = null;
  private baselineVariations = '';
  protected readonly slug = signal('');
  private readonly auth = inject(AuthService);
  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || this.auth.roles().includes('admin'));
  protected readonly locked = computed(() => this.busy() || !this.canEdit());
  protected readonly photos = signal<PhotoItem[]>([]);
  protected readonly photoError = signal<string | null>(null);
  protected readonly maxPhotos = MAX_PHOTOS;
  protected readonly coverUrl = computed(() => this.photos()[0]?.url ?? null);
  protected dragFrom = -1;
  private readonly pendingFiles = new Map<string, File>();
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly descRef = viewChild<ElementRef<HTMLTextAreaElement>>('desc');
  protected readonly busy = signal(false);
  protected readonly errors = signal<FormErrors>({});
  protected readonly error = signal<string | null>(null);
  protected readonly conflict = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);

  protected readonly leaveOpen = signal(false);
  protected readonly archiveOpen = signal(false);
  protected readonly axesOpen = signal(false);
  protected readonly axesDraft = signal<AxisForm[]>([]);
  protected readonly axesError = signal<string | null>(null);
  protected readonly skuOpen = signal<number | null>(null);
  private leaveResolver: ((ok: boolean) => void) | null = null;
  private skipGuard = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly dirty = computed(() => JSON.stringify(this.form()) !== this.baseline());
  protected readonly title = computed(() => (this.isNew() ? 'Novo produto' : this.form().name || 'Produto'));
  protected readonly pill = computed(() => STATUS_PILL[headerStatus(this.form())]);
  protected readonly priceCents = computed(() => parseMoney(this.form().price));
  protected readonly compareCents = computed(() => parseMoney(this.form().compareAtPrice));
  protected readonly discount = computed(() => discountPercent(this.priceCents(), this.compareCents()));
  protected readonly margin = computed(() => marginOf(this.priceCents(), parseMoney(this.form().cost)));
  protected readonly badgeLabel = computed(() => BADGE_OPTIONS.find((b) => b.id === this.form().badge)?.label ?? '');
  protected readonly rowAxis = computed(() => this.form().axes[0]!);
  protected readonly rowValues = computed(() => this.form().axes[0]?.values ?? []);
  protected readonly colValues = computed(() => this.form().axes[1]?.values ?? [{ id: '', label: 'Estoque', hex: '' }]);
  protected readonly skuDetail = computed(() => {
    const i = this.skuOpen();
    return i === null ? null : (this.form().skus[i] ?? null);
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.toastTimer && clearTimeout(this.toastTimer));
    void this.load();
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  protected toInt(text: string): number {
    const n = Math.floor(Number(text));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  protected money(cents: number): string {
    return BRL.format(cents / 100);
  }

  protected set<K extends keyof ProductForm>(key: K, value: ProductForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.clearErrors();
  }
  private clearErrors(): void {
    if (Object.keys(this.errors()).length > 0) {
      this.errors.set({});
    }
  }
  protected setName(name: string): void {
    // Enquanto o produto não foi salvo, o nome gera a raiz do SKU.
    this.form.update((f) => ({ ...f, name, baseSku: this.isNew() ? baseSkuFromName(name) : f.baseSku }));
    this.clearErrors();
  }
  protected setBadge(value: string): void {
    this.set('badge', value as ProductForm['badge']);
  }
  protected setChannel(key: 'app' | 'web', on: boolean): void {
    this.set('channels', { ...this.form().channels, [key]: on });
  }
  protected setFulfillment(key: 'pickup' | 'delivery', on: boolean): void {
    this.set('fulfillment', { ...this.form().fulfillment, [key]: on });
  }
  protected addDetail(): void {
    this.set('technicalDetails', [...this.form().technicalDetails, { label: '', value: '' }]);
  }
  protected removeDetail(i: number): void {
    this.set('technicalDetails', this.form().technicalDetails.filter((_, idx) => idx !== i));
  }
  protected setDetail(i: number, key: 'label' | 'value', value: string): void {
    this.set('technicalDetails', this.form().technicalDetails.map((d, idx) => (idx === i ? { ...d, [key]: value } : d)));
  }

  // ---------- grade ----------
  protected skuIndex(rowId: string, colId: string): number {
    const axes = this.form().axes;
    return this.form().skus.findIndex(
      (s) => s.axisValues[axes[0]!.id] === rowId && (axes[1] ? s.axisValues[axes[1].id] === colId : true),
    );
  }
  protected cellValue(i: number): number {
    const sku = this.form().skus[i];
    return sku ? skuTotal(sku) : 0;
  }
  protected rowTotal(rowId: string): number {
    const a0 = this.form().axes[0]!.id;
    return this.form().skus.filter((s) => s.axisValues[a0] === rowId).reduce((n, s) => n + skuTotal(s), 0);
  }
  protected cellState(i: number): StockCellClass {
    const sku = this.form().skus[i];
    return sku ? stockCell(skuTotal(sku), this.form().lowStockThreshold) : 'ok';
  }
  protected setStock(i: number, total: number): void {
    this.form.update((f) => ({ ...f, skus: f.skus.map((s, idx) => (idx === i ? withTotalStock(s, total) : s)) }));
  }
  protected onCellClick(event: MouseEvent, i: number): void {
    if (event.altKey) {
      this.skuOpen.set(i);
    }
  }
  protected setSku(key: 'barcode' | 'price', value: string): void {
    const i = this.skuOpen();
    if (i === null) {
      return;
    }
    this.form.update((f) => ({ ...f, skus: f.skus.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)) }));
  }
  protected locations(sku: SkuForm): string[] {
    return [MAIN_LOCATION, ...Object.keys(sku.stockByLocation).filter((l) => l !== MAIN_LOCATION)];
  }

  // ---------- eixos ----------
  protected openAxes(): void {
    this.axesDraft.set(JSON.parse(JSON.stringify(this.form().axes)));
    this.axesError.set(null);
    this.axesOpen.set(true);
  }
  protected addAxis(): void {
    this.axesDraft.update((a) => [...a, { id: '', label: '', values: [] }]);
  }
  protected removeAxis(i: number): void {
    this.axesDraft.update((a) => a.filter((_, idx) => idx !== i));
  }
  protected setAxisLabel(i: number, label: string): void {
    this.axesDraft.update((a) => a.map((x, idx) => (idx === i ? { ...x, label } : x)));
  }
  protected addAxisValue(i: number): void {
    this.axesDraft.update((a) => a.map((x, idx) => (idx === i ? { ...x, values: [...x.values, { id: '', label: '', hex: '' }] } : x)));
  }
  protected removeAxisValue(i: number, vi: number): void {
    this.axesDraft.update((a) => a.map((x, idx) => (idx === i ? { ...x, values: x.values.filter((_, k) => k !== vi) } : x)));
  }
  protected setAxisValue(i: number, vi: number, key: 'label' | 'hex', value: string): void {
    this.axesDraft.update((a) =>
      a.map((x, idx) => (idx === i ? { ...x, values: x.values.map((v, k) => (k === vi ? { ...v, [key]: value } : v)) } : x)),
    );
  }
  protected applyAxes(): void {
    const axes = this.axesDraft().map((axis) => ({
      ...axis,
      id: idFromLabel(axis.label),
      values: axis.values.map((v) => ({ ...v, id: idFromLabel(v.label) })),
    }));
    const bad =
      axes.some((a) => a.label.trim() === '' || a.values.length === 0 || a.values.some((v) => v.label.trim() === '')) ||
      new Set(axes.map((a) => a.id)).size !== axes.length ||
      axes.some((a) => new Set(a.values.map((v) => v.id)).size !== a.values.length);
    if (bad) {
      this.axesError.set('Cada eixo precisa de nome único e valores preenchidos e diferentes entre si.');
      return;
    }
    // O servidor recusa remover variação com estoque; avisar aqui evita o erro depois.
    const lost = skusLostWithStock(axes, this.form().skus);
    if (lost.length > 0) {
      this.axesError.set(`Zere o estoque de ${lost.length} variação(ões) antes de removê-la(s).`);
      return;
    }
    this.form.update((f) => ({ ...f, axes, skus: reconcileSkus(axes, f.skus) }));
    this.axesOpen.set(false);
  }

  // ---------- carregar / salvar ----------
  private snapshot(form: ProductForm): void {
    this.form.set(form);
    this.baseline.set(JSON.stringify(form));
    this.baselineVariations = JSON.stringify([form.axes, form.skus]);
  }

  private async load(): Promise<void> {
    const id = this.productId();
    if (id === null) {
      this.snapshot(emptyForm());
      this.loadState.set('ok');
      return;
    }
    try {
      const loaded = await this.repo.load(id);
      if (!loaded) {
        this.loadState.set('missing');
        return;
      }
      this.version = loaded.version;
      this.slug.set(loaded.slug);
      this.photos.set(loaded.photos);
      this.snapshot(loaded.form);
      this.loadState.set('ok');
    } catch {
      this.loadState.set('error');
    }
  }

  protected async reload(): Promise<void> {
    this.conflict.set(null);
    this.error.set(null);
    this.loadState.set('loading');
    await this.load();
  }

  protected async save(target: ProductStatusValue): Promise<void> {
    if (this.busy()) {
      return;
    }
    const form = this.form();
    const errors: FormErrors = target === 'ativo' ? publishErrors(form) : draftErrors(form);
    if (target === 'ativo' && !this.photos().some((p) => p.progress === null && !p.error)) {
      errors.photos = this.isNew()
        ? 'Salve o rascunho e adicione ao menos 1 foto para publicar.'
        : 'Adicione ao menos 1 foto para publicar.';
    }
    this.errors.set(errors);
    const first = firstErrorField(errors);
    if (first) {
      const el = document.getElementById('f-' + first);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const variationsDirty = JSON.stringify([form.axes, form.skus]) !== this.baselineVariations;
      const result = await this.repo.save(
        form,
        { productId: this.productId(), version: this.version },
        target,
        { includeCost: true, saveVariations: this.isNew() || variationsDirty },
      );
      const wasNew = this.isNew();
      this.version = result.version;
      this.slug.set(result.slug);
      this.productId.set(result.productId);
      this.snapshot({ ...form, status: target, active: target === 'ativo' && (form.status !== 'ativo' || form.active) });
      this.showToast('Produto salvo');
      if (wasNew) {
        this.skipGuard = true;
        await this.router.navigate(['/painel/loja/produtos', result.productId], { replaceUrl: true });
        this.skipGuard = false;
      }
    } catch (err) {
      await this.handleSaveError(err);
    } finally {
      this.busy.set(false);
    }
  }

  private async handleSaveError(err: unknown): Promise<void> {
    const code = String((err as { code?: string })?.code ?? '');
    const id = this.productId();
    if (code.includes('failed-precondition') && id && !String((err as Error).message).includes('estoque')) {
      const details = (err as { details?: { updatedBy?: { name?: string } } }).details;
      const who = details?.updatedBy?.name ?? (await this.repo.peekVersion(id))?.updatedBy;
      this.conflict.set(`Este produto foi alterado${who ? ' por ' + who : ''}. Recarregue para ver a versão atual.`);
      return;
    }
    this.error.set(callableErrorMessage(err));
  }

  protected async duplicate(): Promise<void> {
    const id = this.productId();
    if (!id || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const copyId = await this.repo.duplicate(id);
      this.skipGuard = true;
      await this.router.navigate(['/painel/loja/produtos', copyId]);
      this.skipGuard = false;
      this.productId.set(copyId);
      await this.reload();
    } catch (err) {
      this.error.set(callableErrorMessage(err));
    } finally {
      this.skipGuard = false;
      this.busy.set(false);
    }
  }

  protected async archive(): Promise<void> {
    const id = this.productId();
    if (!id || this.version === null) {
      return;
    }
    this.busy.set(true);
    try {
      await this.repo.archive(id, this.version, this.form().status === 'arquivado');
      this.archiveOpen.set(false);
      this.skipGuard = true;
      await this.router.navigate(['/painel/loja/produtos']);
    } catch (err) {
      this.archiveOpen.set(false);
      await this.handleSaveError(err);
    } finally {
      this.skipGuard = false;
      this.busy.set(false);
    }
  }

  private showToast(text: string): void {
    this.toast.set(text);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.toast.set(null), 3000);
  }

  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (this.dirty() || this.isNew()) {
        void this.save(this.isNew() ? 'rascunho' : this.form().status);
      }
    }
  }

  // ---------- descrição ----------
  protected format(kind: 'bold' | 'list'): void {
    const el = this.descRef()?.nativeElement;
    if (!el) {
      return;
    }
    const edit = (kind === 'bold' ? toggleBold : toggleList)(el.value, el.selectionStart, el.selectionEnd);
    this.set('description', edit.text.slice(0, 2000));
    queueMicrotask(() => {
      el.value = this.form().description;
      el.focus();
      el.setSelectionRange(edit.selStart, edit.selEnd);
    });
  }

  // ---------- fotos ----------
  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.addFiles([...(input.files ?? [])]);
    input.value = '';
  }
  protected onDropFiles(event: DragEvent): void {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) {
      event.preventDefault();
      void this.addFiles(files);
    }
  }
  protected onDropPhoto(event: DragEvent, to: number): void {
    if (event.dataTransfer?.files.length) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (this.dragFrom >= 0 && !this.locked()) {
      this.photos.update((p) => moveItem(p, this.dragFrom, to));
      this.persistPhotos();
    }
    this.dragFrom = -1;
  }
  protected makeCover(i: number): void {
    this.photos.update((p) => moveItem(p, i, 0));
    this.persistPhotos();
  }
  protected setPhotoColor(id: string, value: string): void {
    this.photos.update((p) => p.map((x) => (x.id === id ? { ...x, colorValueId: value || null } : x)));
    this.persistPhotos();
  }
  protected removePhoto(id: string): void {
    const removed = this.photos().find((p) => p.id === id);
    this.photos.update((p) => p.filter((x) => x.id !== id));
    this.pendingFiles.delete(id);
    this.persistPhotos();
    if (removed?.path) {
      void this.repo.deletePhotoFile(removed.path);
    }
  }
  protected retryPhoto(id: string): void {
    const file = this.pendingFiles.get(id);
    if (file) {
      void this.uploadOne(id, file);
    }
  }

  private async addFiles(files: File[]): Promise<void> {
    this.photoError.set(null);
    for (const file of files) {
      const problem = fileError(file, this.photos().length);
      if (problem) {
        this.photoError.set(`${file.name}: ${problem}`);
        continue;
      }
      try {
        const bitmap = await createImageBitmap(file);
        const dim = dimensionError(bitmap.width, bitmap.height);
        bitmap.close();
        if (dim) {
          this.photoError.set(`${file.name}: ${dim}`);
          continue;
        }
      } catch {
        this.photoError.set(`${file.name}: não foi possível ler a imagem.`);
        continue;
      }
      const tempId = 'tmp-' + crypto.randomUUID();
      this.photos.update((p) => [
        ...p,
        { id: tempId, url: URL.createObjectURL(file), path: '', colorValueId: null, progress: 0, error: null },
      ]);
      this.pendingFiles.set(tempId, file);
      void this.uploadOne(tempId, file);
    }
  }

  private async uploadOne(tempId: string, file: File): Promise<void> {
    const productId = this.productId();
    if (!productId) {
      return;
    }
    this.patchPhoto(tempId, { error: null, progress: 0 });
    try {
      const done = await this.repo.uploadPhoto(productId, file, (progress) => this.patchPhoto(tempId, { progress }));
      this.pendingFiles.delete(tempId);
      this.photos.update((p) =>
        p.map((x) => (x.id === tempId ? { ...x, id: done.id, url: done.url, path: done.path, progress: null } : x)),
      );
      this.persistPhotos();
    } catch {
      this.patchPhoto(tempId, { progress: null, error: 'Falha no envio.' });
    }
  }

  private patchPhoto(id: string, patch: Partial<PhotoItem>): void {
    this.photos.update((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  /** Em fila: cada gravação usa a versão devolvida pela anterior. */
  private persistPhotos(): void {
    this.persistQueue = this.persistQueue.then(async () => {
      const id = this.productId();
      if (!id || this.version === null) {
        return;
      }
      try {
        this.version = await this.repo.savePhotos(id, this.version, this.photos());
      } catch (err) {
        await this.handleSaveError(err);
      }
    });
  }

  // ---------- sair ----------
  protected requestLeave(): void {
    void this.router.navigate(['/painel/loja/produtos']);
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.skipGuard || !this.dirty()) {
      return true;
    }
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve) => (this.leaveResolver = resolve));
  }

  protected resolveLeave(ok: boolean): void {
    this.leaveOpen.set(false);
    this.leaveResolver?.(ok);
    this.leaveResolver = null;
  }
}

type StockCellClass = ReturnType<typeof stockCell>;
