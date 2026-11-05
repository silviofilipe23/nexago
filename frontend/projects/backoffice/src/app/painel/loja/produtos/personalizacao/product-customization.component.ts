import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../../data/callable-error';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { PanelShellComponent } from '../../../ui/panel-shell.component';
import { PillComponent } from '../../../ui/pill.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { centsToInput, formatBrl, parseBrlToCents } from '../../retirada/retirada-format';
import {
  DEFAULT_CUSTOMIZATION,
  FONT_LABELS,
  FORMAT_LABELS,
  PLACEMENT_LABELS,
  addOnCents,
  addOnLines,
  backKindLabel,
  sampleNumber,
  customizationErrors,
  sampleName,
  type CustomizationConfig,
  type FontId,
  type ImageFormat,
  type NamePlacement,
} from './data/customization';
import {
  areaBox,
  backBox,
  clampBox,
  nameBox,
  nameFontFraction,
  nameOnBack,
  roundPoint,
  type LayoutBox,
} from './data/customization-layout';
import type { PhotoSides } from '../data/photo-sides';
import { CustomizationRepository } from './data/customization.repository';

type LoadState = 'loading' | 'ok' | 'missing' | 'error';
type PriceKey = keyof CustomizationConfig['price'];
/** O que se arrasta na prévia: o nome, as costas ou uma área (`area:<id>`). */
type DragTarget = 'name' | 'back' | `area:${string}`;

interface Drag {
  target: DragTarget;
  startX: number;
  startY: number;
  /** Tamanho da peça na tela, em px. */
  width: number;
  height: number;
  from: LayoutBox;
}

/** Passo das setas: 1% da peça; com Shift, 5%. */
const KEY_STEP = 0.01;
const KEY_STEP_BIG = 0.05;

