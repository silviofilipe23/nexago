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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  withView,
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
  formatDimensions,
  parseDimensions,
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
    RouterLink,
    ToggleComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <nav class="crumb" aria-label="Trilha">
            <span>Loja</span>
            <bo-icon name="chevron-right" [size]="10" />
            <a routerLink="/painel/loja/produtos">Produtos</a>
          </nav>
          <div class="title-row">
            <h1>{{ title() }}</h1>
            <bo-pill [tone]="pill().tone">{{ pill().label }}</bo-pill>
          </div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn ghost" disabled
          [title]="isNew() || form().status === 'rascunho' ? 'Rascunho não aparece na loja' : 'A vitrine do portal ainda não está no ar'">
          Ver na loja
        </button>
        @if (!isNew() && loadState() === 'ok') {
          <a class="bo-mini-btn" [routerLink]="['/painel/loja/produtos', productId(), 'personalizacao']">Personalização</a>
          <button type="button" class="bo-mini-btn" [disabled]="locked()" (click)="duplicate()">Duplicar</button>
        }
        @if (isNew() || form().status === 'rascunho') {
          <button type="button" class="bo-mini-btn" [disabled]="locked() || (!isNew() && !dirty())" (click)="save('rascunho')">
            Salvar rascunho
          </button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="locked()" (click)="save('ativo')">
            @if (busy()) { <span class="bo-spinner small" aria-hidden="true"></span> }
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
                <bo-panel-card kicker="Arraste para reordenar · a 1ª é a capa" title="Fotos" id="f-photos">
                  @if (!isNew() && photos().length < maxPhotos) {
                    <label card-actions class="bo-mini-btn" [class.is-disabled]="locked()">
                      <bo-icon name="plus" [size]="13" /> Adicionar
                      <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" [disabled]="locked()" (change)="onPick($event)" />
                    </label>
                  }
                  <div class="card-body">
                    @if (errors().photos; as pe) { <p class="error">{{ pe }}</p> }
                    @if (isNew()) {
                      <p class="muted">Salve o rascunho para adicionar fotos.</p>
                    } @else {
                      <div class="photos" (dragover)="$event.preventDefault()" (drop)="onDropFiles($event)">
                        @for (p of photos(); track p.id; let i = $index) {
                          <div class="photo" [class.cover-photo]="i === 0" [class.failed]="p.error" draggable="true"
                            (dragstart)="dragFrom = i" (dragover)="$event.preventDefault()" (drop)="onDropPhoto($event, i)">
                            <img [src]="p.url" alt="" />
                            @if (i === 0) { <span class="cover-pill">Capa</span> }
                            @if (p.view) { <span class="view-pill">{{ p.view === 'frente' ? 'Frente' : 'Costas' }}</span> }
                            @if (p.progress !== null) { <div class="bar"><span [style.width.%]="p.progress"></span></div> }
                            @if (p.error) {
                              <div class="photo-err">{{ p.error }}
                                <button type="button" class="bo-mini-btn" (click)="retryPhoto(p.id)">Tentar de novo</button>
                              </div>
                            }
                            <div class="photo-actions">
                              @if (i > 0 && !p.error) {
                                <button type="button" class="icon-btn" title="Definir como capa" aria-label="Definir como capa" [disabled]="locked()" (click)="makeCover(i)"><bo-icon name="star" [size]="13" /></button>
                              }
                              @if (form().axes.length > 0 && !p.error) {
                                <select class="bo-select mini" aria-label="Associar à cor" [disabled]="locked()" (change)="setPhotoColor(p.id, val($event))">
                                  <option value="" [selected]="!p.colorValueId">Sem cor</option>
                                  @for (v of form().axes[0]!.values; track v.id) { <option [value]="v.id" [selected]="p.colorValueId === v.id">{{ v.label }}</option> }
                                </select>
                              }
                              @if (!p.error) {
                                <select class="bo-select mini" aria-label="Lado da peça na foto" title="Usado nas prévias de personalização" [disabled]="locked()" (change)="setPhotoView(p.id, val($event))">
                                  <option value="" [selected]="!p.view">Sem lado</option>
                                  <option value="frente" [selected]="p.view === 'frente'">Frente</option>
                                  <option value="costas" [selected]="p.view === 'costas'">Costas</option>
                                </select>
                              }
                              <button type="button" class="icon-btn" title="Remover" aria-label="Remover foto" [disabled]="locked()" (click)="removePhoto(p.id)"><bo-icon name="trash" [size]="13" /></button>
                            </div>
                          </div>
                        }
                        @if (photos().length < maxPhotos) {
                          <label class="drop" [class.drop-first]="photos().length === 0">
                            <bo-icon name="camera" [size]="16" />
                            <span>Soltar imagem</span>
                            <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" [disabled]="locked()" (change)="onPick($event)" />
                          </label>
                        }
                      </div>
                      @if (photoError(); as pe) { <p class="error">{{ pe }}</p> }
                      <p class="footnote">JPG, PNG ou WebP · até 10 MB · mínimo 1200×1200 px · máx. {{ maxPhotos }} fotos</p>
                    }
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Informações">
                  <div class="card-body stack">
                    <bo-field label="Nome" [hint]="errors().name ?? ''">
                      <input id="f-name" class="bo-input" [class.err]="errors().name" [value]="form().name" [disabled]="locked()"
                        (input)="setName(val($event))" maxlength="80" />
                    </bo-field>
                    <div class="grid three">
                      <bo-field label="Categoria" [hint]="errors().category ?? ''">
                        <select id="f-category" class="bo-select" [class.err]="errors().category" [disabled]="locked()" (change)="set('category', val($event))">
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
                    <div class="desc-field">
                      <div class="desc-head">
                        <span class="label">Descrição</span>
                        <div class="toolbar">
                          <button type="button" class="icon-btn" title="Negrito" aria-label="Negrito" [disabled]="locked()" (click)="format('bold')"><strong>B</strong></button>
                          <button type="button" class="icon-btn" title="Lista" aria-label="Lista" [disabled]="locked()" (click)="format('list')">•</button>
                          <span class="count">{{ form().description.length }}/2000</span>
                        </div>
                      </div>
                      <textarea #desc class="bo-input area" maxlength="2000" aria-label="Descrição" [value]="form().description" [disabled]="locked()"
                        (input)="set('description', val($event))"></textarea>
                    </div>
                    <div class="details">
                      <span class="label">Detalhes técnicos</span>
                      @for (d of form().technicalDetails; track $index) {
                        <div class="detail-row">
                          <input class="bo-input" placeholder="Tecido" aria-label="Detalhe" [value]="d.label" [disabled]="locked()" (input)="setDetail($index, 'label', val($event))" />
                          <input class="bo-input" placeholder="Poliamida dry" aria-label="Valor do detalhe" [value]="d.value" [disabled]="locked()" (input)="setDetail($index, 'value', val($event))" />
                          <button type="button" class="icon-btn" aria-label="Remover detalhe" [disabled]="locked()" (click)="removeDetail($index)">
                            <bo-icon name="trash" [size]="13" />
                          </button>
                        </div>
                      }
                      <button type="button" class="link-btn" [disabled]="locked()" (click)="addDetail()">
                        <bo-icon name="plus" [size]="12" /> Adicionar detalhe
                      </button>
                    </div>
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Preço">
                  <div class="card-body">
                    <div class="grid four">
                      <bo-field label="Preço de venda" [hint]="errors().price ?? ''">
                        <span class="affix" [class.err]="errors().price">
                          <span class="pre">R$</span>
                          <input id="f-price" inputmode="decimal" aria-label="Preço de venda" [value]="form().price" [disabled]="locked()" (input)="set('price', val($event))" />
                        </span>
                      </bo-field>
                      <bo-field label='Preço "de"' [hint]="errors().compareAtPrice ?? (discount() ? 'Selo -' + discount() + '%' : '')">
                        <span class="affix" [class.err]="errors().compareAtPrice">
                          <span class="pre">R$</span>
                          <input id="f-compareAtPrice" inputmode="decimal" placeholder="opcional" aria-label='Preço "de"' [value]="form().compareAtPrice" [disabled]="locked()" (input)="set('compareAtPrice', val($event))" />
                        </span>
                      </bo-field>
                      <bo-field label="Custo" [hint]="errors().cost ?? ''">
                        <span class="affix" [class.err]="errors().cost">
                          <span class="pre">R$</span>
                          <input id="f-cost" inputmode="decimal" placeholder="opcional" aria-label="Custo" [value]="form().cost" [disabled]="locked()" (input)="set('cost', val($event))" />
                        </span>
                      </bo-field>
                      <div class="margin-field">
                        <span class="label">Margem</span>
                        <div class="margin">
                          @if (margin(); as m) {
                            <span class="pct" [class]="'pct tone-' + m.tone">{{ percent(m.percent) }}</span>
                            <span class="per-unit">{{ money(m.perUnitCents) }} / un.</span>
                          } @else {
                            <span class="pct none">—</span>
                            <span class="per-unit">informe o custo</span>
                          }
                        </div>
                      </div>
                    </div>
                    <p class="info-line">
                      <bo-icon name="ticket" [size]="13" />
                      Preço no Pix e parcelamento seguem o desconto global de Cupons & promoções.
                    </p>
                  </div>
                </bo-panel-card>

                <bo-panel-card [kicker]="variationsKicker()" title="Variações e estoque">
                  <button card-actions type="button" class="bo-mini-btn" [disabled]="locked()" (click)="openAxes()">
                    <bo-icon name="edit" [size]="13" /> Editar opções
                  </button>
                  <div class="card-body">
                    @if (form().axes.length === 0) {
                      <bo-field label="Estoque" hint="Produto sem variação">
                        <input class="bo-input narrow" type="number" min="0" [value]="cellValue(0)" [disabled]="locked()"
                          (input)="setStock(0, toInt(val($event)))" />
                      </bo-field>
                    } @else {
                      <div class="stock-grid" [style.grid-template-columns]="stockColumns()">
                        <span></span>
                        @for (col of colValues(); track col.id) { <span class="col-head">{{ col.label }}</span> }
                        <span class="col-head total-head">Total</span>
                        @for (row of rowValues(); track row.id) {
                          <span class="row-head">
                            <span class="swatch" [style.background]="row.hex || 'var(--nx-surface-2)'"></span>
                            {{ row.label }}
                          </span>
                          @for (col of colValues(); track col.id) {
                            <input type="number" min="0" [class]="'cell cell-' + cellState(skuIndex(row.id, col.id))"
                              [value]="cellValue(skuIndex(row.id, col.id))" [disabled]="locked()"
                              [attr.aria-label]="row.label + ' ' + col.label"
                              (input)="setStock(skuIndex(row.id, col.id), toInt(val($event)))"
                              (click)="onCellClick($event, skuIndex(row.id, col.id))" />
                          }
                          <span class="row-total">{{ rowTotal(row.id) }}</span>
                        }
                      </div>
                    }
                    <div class="grid-foot">
                      <span>SKU:
                        @if (isNew()) {
                          <input id="f-baseSku" class="sku-input" [class.err]="errors().baseSku" aria-label="SKU raiz" [value]="form().baseSku" [disabled]="locked()"
                            (input)="set('baseSku', val($event).toUpperCase())" />
                        } @else {
                          <code>{{ form().baseSku }}</code>
                        }<code>{{ skuSuffix() }}</code>
                      </span>
                      <span>Alerta de estoque baixo: &lt;
                        <input class="alert-input" type="number" min="0" aria-label="Alerta de estoque baixo" [value]="form().lowStockThreshold" [disabled]="locked()"
                          (input)="set('lowStockThreshold', toInt(val($event)))" /> un.
                      </span>
                      <span>Estoque somado de todos os locais · Alt+clique abre o SKU</span>
                    </div>
                    @if (errors().baseSku; as e) { <p class="error">{{ e }}</p> }
                  </div>
                </bo-panel-card>
              </div>

              <aside class="side">
                <bo-panel-card title="Publicação">
                  <div class="card-body">
                    <div class="toggle-row"><span>Visível no app</span>
                      <bo-toggle ariaLabel="Visível no app" [disabled]="locked()" [checked]="form().channels.app" (checkedChange)="setChannel('app', $event)" /></div>
                    <div class="toggle-row"><span>Visível no portal web</span>
                      <bo-toggle ariaLabel="Visível no portal web" [disabled]="locked()" [checked]="form().channels.web" (checkedChange)="setChannel('web', $event)" /></div>
                    <div class="toggle-row"><span>Permite retirada na arena</span>
                      <bo-toggle ariaLabel="Permite retirada na arena" [disabled]="locked()" [checked]="form().fulfillment.pickup" (checkedChange)="setFulfillment('pickup', $event)" /></div>
                    <div class="toggle-row"><span>Permite entrega</span>
                      <bo-toggle ariaLabel="Permite entrega" [disabled]="locked()" [checked]="form().fulfillment.delivery" (checkedChange)="setFulfillment('delivery', $event)" /></div>
                    <div class="toggle-row"><span>Destaque na vitrine</span>
                      <bo-toggle ariaLabel="Destaque na vitrine" [disabled]="locked()" [checked]="form().featured" (checkedChange)="set('featured', $event)" /></div>
                    @if (errors().channels ?? errors().fulfillment; as msg) {
                      <p id="f-channels" class="error">{{ msg }}</p>
                    }
                    <bo-field label="Selo" class="selo">
                      <select class="bo-select" [disabled]="locked()" (change)="setBadge(val($event))">
                        @for (b of badges; track b.id) {
                          <option [value]="b.id" [selected]="form().badge === b.id">{{ b.label }}</option>
                        }
                      </select>
                    </bo-field>
                  </div>
                </bo-panel-card>

                <bo-panel-card kicker="Como aparece no app" title="Prévia">
                  <div class="card-body">
                    <div class="preview">
                      <div class="cover">
                        @if (coverUrl()) { <img [src]="coverUrl()" alt="" /> } @else { <span class="cover-ph">Capa</span> }
                        @if (form().badge) { <span class="cover-pill">{{ badgeLabel() }}</span> }
                      </div>
                      <div class="p-info">
                        <div class="p-name">{{ form().name || 'Nome do produto' }}</div>
                        <div class="p-price">{{ money(priceCents() ?? 0) }}</div>
                        @if (compareCents() && discount()) {
                          <div class="p-was"><s>{{ money(compareCents()!) }}</s> · -{{ discount() }}%</div>
                        }
                      </div>
                    </div>
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Envio">
                  <div class="card-body">
                    <div class="grid two">
                      <bo-field label="Peso">
                        <span class="affix" [class.err]="errors().shipping">
                          <input id="f-shipping" inputmode="decimal" aria-label="Peso em kg" [value]="form().weightKg" [disabled]="locked()" (input)="set('weightKg', val($event))" />
                          <span class="suf">kg</span>
                        </span>
                      </bo-field>
                      <bo-field label="Dimensões">
                        <span class="affix" [class.err]="errors().shipping">
                          <input placeholder="C×L×A" aria-label="Dimensões em cm, comprimento × largura × altura" [value]="dimensions()" [disabled]="locked()" (change)="setDimensions(val($event))" />
                          <span class="suf">cm</span>
                        </span>
                      </bo-field>
                    </div>
                    @if (errors().shipping; as s) { <p class="error">{{ s }}</p> }
                  </div>
                </bo-panel-card>

                @if (!isNew()) {
                  <button type="button" class="bo-mini-btn danger-btn" [disabled]="locked()" (click)="archiveOpen.set(true)">
                    <bo-icon name="archive" [size]="13" />
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
    .head { display: flex; align-items: center; gap: 12px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { display: flex; align-items: center; gap: 6px; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .crumb a { color: inherit; text-decoration: none; }
    .crumb a:hover { color: var(--nx-text); }
    .title-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .spacer { flex: 1; }
    .bo-mini-btn.ghost { background: transparent; border-color: transparent; color: var(--nx-text-mute); padding: 0 11px; }
    .bo-mini-btn.ghost:disabled { opacity: 1; color: var(--nx-text-dim); }
    .state { padding: 48px 32px; color: var(--nx-text-mute); }
    .body { padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    .main, .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .card-body { margin-top: 14px; display: flex; flex-direction: column; min-width: 0; }
    .card-body.stack { gap: 14px; }
    .grid { display: grid; gap: 14px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .muted { color: var(--nx-text-dim); font-size: 12px; margin: 0; }
    .footnote { color: var(--nx-text-dim); font-size: 12px; margin: 12px 0 0; }
    .error { color: var(--nx-live); font-size: 12px; margin: 8px 0 0; }
    .bo-input.err, .bo-select.err, .affix.err { border-color: var(--nx-live); }
    .narrow { width: 120px; }
    .hex { max-width: 120px; }
    .is-disabled { opacity: 0.5; pointer-events: none; }
    label.bo-mini-btn { cursor: pointer; }

    /* Botão só de ícone, usado em fotos, detalhes e na barra da descrição. */
    .icon-btn { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text); cursor: pointer; font-size: 12px; }
    .icon-btn:disabled { opacity: 0.5; cursor: default; }
    .link-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; background: none; border: none; padding: 0; color: var(--nx-orange-500); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .link-btn:disabled { opacity: 0.5; cursor: default; }

    /* Campo com prefixo/sufixo (R$, kg, cm) dentro da mesma caixa, como no desenho. */
    .affix { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); }
    .affix:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .affix input { flex: 1; min-width: 0; height: 100%; background: none; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13.5px; }
    .affix input::placeholder { color: var(--nx-text-dim); }
    .affix .pre, .affix .suf { color: var(--nx-text-dim); font-size: 13.5px; }
    .affix .suf { font-size: 12px; }

    /* Fotos: capa ocupa 2×2, miniaturas de 110 px. */
    .photos { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; grid-auto-rows: 110px; gap: 10px; }
    .photo { position: relative; border-radius: 12px; overflow: hidden; background: var(--nx-surface-1); cursor: grab; }
    .photo.cover-photo { grid-column: span 1; grid-row: span 2; }
    .photo.failed { outline: 1px solid var(--nx-live); }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-pill { position: absolute; top: 8px; left: 8px; height: 22px; padding: 0 9px; display: inline-flex; align-items: center; border-radius: var(--nx-r-pill); background: var(--nx-orange-500); color: var(--nx-text-on-orange); font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(0, 0, 0, 0.45); }
    .bar span { display: block; height: 100%; background: var(--nx-orange-500); }
    .photo-err { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.72); color: #fff; font-size: 11px; padding: 8px; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; }
    .view-pill { position: absolute; bottom: 8px; left: 8px; height: 20px; padding: 0 8px; display: inline-flex; align-items: center; border-radius: var(--nx-r-pill); background: rgba(0, 0, 0, 0.65); color: #fff; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .photo-actions { position: absolute; top: 6px; right: 6px; display: none; flex-direction: column; align-items: flex-end; gap: 4px; }
    .photo:hover .photo-actions, .photo:focus-within .photo-actions { display: flex; }
    .bo-select.mini { height: 28px; font-size: 11px; width: 96px; padding: 0 22px 0 8px; }
    .drop { border: 1px dashed var(--nx-line-strong); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 12px; color: var(--nx-text-dim); cursor: pointer; }
    .drop:hover { border-color: rgba(255, 106, 26, 0.5); color: var(--nx-text-mute); }
    .drop.drop-first { grid-row: span 2; }

    /* Descrição com a barra de formatação na linha do rótulo. */
    .desc-field { display: flex; flex-direction: column; gap: 6px; }
    .desc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolbar { display: flex; align-items: center; gap: 4px; }
    .toolbar .icon-btn { width: 24px; height: 24px; }
    .count { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); margin-left: 6px; }
    .area { height: 96px; padding: 10px 12px; resize: vertical; line-height: 1.5; }
    .details { display: flex; flex-direction: column; gap: 8px; }
    .detail-row { display: flex; gap: 8px; align-items: center; }
    .detail-row .icon-btn { flex: none; }

    /* Preço */
    .margin-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .margin { height: 40px; display: flex; align-items: center; gap: 8px; }
    .pct { font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; }
    .pct.none { color: var(--nx-text-dim); }
    .per-unit { font-size: 12px; color: var(--nx-text-dim); white-space: nowrap; }
    .tone-green { color: var(--nx-win); }
    .tone-yellow { color: var(--nx-pending); }
    .tone-red { color: var(--nx-live); }
    .info-line { display: flex; align-items: center; gap: 10px; margin: 14px 0 0; font-size: 12.5px; color: var(--nx-text-mute); }
    .info-line bo-icon { color: var(--nx-orange-500); }

    /* Grade cor × tamanho */
    .stock-grid { display: grid; gap: 8px; align-items: center; }
    .col-head { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; color: var(--nx-text-dim); text-align: center; }
    .total-head { font-size: 9.5px; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; text-align: right; }
    .row-head { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; min-width: 0; }
    .swatch { width: 16px; height: 16px; border-radius: 50%; flex: none; border: 1px solid var(--nx-line-strong); }
    .cell { width: 100%; height: 40px; box-sizing: border-box; text-align: center; background: var(--nx-surface-1); border: 1px solid var(--nx-line); border-radius: 8px; color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; -moz-appearance: textfield; }
    .cell::-webkit-inner-spin-button, .cell::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    .cell:focus { outline: none; border-color: rgba(255, 106, 26, 0.5); }
    .cell-low { background: rgba(244, 197, 67, 0.08); border-color: rgba(244, 197, 67, 0.3); color: var(--nx-pending); }
    .cell-zero { background: rgba(255, 59, 48, 0.08); border-color: rgba(255, 59, 48, 0.3); color: var(--nx-live); }
    .row-total { text-align: right; font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; }
    .grid-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; margin-top: 14px; font-size: 12px; color: var(--nx-text-dim); }
    .grid-foot code { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-mute); }
    .sku-input, .alert-input { height: 24px; padding: 0 6px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); border-radius: 6px; color: var(--nx-text); font-family: var(--nx-font-mono); font-size: 11px; }
    .sku-input { width: 120px; }
    .alert-input { width: 44px; text-align: center; font-weight: 700; }
    .sku-input.err { border-color: var(--nx-live); }

    /* Lateral */
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 13px; }
    .selo { margin-top: 10px; }
    .preview { border-radius: var(--nx-r-3); overflow: hidden; border: 1px solid var(--nx-line); background: var(--nx-bg); }
    .cover { position: relative; aspect-ratio: 296 / 210; background: var(--nx-surface-1) repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 10px, transparent 10px 20px); display: grid; place-items: center; }
    .cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .cover-ph { font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .p-info { padding: 14px; }
    .p-name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; }
    .p-price { margin-top: 6px; font-family: var(--nx-font-display); font-weight: 800; font-size: 16px; }
    .p-was { margin-top: 2px; font-size: 11.5px; color: var(--nx-text-dim); }
    .danger-btn { width: 100%; justify-content: flex-start; background: transparent; border-color: transparent; color: var(--nx-live); padding: 0 11px; }
    .danger-btn:hover:not(:disabled) { background: rgba(255, 59, 48, 0.08); }
    .axis { border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .add { align-self: flex-start; }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }
    @media (max-width: 1100px) {
      .cols { grid-template-columns: 1fr; }
      .grid.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 640px) {
      .grid.three, .grid.two { grid-template-columns: 1fr; }
      .photos { grid-template-columns: repeat(2, 1fr); }
    }
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

  protected readonly productId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
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
  protected readonly variationsKicker = computed(() => {
    const axes = this.form().axes;
    const n = this.form().skus.length;
    return axes.length === 0 ? 'Sem variação' : `${axes.map((a) => a.label).join(' × ')} · ${n} ${n === 1 ? 'SKU' : 'SKUs'}`;
  });
  protected readonly stockColumns = computed(() => `180px repeat(${this.colValues().length}, minmax(56px, 1fr)) 80px`);
  protected readonly skuSuffix = computed(() =>
    this.form().axes.map((a) => '-{' + idFromLabel(a.label).toUpperCase().slice(0, 4) + '}').join(''),
  );
  protected readonly dimensions = computed(() => {
    const f = this.form();
    return formatDimensions(f.lengthCm, f.widthCm, f.heightCm);
  });
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
  protected percent(value: number): string {
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  }
  protected setDimensions(text: string): void {
    const d = parseDimensions(text);
    this.form.update((f) => ({ ...f, lengthCm: d.length, widthCm: d.width, heightCm: d.height }));
    this.clearErrors();
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
  /** Um lado por foto: marcar "frente" aqui tira a marcação da foto que era a frente. */
  protected setPhotoView(id: string, value: string): void {
    this.photos.update((p) => withView(p, id, value === 'frente' || value === 'costas' ? value : null));
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
        { id: tempId, url: URL.createObjectURL(file), path: '', colorValueId: null, view: null, progress: 0, error: null },
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