/** Loja › Produtos › <produto> › Personalização (tela 11). Rota própria: salva à parte do produto. */
@Component({
  selector: 'bo-product-customization',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    RouterLink,
    PanelShellComponent,
    PanelCardComponent,
    FieldComponent,
    IconComponent,
    PillComponent,
    ToggleComponent,
    ConfirmDialogComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="header">
        <div class="titles">
          <nav class="crumbs" aria-label="Caminho">
            <span>Loja</span>
            <bo-icon name="chevron-right" [size]="10" />
            <a routerLink="/painel/loja/produtos">Produtos</a>
            <bo-icon name="chevron-right" [size]="10" />
            <a [routerLink]="['/painel/loja/produtos', productId]">{{ productName() }}</a>
          </nav>
          <div class="title-row">
            <h1>Personalização</h1>
            <bo-pill [tone]="config().active ? 'green' : 'dim'">{{ config().active ? 'Ativa' : 'Desativada' }}</bo-pill>
            @if (state() === 'ok') {
              <bo-toggle
                ariaLabel="Personalização ativa no app"
                [checked]="config().active"
                [disabled]="saving()"
                (checkedChange)="set('active', $event)"
              />
            }
          </div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn ghost" disabled title="A vitrine do portal ainda não está no ar">
          Ver na loja
        </button>
        <button
          type="button"
          class="bo-mini-btn bo-mini-btn-primary"
          [class.attention]="dirty()"
          [disabled]="state() !== 'ok' || saving() || !dirty()"
          (click)="save()"
        >
          {{ saving() ? 'Salvando…' : 'Salvar alterações' }}
        </button>
      </header>

      <nav class="tabs" aria-label="Seções do produto">
        <a [routerLink]="['/painel/loja/produtos', productId]">Informações</a>
        <a [routerLink]="['/painel/loja/produtos', productId]">Preço</a>
        <a [routerLink]="['/painel/loja/produtos', productId]">Variações e estoque</a>
        <span class="active" aria-current="page">Personalização</span>
        <a [routerLink]="['/painel/loja/produtos', productId]">Publicação</a>
      </nav>

      @switch (state()) {
        @case ('loading') { <div class="state">Carregando…</div> }
        @case ('missing') { <div class="state">Produto não encontrado.</div> }
        @case ('error') {
          <div class="state">
            <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ loadError() }}</span></div>
            <button type="button" class="bo-mini-btn" (click)="reload()">Tentar de novo</button>
          </div>
        }
        @default {
          <div class="body">
            @if (notice(); as text) {
              <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ text }}</span></div>
            }
            @if (saveError(); as text) {
              <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ text }}</span></div>
            }
            @if (errors().active; as text) {
              <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ text }}</span></div>
            }

            <div class="grid">
              <div class="col">
              <!-- Nome -->
              <bo-panel-card>
                <div class="card-head">
                  <h2>Nome</h2>
                  <bo-toggle ariaLabel="Personalizar nome" [checked]="config().name.enabled" (checkedChange)="set('name.enabled', $event)" />
                </div>
                <fieldset class="stack" [disabled]="!config().name.enabled">
                  <div class="two">
                    <bo-field label="Máx. caracteres">
                      <input class="bo-input" inputmode="numeric" [value]="config().name.maxChars" (input)="set('name.maxChars', num($event))" />
                    </bo-field>
                    <bo-field label="Local">
                      <select class="bo-select" (change)="setPlacement($event)">
                        @for (p of placements; track p.id) {
                          <option [value]="p.id" [selected]="config().name.placement === p.id">{{ p.label }}</option>
                        }
                      </select>
                    </bo-field>
                  </div>

                  <div class="label">Fontes oferecidas</div>
                  <div class="list">
                    @for (f of config().name.fonts; track f.id; let i = $index) {
                      <div class="list-row">
                        <span class="sample" [class]="'sample font-' + f.id" aria-hidden="true">ABC</span>
                        <span class="grow">{{ fontLabel(f.id) }}</span>
                        <bo-toggle [ariaLabel]="'Fonte ' + fontLabel(f.id)" [checked]="f.enabled" (checkedChange)="set('name.fonts.' + i + '.enabled', $event)" />
                      </div>
                    }
                  </div>

                  <div class="row-between">
                    <span>Cores do nome</span>
                    <div class="swatches">
                      @for (hex of config().name.colors; track hex; let i = $index) {
                        <button
                          type="button"
                          class="swatch"
                          [style.background]="hex"
                          [attr.aria-label]="'Remover cor ' + hex"
                          [title]="'Remover ' + hex"
                          (click)="removeColor(i)"
                        ></button>
                      }
                      @if (config().name.colors.length < 8) {
                        <label class="swatch add" title="Adicionar cor">
                          +
                          <input type="color" aria-label="Adicionar cor" (change)="addColor($event)" />
                        </label>
                      }
                    </div>
                  </div>

                  <div class="row-between bordered">
                    <div>
                      <div>Bloquear palavrões e ofensas</div>
                      <button type="button" class="link" (click)="openBlocklist()">
                        Lista de palavras bloqueadas · {{ blocklist().length }} {{ blocklist().length === 1 ? 'termo' : 'termos' }}
                      </button>
                    </div>
                    <bo-toggle ariaLabel="Bloquear palavrões e ofensas" [checked]="config().name.blockOffensive" (checkedChange)="set('name.blockOffensive', $event)" />
                  </div>
                </fieldset>
                @if (errors().name; as text) { <p class="error">{{ text }}</p> }
              </bo-panel-card>

              <!-- Costas: abaixo do nome, imagem OU número (o atleta escolhe) -->
              <bo-panel-card>
                <div class="card-head">
                  <div>
                    <h2>Costas</h2>
                    <div class="hint">Abaixo do nome · o atleta escolhe imagem ou número</div>
                  </div>
                  <bo-toggle ariaLabel="Personalizar costas" [checked]="config().back.enabled" (checkedChange)="set('back.enabled', $event)" />
                </div>
                <fieldset class="stack" [disabled]="!config().back.enabled">
                  <div class="field-like">
                    <span class="label">O atleta pode enviar</span>
                    <div class="chips" role="group" aria-label="O que vale nas costas">
                      <button type="button" class="bo-chip" [class.active]="config().back.allowImage" [attr.aria-pressed]="config().back.allowImage" (click)="set('back.allowImage', !config().back.allowImage)">Imagem</button>
                      <button type="button" class="bo-chip" [class.active]="config().back.allowNumber" [attr.aria-pressed]="config().back.allowNumber" (click)="set('back.allowNumber', !config().back.allowNumber)">Número</button>
                    </div>
                  </div>
                  <div class="two">
                    @if (config().back.allowNumber) {
                      <bo-field label="Máx. dígitos">
                        <select class="bo-select" (change)="set('back.numberMaxDigits', num($event))">
                          @for (d of [1, 2, 3]; track d) {
                            <option [value]="d" [selected]="config().back.numberMaxDigits === d">{{ d }} ({{ d === 1 ? '0–9' : d === 2 ? '0–99' : '0–999' }})</option>
                          }
                        </select>
                      </bo-field>
                    }
                    <div class="field-like">
                      <span class="label">Área nas costas</span>
                      <div class="res">
                        <input class="bo-input" inputmode="numeric" aria-label="Largura da área das costas em cm" [value]="config().back.widthCm" (input)="set('back.widthCm', num($event))" />
                        <span>×</span>
                        <input class="bo-input" inputmode="numeric" aria-label="Altura da área das costas em cm" [value]="config().back.heightCm" (input)="set('back.heightCm', num($event))" />
                        <span class="unit">cm</span>
                      </div>
                    </div>
                  </div>
                  @if (config().back.allowImage) {
                    <p class="hint">A imagem das costas segue os formatos, o tamanho e a resolução mínima do card Imagem.</p>
                  }
                </fieldset>
                @if (errors().back; as text) { <p class="error">{{ text }}</p> }
              </bo-panel-card>
              </div>

              <div class="col">
                <!-- Imagem -->
                <bo-panel-card>
                  <div class="card-head">
                    <h2>Imagem</h2>
                    <bo-toggle ariaLabel="Personalizar imagem" [checked]="config().image.enabled" (checkedChange)="set('image.enabled', $event)" />
                  </div>
                  <fieldset class="stack" [disabled]="!config().image.enabled">
                    <div class="two">
                      <div class="field-like">
                        <span class="label">Formatos</span>
                        <div class="chips" role="group" aria-label="Formatos aceitos">
                          @for (f of formats; track f.id) {
                            <button type="button" class="bo-chip" [class.active]="hasFormat(f.id)" [attr.aria-pressed]="hasFormat(f.id)" (click)="toggleFormat(f.id)">
                              {{ f.label }}
                            </button>
                          }
                        </div>
                      </div>
                      <bo-field label="Tamanho máx.">
                        <span class="affix">
                          <input class="bo-input" inputmode="numeric" [value]="config().image.maxSizeMb" (input)="set('image.maxSizeMb', num($event))" />
                          <span class="post">MB</span>
                        </span>
                      </bo-field>
                    </div>
                    <div class="field-like">
                      <span class="label">Resolução mínima</span>
                      <div class="res">
                        <input class="bo-input" inputmode="numeric" aria-label="Largura mínima em px" [value]="config().image.minWidthPx" (input)="set('image.minWidthPx', num($event))" />
                        <span>×</span>
                        <input class="bo-input" inputmode="numeric" aria-label="Altura mínima em px" [value]="config().image.minHeightPx" (input)="set('image.minHeightPx', num($event))" />
                        <span class="unit">px</span>
                      </div>
                    </div>

                    <div class="label">Áreas de impressão</div>
                    <div class="list">
                      @for (a of config().image.areas; track a.id; let i = $index) {
                        <div class="list-row">
                          <span class="grow">{{ a.name }}</span>
                          <span class="mono dim">{{ a.widthCm }} × {{ a.heightCm }} cm</span>
                          <bo-toggle [ariaLabel]="'Área ' + a.name" [checked]="a.enabled" (checkedChange)="set('image.areas.' + i + '.enabled', $event)" />
                        </div>
                      }
                    </div>

                    <div class="row-between bordered">
                      <div>
                        <div>Remover fundo automaticamente</div>
                        <div class="hint">Quando a imagem não for transparente</div>
                      </div>
                      <bo-toggle ariaLabel="Remover fundo automaticamente" [checked]="config().image.removeBackground" (checkedChange)="set('image.removeBackground', $event)" />
                    </div>
                  </fieldset>
                  @if (errors().image; as text) { <p class="error">{{ text }}</p> }
                </bo-panel-card>

                <!-- Preço e produção -->
                <bo-panel-card title="Preço e produção">
                  <div class="stack">
                    <div class="three">
                      @if (config().name.enabled) {
                        <bo-field label="Só nome">
                          <span class="affix"><span class="pre">R$</span>
                            <input class="bo-input" inputmode="decimal" [value]="money(config().price.nameOnlyCents)" (change)="setPrice('nameOnlyCents', $event)" />
                          </span>
                        </bo-field>
                      }
                      @if (config().image.enabled) {
                        <bo-field label="Só imagem">
                          <span class="affix"><span class="pre">R$</span>
                            <input class="bo-input" inputmode="decimal" [value]="money(config().price.imageOnlyCents)" (change)="setPrice('imageOnlyCents', $event)" />
                          </span>
                        </bo-field>
                      }
                      @if (config().back.enabled) {
                        <bo-field label="Costas">
                          <span class="affix"><span class="pre">R$</span>
                            <input class="bo-input" inputmode="decimal" [value]="money(config().price.backCents)" (change)="setPrice('backCents', $event)" />
                          </span>
                        </bo-field>
                      }
                      @if (config().name.enabled && config().image.enabled) {
                        <bo-field label="Os dois">
                          <span class="affix"><span class="pre">R$</span>
                            <input class="bo-input" inputmode="decimal" [value]="money(config().price.bothCents)" (change)="setPrice('bothCents', $event)" />
                          </span>
                        </bo-field>
                      }
                    </div>
                    @if (errors().price; as text) { <p class="error">{{ text }}</p> }
                    <div class="two">
                      <bo-field label="Prazo de produção">
                        <span class="affix">
                          <input class="bo-input" inputmode="numeric" [value]="config().production.leadDays" (input)="set('production.leadDays', num($event))" />
                          <span class="post">dias úteis</span>
                        </span>
                      </bo-field>
                      <bo-field label="Estamparia">
                        <input class="bo-input" maxlength="80" placeholder="Fornecedor · técnica" [value]="config().production.printShop" (input)="set('production.printShop', text($event))" />
                      </bo-field>
                    </div>
                    @if (errors().production; as text) { <p class="error">{{ text }}</p> }
                    <div class="row-between bordered">
                      <div>
                        <div>Aprovação manual da arte</div>
                        <div class="hint">Sem aprovação, vai direto pra produção</div>
                      </div>
                      <bo-toggle ariaLabel="Aprovação manual da arte" [checked]="config().production.manualApproval" (checkedChange)="set('production.manualApproval', $event)" />
                    </div>
                    <div class="row-between bordered">
                      <div>
                        <div>Troca só por defeito</div>
                        <div class="hint">Aviso exibido na página e no checkout</div>
                      </div>
                      <bo-toggle ariaLabel="Troca só por defeito" [checked]="config().defectOnlyReturns" (checkedChange)="set('defectOnlyReturns', $event)" />
                    </div>
                  </div>
                </bo-panel-card>
              </div>

              <!-- Prévia -->
              <bo-panel-card kicker="O que o atleta vê" title="Prévia">
                <div class="mockup" [class.has-photo]="coverUrl()">
                  @if (coverUrl(); as url) {
                    <img class="photo" [src]="url" [alt]="productName()" />
                  }
                  <div class="segmented" role="radiogroup" aria-label="Lado">
                    <button type="button" role="radio" [attr.aria-checked]="side() === 'frente'" [class.on]="side() === 'frente'" (click)="side.set('frente')">Frente</button>
                    <button type="button" role="radio" [attr.aria-checked]="side() === 'costas'" [class.on]="side() === 'costas'" (click)="side.set('costas')">Costas</button>
                  </div>
                  <!-- Peça de referência 60 × 70 cm: as posições são frações dela, como no portal e no app. -->
                  <div class="garment">
                    @for (a of previewAreas(); track a.id) {
                      <span
                        class="drag area"
                        [class.dragging]="dragging() === a.target"
                        [style]="boxStyle(a.box)"
                        tabindex="0"
                        role="button"
                        [attr.aria-label]="'Área ' + a.name + ': arraste ou use as setas para posicionar'"
                        [title]="a.name"
                        (pointerdown)="startDrag($event, a.target)"
                        (pointermove)="onDrag($event)"
                        (pointerup)="endDrag()"
                        (pointercancel)="endDrag()"
                        (keydown)="onKey($event, a.target)"
                      ><span class="area-label">{{ a.name }}</span></span>
                    }
                    @if (previewBack(); as b) {
                      <span
                        class="drag back-area"
                        [class.dragging]="dragging() === 'back'"
                        [style]="boxStyle(b.box)"
                        tabindex="0"
                        role="button"
                        [attr.aria-label]="'Costas: arraste ou use as setas para posicionar'"
                        [title]="'Costas · ' + b.kind"
                        (pointerdown)="startDrag($event, 'back')"
                        (pointermove)="onDrag($event)"
                        (pointerup)="endDrag()"
                        (pointercancel)="endDrag()"
                        (keydown)="onKey($event, 'back')"
                      >
                        @if (b.number) {
                          <span class="back-number" [class]="'back-number font-' + b.font" [style.color]="b.color" [style.font-size.cqw]="b.fontCqw">{{ b.number }}</span>
                        } @else {
                          <span class="back-kind">imagem</span>
                        }
                      </span>
                    }
                    @if (previewName(); as n) {
                      <span
                        class="drag name-band"
                        [class.dragging]="dragging() === 'name'"
                        [style]="boxStyle(n.box)"
                        tabindex="0"
                        role="button"
                        [attr.aria-label]="'Nome: arraste ou use as setas para posicionar'"
                        (pointerdown)="startDrag($event, 'name')"
                        (pointermove)="onDrag($event)"
                        (pointerup)="endDrag()"
                        (pointercancel)="endDrag()"
                        (keydown)="onKey($event, 'name')"
                      >
                        <span class="name-sample" [class]="'name-sample font-' + n.font" [style.color]="n.color" [style.font-size.cqw]="n.fontCqw">{{ n.text }}</span>
                      </span>
                    }
                  </div>
                  <span class="mock-label">{{ coverUrl() ? 'Foto do produto' : 'Mockup' }} · {{ side() === 'frente' ? 'Frente' : 'Costas' }}</span>
                </div>
                <div class="drag-hint">
                  <span>Arraste o nome, as áreas e as costas até o lugar da peça. O atleta vê assim no app e no portal.</span>
                  @if (hasCustomPositions()) {
                    <button type="button" class="link" (click)="resetPositions()">Voltar ao padrão</button>
                  }
                </div>
                <dl class="summary">
                  <div><dt>Preço base</dt><dd>{{ brl(basePrice()) }}</dd></div>
                  @for (line of addOnLines(); track line.label) {
                    <div><dt>{{ line.label }}</dt><dd>+ {{ brl(line.cents) }}</dd></div>
                  }
                  <div class="total"><dt>Total</dt><dd>{{ brl(basePrice() + addOn()) }}</dd></div>
                </dl>
              </bo-panel-card>
            </div>
          </div>
        }
      }

      <bo-confirm-dialog
        [open]="blocklistOpen()"
        title="Palavras bloqueadas"
        description="Uma por linha. Vale para todos os produtos personalizáveis; acento e maiúscula não importam."
        confirmLabel="Salvar lista"
        size="md"
        [busy]="blocklistBusy()"
        [error]="blocklistError()"
        (confirmed)="saveBlocklist()"
        (dismissed)="blocklistOpen.set(false)"
      >
        <textarea class="bo-input terms" rows="10" aria-label="Palavras bloqueadas" [value]="blocklistDraft()" (input)="blocklistDraft.set(text($event))"></textarea>
      </bo-confirm-dialog>

      <bo-confirm-dialog
        [open]="leaveOpen()"
        title="Descartar alterações?"
        description="As mudanças na personalização ainda não foram salvas."
        confirmLabel="Descartar"
        tone="danger"
        (confirmed)="resolveLeave(true)"
        (dismissed)="resolveLeave(false)"
      />
    </bo-panel-shell>
  `,
  styles: `
    .header { display: flex; align-items: center; gap: 12px; padding: 20px 32px 14px; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumbs { display: flex; align-items: center; gap: 6px; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .crumbs a { color: inherit; text-decoration: none; }
    .crumbs a:hover { color: var(--nx-text); }
    .title-row { display: flex; align-items: center; gap: 12px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; color: var(--nx-text); }
    .spacer { flex: 1; }
    .bo-mini-btn.ghost { background: transparent; border-color: transparent; color: var(--nx-text-mute); }
    .bo-mini-btn-primary.attention { box-shadow: 0 0 0 3px rgba(255, 106, 26, 0.25), 0 6px 20px rgba(255, 106, 26, 0.3); }
    .tabs { display: flex; gap: 4px; padding: 0 32px; border-bottom: 1px solid var(--nx-line); overflow-x: auto; }
    .tabs a, .tabs span { flex: none; height: 38px; display: inline-flex; align-items: center; padding: 0 12px; border-bottom: 2px solid transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; text-decoration: none; }
    .tabs a:hover { color: var(--nx-text); }
    .tabs .active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); }
    .state { padding: 32px; color: var(--nx-text-dim); display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    @media (max-width: 1280px) { .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    @media (max-width: 820px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    fieldset { border: none; margin: 0; padding: 0; min-width: 0; }
    fieldset:disabled { opacity: 0.45; }
    .stack { display: flex; flex-direction: column; gap: 14px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .field-like { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .list { display: flex; flex-direction: column; gap: 6px; }
    .list-row { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 13px; color: var(--nx-text); }
    .grow { flex: 1; }
    .sample { width: 44px; font-size: 14px; color: var(--nx-text); }
    .font-bloco { font-family: var(--nx-font-display); font-weight: 800; letter-spacing: 0.02em; }
    .font-classica { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; }
    .font-mono { font-family: var(--nx-font-mono); font-weight: 700; }
    .row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--nx-text); }
    .bordered { padding-top: 12px; border-top: 1px solid var(--nx-line); }
    .hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .link { padding: 0; border: none; background: transparent; color: var(--nx-text-dim); font-size: 11.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
    .link:hover { color: var(--nx-orange-500); }
    .swatches { display: flex; align-items: center; gap: 6px; }
    .swatch { width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--nx-line-strong); cursor: pointer; padding: 0; position: relative; }
    .swatch:hover { box-shadow: 0 0 0 2px var(--nx-live); }
    .swatch.add { display: grid; place-items: center; background: transparent; color: var(--nx-text-mute); font-size: 14px; border-style: dashed; }
    .swatch.add:hover { box-shadow: none; color: var(--nx-orange-500); }
    .swatch.add input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .affix { position: relative; display: block; }
    .affix .pre { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--nx-text-dim); pointer-events: none; }
    .affix .pre + .bo-input { padding-left: 38px; }
    .affix .post { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--nx-text-dim); pointer-events: none; }
    .res { display: flex; align-items: center; gap: 8px; color: var(--nx-text-dim); }
    .res .bo-input { flex: 1; }
    .mono { font-family: var(--nx-font-mono); font-size: 11px; }
    .dim { color: var(--nx-text-dim); }
    .error { margin: 10px 0 0; font-size: 12px; color: var(--nx-live); }
    /* Mesmo quadro do portal (31:32, foto em cover) com a peça 6:7 no meio: o que se arrasta aqui cai igual lá e no app. */
    .mockup { position: relative; aspect-ratio: 31 / 32; display: grid; place-items: center; border-radius: var(--nx-r-3, 12px); overflow: hidden; background: repeating-linear-gradient(135deg, var(--nx-surface-1) 0 10px, var(--nx-surface-2) 10px 20px); touch-action: none; }
    .segmented { position: absolute; top: 10px; left: 10px; display: flex; gap: 3px; padding: 3px; border-radius: var(--nx-r-pill); background: rgba(0, 0, 0, 0.45); z-index: 2; }
    .segmented button { height: 28px; padding: 0 14px; border: none; border-radius: var(--nx-r-pill); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; cursor: pointer; }
    .segmented button.on { background: #f4f4f5; color: #111; }
    .mockup.has-photo { background: #0f1214; }
    .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .mockup.has-photo .mock-label { color: var(--nx-text-mute); text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8); }
    .garment { position: relative; height: 100%; aspect-ratio: 6 / 7; container-type: inline-size; outline: 1px dashed rgba(244, 244, 245, 0.12); outline-offset: -1px; z-index: 1; }
    .drag { position: absolute; display: grid; place-items: center; cursor: grab; user-select: none; touch-action: none; border-radius: 4px; }
    .drag:hover, .drag:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 1px; }
    .drag:focus-visible { z-index: 1; }
    .drag.dragging { z-index: 1; cursor: grabbing; outline: 2px solid var(--nx-orange-500); }
    .name-band { border: 1px dashed rgba(244, 244, 245, 0.35); }
    .name-sample { white-space: nowrap; line-height: 1.1; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); pointer-events: none; }
    .area { border: 1px dashed var(--nx-orange-500); background: rgba(255, 106, 26, 0.12); overflow: hidden; }
    .area-label { padding: 0 2px; font-family: var(--nx-font-mono); font-size: 8px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--nx-orange-500); text-align: center; line-height: 1.1; pointer-events: none; }
    .back-area { border: 1px dashed var(--nx-orange-500); background: rgba(255, 106, 26, 0.08); }
    .back-number { line-height: 1; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); pointer-events: none; }
    .back-kind { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-orange-500); pointer-events: none; }
    .drag-hint { margin-top: 8px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; font-size: 11.5px; color: var(--nx-text-dim); }
    .mock-label { position: absolute; bottom: 10px; left: 0; right: 0; text-align: center; font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .summary { margin: 14px 0 0; display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; }
    .summary div { display: flex; justify-content: space-between; }
    .summary dt { color: var(--nx-text-mute); }
    .summary dd { margin: 0; font-family: var(--nx-font-display); font-weight: 600; color: var(--nx-text); }
    .summary .total { padding-top: 10px; border-top: 1px solid var(--nx-line); }
    .summary .total dd { font-size: 16px; font-weight: 800; }
    .terms { height: auto; padding: 10px 13px; font-family: var(--nx-font-mono); font-size: 12.5px; resize: vertical; }
  `,
})
export class ProductCustomizationComponent {
  private readonly repository = inject(CustomizationRepository);
  protected readonly productId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly placements = (Object.keys(PLACEMENT_LABELS) as NamePlacement[]).map((id) => ({ id, label: PLACEMENT_LABELS[id] }));
  protected readonly formats = (Object.keys(FORMAT_LABELS) as ImageFormat[]).map((id) => ({ id, label: FORMAT_LABELS[id] }));

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly productName = signal('Produto');
  protected readonly basePrice = signal(0);
  private readonly sides = signal<PhotoSides>({ frente: null, costas: null });
  /** A foto do lado escolhido; sem ela, o mockup. */
  protected readonly coverUrl = computed(() => this.sides()[this.side()]);
  protected readonly config = signal<CustomizationConfig>(structuredClone(DEFAULT_CUSTOMIZATION));
  private readonly baseline = signal('');
  protected readonly blocklist = signal<string[]>([]);

  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly notice = signal('');
  protected readonly errors = signal<ReturnType<typeof customizationErrors>>({});
  protected readonly side = signal<'frente' | 'costas'>('costas');

  protected readonly blocklistOpen = signal(false);
  protected readonly blocklistDraft = signal('');
  protected readonly blocklistBusy = signal(false);
  protected readonly blocklistError = signal<string | null>(null);

  protected readonly leaveOpen = signal(false);
  private leaveResolve: ((ok: boolean) => void) | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly dirty = computed(() => this.state() === 'ok' && JSON.stringify(this.config()) !== this.baseline());
  protected readonly addOn = computed(() => addOnCents(this.config()));
  protected readonly addOnLines = computed(() => addOnLines(this.config()));

  /** Nome na 1ª fonte e cor ativas, no lado onde ele é estampado, na posição arrastada (ou a padrão). */
  protected readonly previewName = computed(() => {
    const c = this.config();
    if (!c.name.enabled || nameOnBack(c.name.placement) !== (this.side() === 'costas')) {
      return null;
    }
    const box = nameBox(c.name);
    const text = sampleName(c.name.maxChars);
    return {
      text,
      box,
      font: c.name.fonts.find((f) => f.enabled)?.id ?? 'bloco',
      color: c.name.colors[0] ?? '#ffffff',
      fontCqw: nameFontFraction(text.length, box.w) * 100,
    };
  });

  /** Elemento das costas, colado ao nome até ser arrastado. Número de exemplo quando vale número. */
  protected readonly previewBack = computed(() => {
    const c = this.config();
    if (!c.back.enabled || this.side() !== 'costas') {
      return null;
    }
    const box = backBox(c);
    const number = c.back.allowNumber ? sampleNumber(c.back.numberMaxDigits) : null;
    return {
      box,
      kind: backKindLabel(c),
      number,
      font: c.name.fonts.find((f) => f.enabled)?.id ?? 'bloco',
      color: c.name.colors[0] ?? '#ffffff',
      // Como no portal: 70% da altura da caixa (a peça é 6 × 7), sem passar da largura.
      fontCqw: Math.min(box.h * (7 / 6) * 100 * 0.7, (box.w * 100 * 0.9) / (Math.max(1, number?.length ?? 2) * 0.62)),
    };
  });

  protected readonly previewAreas = computed(() => {
    const c = this.config();
    return c.image.enabled && this.side() === 'frente'
      ? c.image.areas
          .filter((a) => a.enabled)
          .map((a) => ({ id: a.id, name: a.name, box: areaBox(a), target: `area:${a.id}` as DragTarget }))
          // Maior primeiro: a área pequena fica por cima e continua dando para pegar.
          .sort((x, y) => y.box.w * y.box.h - x.box.w * x.box.h)
      : [];
  });

  protected readonly hasCustomPositions = computed(() => {
    const c = this.config();
    return c.name.position != null || c.back.position != null || c.image.areas.some((a) => a.position != null);
  });

  protected readonly dragging = signal<DragTarget | null>(null);
  private drag: Drag | null = null;

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    try {
      const snap = await this.repository.load(this.productId);
      if (!snap) {
        this.state.set('missing');
        return;
      }
      this.productName.set(snap.productName);
      this.basePrice.set(snap.priceCents);
      this.sides.set(snap.sides);
      this.config.set(snap.config);
      this.baseline.set(JSON.stringify(snap.config));
      this.blocklist.set(snap.blocklist);
      this.errors.set({});
      this.state.set('ok');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  /** Edita uma cópia: o signal nunca é mutado no lugar. */
  protected patch(change: (c: CustomizationConfig) => unknown): void {
    const next = structuredClone(this.config());
    change(next);
    this.config.set(next);
    this.saveError.set('');
    if (Object.keys(this.errors()).length > 0) {
      this.errors.set(customizationErrors(next));
    }
  }

  /** Troca um valor pelo caminho ("name.fonts.0.enabled"), numa cópia. */
  protected set(path: string, value: unknown): void {
    this.patch((c) => {
      const keys = path.split('.');
      let target: any = c;
      for (const key of keys.slice(0, -1)) {
        target = target[key];
      }
      target[keys[keys.length - 1]!] = value;
    });
  }

  protected boxStyle(b: LayoutBox): string {
    return `left:${(b.cx - b.w / 2) * 100}%;top:${(b.cy - b.h / 2) * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;
  }

  /** Caixa atual do alvo (com a posição padrão quando não foi arrastado). */
  private boxOf(target: DragTarget): LayoutBox | null {
    const c = this.config();
    if (target === 'name') {
      return nameBox(c.name);
    }
    if (target === 'back') {
      return backBox(c);
    }
    const area = c.image.areas.find((a) => `area:${a.id}` === target);
    return area ? areaBox(area) : null;
  }

  /** Grava o centro do alvo, preso dentro da peça como os clientes desenham. */
  private moveTo(target: DragTarget, box: LayoutBox): void {
    const b = clampBox(box, target !== 'name');
    const point = roundPoint(b.cx, b.cy);
    this.patch((c) => {
      if (target === 'name') {
        c.name.position = point;
      } else if (target === 'back') {
        c.back.position = point;
      } else {
        const area = c.image.areas.find((a) => `area:${a.id}` === target);
        if (area) {
          area.position = point;
        }
      }
    });
  }

  protected startDrag(event: PointerEvent, target: DragTarget): void {
    const el = event.currentTarget as HTMLElement;
    const garment = el.parentElement?.getBoundingClientRect();
    const from = this.boxOf(target);
    if (event.button !== 0 || !garment || !from) {
      return;
    }
    event.preventDefault();
    el.focus();
    el.setPointerCapture(event.pointerId);
    this.drag = { target, startX: event.clientX, startY: event.clientY, width: garment.width, height: garment.height, from };
    this.dragging.set(target);
  }

  protected onDrag(event: PointerEvent): void {
    const d = this.drag;
    if (!d || d.width === 0 || d.height === 0) {
      return;
    }
    this.moveTo(d.target, {
      ...d.from,
      cx: d.from.cx + (event.clientX - d.startX) / d.width,
      cy: d.from.cy + (event.clientY - d.startY) / d.height,
    });
  }

  protected endDrag(): void {
    this.drag = null;
    this.dragging.set(null);
  }

  protected onKey(event: KeyboardEvent, target: DragTarget): void {
    const step = event.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    const box = this.boxOf(target);
    if (!move || !box) {
      return;
    }
    event.preventDefault();
    this.moveTo(target, { ...box, cx: box.cx + move[0], cy: box.cy + move[1] });
  }

  /** Tudo de volta ao lugar padrão (o do `Local` do nome, o da área, colado ao nome). */
  protected resetPositions(): void {
    this.patch((c) => {
      c.name.position = null;
      c.back.position = null;
      c.image.areas.forEach((a) => (a.position = null));
    });
  }

  /** Trocar o local leva o nome para o lugar padrão do novo local (e o lado certo). */
  protected setPlacement(event: Event): void {
    const placement = this.placement(event);
    this.patch((c) => {
      c.name.placement = placement;
      c.name.position = null;
    });
    this.side.set(nameOnBack(placement) ? 'costas' : 'frente');
  }

  protected removeColor(index: number): void {
    this.patch((c) => c.name.colors.splice(index, 1));
  }

  protected setPrice(key: PriceKey, event: Event): void {
    const cents = parseBrlToCents(this.text(event));
    this.patch((c) => (c.price[key] = cents ?? -1));
  }

  protected hasFormat(id: ImageFormat): boolean {
    return this.config().image.formats.includes(id);
  }

  protected toggleFormat(id: ImageFormat): void {
    this.patch((c) => {
      c.image.formats = c.image.formats.includes(id)
        ? c.image.formats.filter((f) => f !== id)
        : this.formats.map((f) => f.id).filter((f) => f === id || c.image.formats.includes(f));
    });
  }

  protected addColor(event: Event): void {
    const hex = this.text(event).toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex) && !this.config().name.colors.includes(hex)) {
      this.patch((c) => c.name.colors.push(hex));
    }
  }

  protected async save(): Promise<void> {
    const c = this.config();
    const errors = customizationErrors(c);
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    try {
      await this.repository.save(this.productId, c);
      this.baseline.set(JSON.stringify(c));
      this.showNotice('Personalização salva. Vale para os pedidos novos.');
    } catch (error) {
      const code = String((error as { code?: unknown })?.code ?? '');
      const message = String((error as { message?: unknown })?.message ?? '');
      this.saveError.set(
        code.includes('not-found') && (message === '' || message === 'NOT FOUND')
          ? 'Função ainda não publicada no servidor.'
          : callableErrorMessage(error),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected openBlocklist(): void {
    this.blocklistDraft.set(this.blocklist().join('\n'));
    this.blocklistError.set(null);
    this.blocklistOpen.set(true);
  }

  protected async saveBlocklist(): Promise<void> {
    const terms = this.blocklistDraft().split('\n').map((t) => t.trim()).filter(Boolean);
    this.blocklistBusy.set(true);
    this.blocklistError.set(null);
    try {
      await this.repository.saveBlocklist(terms);
      this.blocklist.set(
        [...new Set(terms.map((t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()))].sort(),
      );
      this.blocklistOpen.set(false);
      this.showNotice('Lista de palavras bloqueadas salva');
    } catch (error) {
      this.blocklistError.set(callableErrorMessage(error));
    } finally {
      this.blocklistBusy.set(false);
    }
  }

  /** Usado pelo `canDeactivate` da rota. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty() || this.saving()) {
      return true;
    }
    this.leaveOpen.set(true);
    return new Promise((resolve) => (this.leaveResolve = resolve));
  }

  protected resolveLeave(ok: boolean): void {
    this.leaveOpen.set(false);
    this.leaveResolve?.(ok);
    this.leaveResolve = null;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) {
      event.preventDefault();
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3500);
  }

  protected fontLabel(id: FontId): string {
    return FONT_LABELS[id];
  }

  protected placement(event: Event): NamePlacement {
    return this.placements.find((p) => p.id === this.text(event))?.id ?? 'costas_superior';
  }

  protected money(cents: number): string {
    return cents >= 0 ? centsToInput(cents) : '';
  }

  protected brl(cents: number): string {
    return formatBrl(cents);
  }

  protected num(event: Event): number {
    const n = Number(this.text(event).replace(/\D/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
