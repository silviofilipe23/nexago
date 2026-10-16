import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../../data/callable-error';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { PanelShellComponent } from '../../../ui/panel-shell.component';
import { PillComponent } from '../../../ui/pill.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import {
  ENTRY_SUBTYPES,
  addLine,
  costAlert,
  entryErrors,
  entryTotals,
  formFromDraft,
  matchNfeItems,
  newEntryForm,
  parseNfeXml,
  toEntryInput,
  type EntryErrors,
  type EntryForm,
  type EntryLine,
  type EntrySubtype,
  type NfeItem,
} from '../data/entry-form';
import { findByCode, qtyTone, skuKey, type StockLocation, type StockRow } from '../data/stock';
import { StockRepository } from '../data/stock.repository';
import { QtyStepperComponent } from '../ui/qty-stepper.component';
import { SkuPickerComponent } from '../ui/sku-picker.component';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const SOON = 'Em breve: depende de pedidos e lista de espera na Loja';

type LoadState = 'loading' | 'ok' | 'missing' | 'error';

function newEntryId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** 06a · Registrar entrada: compra, devolução, ajuste de inventário ou produção própria. */
@Component({
  selector: 'bo-stock-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ConfirmDialogComponent,
    FieldComponent,
    IconComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    QtyStepperComponent,
    RouterLink,
    SkuPickerComponent,
    ToggleComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <nav class="crumb" aria-label="Trilha">
            <span>Loja</span><bo-icon name="chevron-right" [size]="10" /><a routerLink="/painel/loja/estoque">Estoque</a>
          </nav>
          <div class="title-row">
            <h1>Registrar entrada</h1>
            <bo-pill tone="dim">Rascunho</bo-pill>
          </div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn ghost" [disabled]="busy()" (click)="cancel()">Cancelar</button>
        <button type="button" class="bo-mini-btn" [disabled]="busy() || state() !== 'ok'" (click)="saveDraft()">Salvar rascunho</button>
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || state() !== 'ok' || unmatched().length > 0"
          [title]="unmatched().length > 0 ? 'Vincule os itens da NF antes de confirmar' : ''" (click)="confirm()">
          @if (busy()) { <span class="bo-spinner small" aria-hidden="true"></span> } @else { <bo-icon name="check" [size]="13" /> }
          Confirmar entrada
        </button>
      </header>

      @switch (state()) {
        @case ('loading') { <div class="state">Carregando…</div> }
        @case ('missing') { <div class="state">Rascunho não encontrado. Ele pode já ter sido confirmado.</div> }
        @case ('error') { <div class="state">Não foi possível carregar o estoque. <button type="button" class="bo-mini-btn" (click)="load()">Tentar de novo</button></div> }
        @default {
          <div class="body">
            @if (error(); as e) { <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div> }
            @if (toast(); as t) { <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div> }

            <div class="cols">
              <div class="main">
                <bo-panel-card title="Origem da entrada">
                  <div class="card-body stack">
                    <div class="segmented" role="radiogroup" aria-label="Origem da entrada">
                      @for (s of subtypes; track s.id) {
                        <button type="button" role="radio" [attr.aria-checked]="form().subtype === s.id" [class.on]="form().subtype === s.id"
                          [disabled]="busy()" (click)="set('subtype', s.id)">{{ s.label }}</button>
                      }
                    </div>

                    @switch (form().subtype) {
                      @case ('compra') {
                        <div class="grid g-supplier">
                          <bo-field label="Fornecedor" [hint]="errors().supplier ?? ''">
                            <input id="f-supplier" class="bo-input" list="suppliers" [class.err]="errors().supplier" [value]="form().supplier" [disabled]="busy()" (input)="set('supplier', val($event))" />
                          </bo-field>
                          <bo-field label="Nº da nota fiscal" [hint]="errors().nfNumber ?? ''">
                            <input id="f-nfNumber" class="bo-input mono" [class.err]="errors().nfNumber" [value]="form().nfNumber" [disabled]="busy()" (input)="set('nfNumber', val($event))" />
                          </bo-field>
                          <bo-field label="Data de recebimento" [hint]="errors().receivedAt ?? ''">
                            <input class="bo-input" type="date" [class.err]="errors().receivedAt" [value]="form().receivedAt" [disabled]="busy()" (input)="set('receivedAt', val($event))" />
                          </bo-field>
                        </div>
                        <div class="grid two">
                          <bo-field label="Local de destino" [hint]="errors().toLocationId ?? ''">
                            <select id="f-toLocationId" class="bo-select" [disabled]="busy()" (change)="set('toLocationId', val($event))">
                              @for (l of locations(); track l.id) { <option [value]="l.id" [selected]="form().toLocationId === l.id">{{ l.name }}</option> }
                            </select>
                          </bo-field>
                          <bo-field label="Pedido de compra" hint="Opcional">
                            <input class="bo-input mono" placeholder="PC-0000" [value]="form().purchaseOrder" [disabled]="busy()" (input)="set('purchaseOrder', val($event))" />
                          </bo-field>
                        </div>
                      }
                      @case ('devolucao') {
                        <div class="grid three">
                          <bo-field label="Pedido de origem" [hint]="errors().originOrder ?? ''">
                            <input id="f-originOrder" class="bo-input mono" placeholder="NX-0000" [class.err]="errors().originOrder" [value]="form().originOrder" [disabled]="busy()" (input)="set('originOrder', val($event))" />
                          </bo-field>
                          <bo-field label="Motivo" [hint]="errors().reason ?? ''">
                            <input id="f-reason" class="bo-input" placeholder="Troca de tamanho" [class.err]="errors().reason" [value]="form().reason" [disabled]="busy()" (input)="set('reason', val($event))" />
                          </bo-field>
                          <bo-field label="Data de recebimento" [hint]="errors().receivedAt ?? ''">
                            <input class="bo-input" type="date" [value]="form().receivedAt" [disabled]="busy()" (input)="set('receivedAt', val($event))" />
                          </bo-field>
                        </div>
                        <div class="grid two">
                          <bo-field label="Local de destino">
                            <select id="f-toLocationId" class="bo-select" [disabled]="busy()" (change)="set('toLocationId', val($event))">
                              @for (l of locations(); track l.id) { <option [value]="l.id" [selected]="form().toLocationId === l.id">{{ l.name }}</option> }
                            </select>
                          </bo-field>
                        </div>
                      }
                      @case ('ajuste') {
                        <div class="grid three">
                          <bo-field label="Motivo" [hint]="errors().reason ?? 'Obrigatório. Quantidade negativa tira do saldo.'">
                            <input id="f-reason" class="bo-input" placeholder="Inventário semanal" [class.err]="errors().reason" [value]="form().reason" [disabled]="busy()" (input)="set('reason', val($event))" />
                          </bo-field>
                          <bo-field label="Data">
                            <input class="bo-input" type="date" [value]="form().receivedAt" [disabled]="busy()" (input)="set('receivedAt', val($event))" />
                          </bo-field>
                          <bo-field label="Local">
                            <select id="f-toLocationId" class="bo-select" [disabled]="busy()" (change)="set('toLocationId', val($event))">
                              @for (l of locations(); track l.id) { <option [value]="l.id" [selected]="form().toLocationId === l.id">{{ l.name }}</option> }
                            </select>
                          </bo-field>
                        </div>
                      }
                      @case ('producao') {
                        <div class="grid two">
                          <bo-field label="Local de destino">
                            <select id="f-toLocationId" class="bo-select" [disabled]="busy()" (change)="set('toLocationId', val($event))">
                              @for (l of locations(); track l.id) { <option [value]="l.id" [selected]="form().toLocationId === l.id">{{ l.name }}</option> }
                            </select>
                          </bo-field>
                          <bo-field label="Data">
                            <input class="bo-input" type="date" [value]="form().receivedAt" [disabled]="busy()" (input)="set('receivedAt', val($event))" />
                          </bo-field>
                        </div>
                      }
                    }
                    <datalist id="suppliers">
                      @for (s of suppliers(); track s) { <option [value]="s"></option> }
                    </datalist>
                  </div>
                </bo-panel-card>

                <bo-panel-card [kicker]="itemsKicker()" title="Itens recebidos" id="f-lines">
                  <label card-actions class="link-action" [class.is-disabled]="busy()">
                    <bo-icon name="download" [size]="13" /> Importar XML da NF
                    <input type="file" hidden accept=".xml,application/xml,text/xml" (change)="importXml($event)" />
                  </label>
                  <div class="card-body">
                    <bo-sku-picker [rows]="rows()" [disabled]="busy()" [scanHint]="scanHint()" (picked)="add($event)" (scanned)="onScanned($event)" />

                    @if (unmatched().length > 0) {
                      <div class="link-box">
                        <strong>{{ unmatched().length }} {{ unmatched().length === 1 ? 'item da NF não foi encontrado' : 'itens da NF não foram encontrados' }}</strong>
                        <span>Vincule cada um a um SKU (ou descarte) para liberar o Confirmar.</span>
                        @for (u of unmatched(); track $index) {
                          <div class="link-row">
                            <span class="link-name">{{ u.name }} <code>{{ u.ean || u.code }}</code> · {{ u.qty }} un.</span>
                            <select class="bo-select mini" aria-label="Vincular SKU" (change)="linkItem($index, val($event))">
                              <option value="">Vincular SKU…</option>
                              @for (r of rows(); track key(r)) { <option [value]="key(r)">{{ r.productName }} · {{ r.variantLabel }}</option> }
                            </select>
                            <button type="button" class="icon-btn" aria-label="Descartar item" (click)="dropUnmatched($index)">×</button>
                          </div>
                        }
                      </div>
                    }

                    <div class="table">
                      <div class="tr th">
                        <span>SKU</span><span>Código</span><span class="num">Atual {{ destShort() }}</span><span class="num">Qtd. recebida</span>
                        <span class="num">Custo un.</span><span class="num">Subtotal</span><span></span>
                      </div>
                      @for (line of form().lines; track line.key; let i = $index) {
                        @let r = rowOf(line.key);
                        <div class="tr">
                          <span class="sku">
                            <span class="thumb" aria-hidden="true">@if (r?.imageUrl) { <img [src]="r!.imageUrl" alt="" width="26" height="26" /> }</span>
                            <span class="who"><span class="name">{{ r?.productName ?? 'SKU removido' }}</span><span class="variant">{{ r?.variantLabel }}</span></span>
                          </span>
                          <code class="code">{{ r?.skuCode }}</code>
                          <span class="num qty" [class]="'num qty tone-' + destTone(r)">{{ destQty(r) }}</span>
                          <span class="num">
                            <bo-qty-stepper [value]="line.qty" [min]="form().subtype === 'ajuste' ? -destQty(r) : 1" [disabled]="busy()"
                              [ariaLabel]="'Quantidade de ' + (r?.productName ?? '')" (valueChange)="setQty(i, $event)" />
                          </span>
                          <span class="num">
                            <span class="affix" [class.warn]="alertOf(line) !== null">
                              <span class="pre">R$</span>
                              <input inputmode="decimal" [attr.aria-label]="'Custo unitário de ' + (r?.productName ?? '')" [value]="moneyInput(line.unitCostCents)" [disabled]="busy()" (change)="setCost(i, val($event))" />
                            </span>
                          </span>
                          <span class="num subtotal">{{ money(Math.max(0, line.qty) * line.unitCostCents) }}</span>
                          <button type="button" class="icon-btn" [attr.aria-label]="'Remover ' + (r?.productName ?? '')" [disabled]="busy()" (click)="remove(i)">×</button>
                        </div>
                      } @empty {
                        <div class="empty">Busque ou leia um código de barras para adicionar.</div>
                      }
                    </div>
                    @if (errors().lines; as e) { <p class="error">{{ e }}</p> }
                    @for (a of costAlerts(); track a.key) {
                      <div class="warn-box"><span class="bang">!</span>
                        <span>{{ a.label }}: custo {{ money(a.cost) }} está <strong>{{ a.pctLabel }}</strong> da última compra ({{ money(a.last) }}).</span>
                      </div>
                    }
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Observações e anexos">
                  <div class="card-body">
                    <div class="grid notes">
                      <bo-field label="Observação interna">
                        <textarea class="bo-input area" placeholder="Ex.: caixa 3 chegou avariada, 2 un. separadas para troca" [value]="form().note" [disabled]="busy()" (input)="set('note', val($event))"></textarea>
                      </bo-field>
                      <div class="attach-field">
                        <span class="label">Anexos</span>
                        <label class="attach" (dragover)="$event.preventDefault()" (drop)="dropFiles($event)">
                          @for (a of form().attachments; track a.path) {
                            <span class="file"><a [href]="a.url" target="_blank" rel="noopener">{{ a.name }}</a>
                              <button type="button" class="x" [attr.aria-label]="'Remover ' + a.name" (click)="removeAttachment(a.path); $event.preventDefault()">×</button></span>
                          }
                          @if (uploading()) { <span class="muted">Enviando…</span> }
                          <span class="add">+ adicionar</span>
                          <input type="file" hidden multiple accept="application/pdf,.xml,image/jpeg,image/png,image/webp" (change)="pickFiles($event)" />
                        </label>
                      </div>
                    </div>
                  </div>
                </bo-panel-card>
              </div>

              <aside class="side">
                <bo-panel-card title="Resumo">
                  <div class="card-body">
                    <div class="sum-row"><span>SKUs</span><strong>{{ totals().skus }}</strong></div>
                    <div class="sum-row"><span>Unidades</span><strong>{{ totals().units }}</strong></div>
                    @if (form().subtype === 'compra') {
                      <div class="sum-row"><span>Frete da compra</span>
                        <span class="affix small"><span class="pre">R$</span>
                          <input inputmode="decimal" aria-label="Frete da compra" [value]="moneyInput(form().freightCents)" [disabled]="busy()" (change)="setFreight(val($event))" />
                        </span>
                      </div>
                    }
                    <div class="sum-total"><span>Valor total em custo</span><strong>{{ money(totals().totalCents) }}</strong></div>
                    @if (form().subtype === 'compra' && form().freightCents > 0) { <p class="muted">O frete entra no custo médio, rateado pelo valor de cada linha.</p> }
                  </div>
                </bo-panel-card>

                <bo-panel-card kicker="Estoque somado de todos os locais" title="Depois da entrada">
                  <div class="card-body">
                    @for (line of form().lines; track line.key) {
                      @let r = rowOf(line.key);
                      <div class="after-row">
                        <span class="who"><span class="name">{{ r?.productName }}</span><span class="variant">{{ r?.variantLabel }}</span></span>
                        <span class="after"><span [class.tone-low]="r && r.total < r.threshold">{{ r?.total ?? 0 }}</span> → <strong class="tone-up">{{ (r?.total ?? 0) + line.qty }}</strong></span>
                      </div>
                    } @empty {
                      <p class="muted">Os itens aparecem aqui conforme você adiciona.</p>
                    }
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Ao confirmar">
                  <div class="card-body">
                    <div class="toggle-row"><span>Atualizar custo médio dos SKUs</span>
                      <bo-toggle ariaLabel="Atualizar custo médio dos SKUs" [checked]="form().updateAvgCost" [disabled]="busy()" (checkedChange)="set('updateAvgCost', $event)" /></div>
                    <div class="toggle-row soon" [title]="soon"><span>Liberar para venda imediatamente</span>
                      <bo-toggle ariaLabel="Liberar para venda imediatamente" [checked]="true" [disabled]="true" /></div>
                    <div class="toggle-row soon" [title]="soon"><span>Avisar clientes na lista de espera</span>
                      <bo-toggle ariaLabel="Avisar clientes na lista de espera" [checked]="false" [disabled]="true" /></div>
                    <div class="toggle-row soon" [title]="soon"><span>Imprimir etiquetas de SKU</span>
                      <bo-toggle ariaLabel="Imprimir etiquetas de SKU" [checked]="false" [disabled]="true" /></div>
                    <p class="muted">Lista de espera, etiquetas e bloqueio de venda chegam com os pedidos da Loja.</p>
                  </div>
                </bo-panel-card>
              </aside>
            </div>
          </div>
        }
      }
    </bo-panel-shell>

    <bo-confirm-dialog [open]="leaveOpen()" title="Descartar esta entrada?"
      description="As alterações que não foram salvas como rascunho serão perdidas." confirmLabel="Descartar" tone="danger"
      (confirmed)="resolveLeave(true)" (dismissed)="resolveLeave(false)" />
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .crumb { display: flex; align-items: center; gap: 6px; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .crumb a { color: inherit; text-decoration: none; }
    .title-row { display: flex; align-items: center; gap: 10px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .spacer { flex: 1; }
    .bo-mini-btn.ghost { background: transparent; border-color: transparent; color: var(--nx-text-mute); }
    .state { padding: 48px 32px; color: var(--nx-text-mute); display: flex; gap: 12px; align-items: center; }
    .body { padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    .main, .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .card-body { margin-top: 14px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .grid { display: grid; gap: 12px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid.g-supplier { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr); }
    .grid.notes { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .mono { font-family: var(--nx-font-mono); }
    .bo-input.err, .bo-select.err { border-color: var(--nx-live); }
    .muted { margin: 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .error { margin: 0; font-size: 12px; color: var(--nx-live); }
    .is-disabled { opacity: 0.5; pointer-events: none; }

    .segmented { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 4px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); }
    .segmented button { height: 32px; border: none; border-radius: 8px; background: none; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .segmented button.on { background: var(--nx-surface-2); color: var(--nx-text); box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset; }

    .link-action { display: inline-flex; align-items: center; gap: 6px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text-mute); cursor: pointer; }
    .link-action:hover { color: var(--nx-text); }
    .link-box { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: var(--nx-r-2); border: 1px solid rgba(244, 197, 67, 0.3); background: rgba(244, 197, 67, 0.06); font-size: 12px; color: var(--nx-text-mute); }
    .link-box strong { color: var(--nx-pending); }
    .link-row { display: flex; align-items: center; gap: 8px; }
    .link-name { flex: 1; min-width: 0; color: var(--nx-text); }
    .bo-select.mini { height: 30px; font-size: 12px; max-width: 260px; }

    .table { display: flex; flex-direction: column; }
    .tr { display: grid; grid-template-columns: minmax(180px, 2fr) 110px 74px 104px 110px 96px 28px; align-items: center; gap: 10px; min-height: 50px; border-top: 1px solid var(--nx-line); }
    .th { min-height: 0; padding: 6px 0 10px; border-top: none; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .num { text-align: center; display: flex; justify-content: center; }
    .sku { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .thumb { width: 26px; height: 26px; flex: none; border-radius: 6px; overflow: hidden; border: 1px solid var(--nx-line); background: repeating-linear-gradient(-45deg, var(--nx-surface-1), var(--nx-surface-1) 4px, var(--nx-surface-2) 4px, var(--nx-surface-2) 8px); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .variant { font-size: 11px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .code { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-mute); overflow: hidden; text-overflow: ellipsis; }
    .qty { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .subtotal { font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; justify-content: flex-end; }
    .tone-low { color: var(--nx-pending); }
    .tone-zero { color: var(--nx-live); }
    .tone-up { color: var(--nx-win); }
    .empty { padding: 28px 0; text-align: center; font-size: 12.5px; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }
    .icon-btn { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; border: none; background: none; color: var(--nx-text-dim); cursor: pointer; font-size: 15px; }
    .icon-btn:hover:not(:disabled) { background: var(--nx-surface-1); color: var(--nx-text); }

    .affix { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 8px; width: 100px; box-sizing: border-box; background: var(--nx-surface-1); border: 1px solid var(--nx-line); border-radius: 8px; }
    .affix.warn { border-color: rgba(244, 197, 67, 0.5); }
    .affix.small { width: 110px; }
    .affix input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; text-align: right; }
    .pre { font-size: 11px; color: var(--nx-text-dim); }
    .warn-box { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--nx-r-2); border: 1px solid rgba(244, 197, 67, 0.3); background: rgba(244, 197, 67, 0.06); font-size: 12px; color: var(--nx-text-mute); }
    .warn-box strong { color: var(--nx-pending); }
    .bang { color: var(--nx-pending); font-weight: 800; }

    .area { height: 92px; padding: 10px 12px; resize: vertical; }
    .attach-field { display: flex; flex-direction: column; gap: 8px; }
    .attach { flex: 1; min-height: 92px; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 8px; padding: 10px; border: 1px dashed var(--nx-line-strong); border-radius: var(--nx-r-2); font-size: 12px; color: var(--nx-text-dim); cursor: pointer; }
    .attach .add { color: var(--nx-orange-500); font-weight: 600; }
    .file { display: inline-flex; align-items: center; gap: 4px; }
    .file a { color: var(--nx-text-mute); }
    .file .x { border: none; background: none; color: var(--nx-text-dim); cursor: pointer; }

    .sum-row { display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; color: var(--nx-text-mute); }
    .sum-row strong { color: var(--nx-text); font-family: var(--nx-font-display); }
    .sum-total { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--nx-line); font-size: 12.5px; font-weight: 600; }
    .sum-total strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 18px; }
    .after-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .after { font-family: var(--nx-font-display); font-size: 12.5px; color: var(--nx-text-dim); white-space: nowrap; }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; }
    .toggle-row.soon span { color: var(--nx-text-dim); }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }
    @media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } .tr { grid-template-columns: minmax(160px, 2fr) 74px 104px 110px 28px; } .tr > .code, .tr > .subtotal, .th > span:nth-child(2), .th > span:nth-child(6) { display: none; } }
  `,
})
export class StockEntryComponent {
  private readonly repo = inject(StockRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly Math = Math;
  protected readonly soon = SOON;
  protected readonly subtypes = ENTRY_SUBTYPES;

  protected readonly state = signal<LoadState>('loading');
  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly errors = signal<EntryErrors>({});
  protected readonly rows = signal<StockRow[]>([]);
  protected readonly locations = signal<StockLocation[]>([]);
  protected readonly suppliers = signal<string[]>([]);
  protected readonly unmatched = signal<NfeItem[]>([]);
  protected readonly scanHint = signal('Cada leitura soma +1 no SKU.');
  protected readonly form = signal<EntryForm>(newEntryForm(newEntryId(), 'cd'));
  private baseline = '';
  private skipGuard = false;
  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;

  private readonly byKey = computed(() => new Map(this.rows().map((r) => [skuKey(r), r])));
  protected readonly totals = computed(() => entryTotals(this.form()));
  protected readonly itemsKicker = computed(() => `${this.totals().skus} SKUs · ${this.totals().units} unidades`);
  protected readonly destShort = computed(() => {
    const loc = this.locations().find((l) => l.id === this.form().toLocationId);
    return loc ? (loc.type === 'cd' ? 'no CD' : 'no local') : '';
  });
  protected readonly costAlerts = computed(() =>
    this.form().lines.flatMap((line) => {
      const r = this.rowOf(line.key);
      const pct = costAlert(line, r);
      if (pct === null || !r) return [];
      const label = `${r.productName}${r.variantLabel && r.variantLabel !== 'único' ? ' ' + r.variantLabel : ''}`;
      return [{ key: line.key, label, cost: line.unitCostCents, last: r.lastCostCents ?? 0, pctLabel: `${Math.round(Math.abs(pct))}% ${pct > 0 ? 'acima' : 'abaixo'}` }];
    }),
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [snap, sugg] = await Promise.all([this.repo.load(), this.repo.suggestions().catch(() => null)]);
      this.rows.set(snap.rows);
      this.locations.set(snap.locations);
      this.suppliers.set(sugg?.suppliers ?? []);
      const main = snap.locations.find((l) => l.type === 'cd')?.id ?? snap.locations[0]?.id ?? 'cd';
      const id = this.route.snapshot.paramMap.get('id');
      let form = newEntryForm(newEntryId(), main);
      if (id) {
        const draft = await this.repo.entryDraft(id);
        if (!draft) {
          this.state.set('missing');
          return;
        }
        form = formFromDraft(draft, main);
      }
      // "Repor" da tela de Estoque chega com o SKU pronto na linha.
      const pre = this.route.snapshot.queryParamMap.get('sku');
      const row = pre ? this.byKey().get(pre) : undefined;
      if (row && !id) {
        form = { ...form, lines: addLine(form.lines, row, Math.max(1, row.threshold - row.total)) };
      }
      this.form.set(form);
      this.baseline = JSON.stringify(form);
      this.state.set('ok');
    } catch {
      this.state.set('error');
    }
  }

  protected key(r: StockRow): string {
    return skuKey(r);
  }
  protected rowOf(key: string): StockRow | undefined {
    return this.byKey().get(key);
  }
  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  protected money(cents: number): string {
    return BRL.format(cents / 100);
  }
  protected moneyInput(cents: number): string {
    return (cents / 100).toFixed(2).replace('.', ',');
  }
  private parseMoney(text: string): number | null {
    const clean = text.trim().replace(/^R\$\s*/, '');
    const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
    const n = Number(normalized);
    return clean !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  }

  protected set<K extends keyof EntryForm>(key: K, value: EntryForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    if (Object.keys(this.errors()).length > 0) this.errors.set({});
    if (key === 'subtype' && value !== 'ajuste') {
      // Fora do ajuste não existe quantidade negativa.
      this.form.update((f) => ({ ...f, lines: f.lines.map((l) => ({ ...l, qty: Math.max(1, l.qty) })) }));
    }
  }

  protected destQty(r: StockRow | undefined): number {
    return r?.byLocation[this.form().toLocationId] ?? 0;
  }
  protected destTone(r: StockRow | undefined): string {
    return r ? qtyTone(this.destQty(r), r.threshold) : 'ok';
  }
  protected alertOf(line: EntryLine): number | null {
    return costAlert(line, this.rowOf(line.key));
  }

  protected add(row: StockRow, qty = 1): void {
    this.form.update((f) => ({ ...f, lines: addLine(f.lines, row, qty) }));
    this.errors.set({});
  }
  protected onScanned(code: string): void {
    const row = findByCode(this.rows(), code);
    if (!row) {
      this.scanHint.set(`Código ${code} não encontrado no catálogo.`);
      return;
    }
    this.add(row);
    this.scanHint.set(`+1 ${row.productName} ${row.variantLabel}`);
  }
  protected setQty(i: number, qty: number): void {
    this.form.update((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, qty } : l)) }));
  }
  protected setCost(i: number, text: string): void {
    const cents = this.parseMoney(text);
    if (cents === null) return;
    this.form.update((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, unitCostCents: cents } : l)) }));
  }
  protected setFreight(text: string): void {
    this.set('freightCents', this.parseMoney(text) ?? 0);
  }
  protected remove(i: number): void {
    this.form.update((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }

  // ---------- XML da NF ----------
  protected async importXml(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const nfe = parseNfeXml(await file.text());
    if (!nfe) {
      this.error.set('Este arquivo não é o XML de uma NF-e.');
      return;
    }
    this.error.set(null);
    const { matched, unmatched } = matchNfeItems(nfe.items, this.rows());
    this.form.update((f) => {
      let lines = f.lines;
      for (const { item, row } of matched) {
        lines = addLine(lines, row, item.qty).map((l) => (l.key === skuKey(row) ? { ...l, unitCostCents: item.unitCostCents } : l));
      }
      return {
        ...f,
        subtype: 'compra' as EntrySubtype,
        supplier: nfe.supplier || f.supplier,
        nfNumber: nfe.nfNumber || f.nfNumber,
        receivedAt: nfe.issuedAt || f.receivedAt,
        freightCents: nfe.freightCents || f.freightCents,
        lines,
      };
    });
    this.unmatched.set(unmatched);
    this.toast.set(`XML importado: ${matched.length} de ${nfe.items.length} itens encontrados.`);
  }
  protected linkItem(i: number, key: string): void {
    const row = this.rowOf(key);
    const item = this.unmatched()[i];
    if (!row || !item) return;
    this.form.update((f) => ({
      ...f,
      lines: addLine(f.lines, row, item.qty).map((l) => (l.key === key ? { ...l, unitCostCents: item.unitCostCents } : l)),
    }));
    this.dropUnmatched(i);
  }
  protected dropUnmatched(i: number): void {
    this.unmatched.update((u) => u.filter((_, idx) => idx !== i));
  }

  // ---------- anexos ----------
  protected pickFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.upload([...(input.files ?? [])]);
    input.value = '';
  }
  protected dropFiles(event: DragEvent): void {
    event.preventDefault();
    void this.upload([...(event.dataTransfer?.files ?? [])]);
  }
  private async upload(files: File[]): Promise<void> {
    const ok = files.filter((f) => /^(application\/pdf|application\/xml|text\/xml|image\/(jpeg|png|webp))$/.test(f.type) && f.size < 20 * 1024 * 1024);
    if (ok.length < files.length) this.error.set('Anexos aceitos: PDF, XML ou imagem, até 20 MB.');
    if (ok.length === 0) return;
    this.uploading.set(true);
    try {
      for (const file of ok) {
        const a = await this.repo.uploadAttachment(this.form().entryId, file);
        this.form.update((f) => ({ ...f, attachments: [...f.attachments, a] }));
      }
    } catch (err) {
      this.error.set(callableErrorMessage(err));
    } finally {
      this.uploading.set(false);
    }
  }
  protected removeAttachment(path: string): void {
    this.form.update((f) => ({ ...f, attachments: f.attachments.filter((a) => a.path !== path) }));
  }

  // ---------- salvar ----------
  protected async saveDraft(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.repo.saveEntryDraft(toEntryInput(this.form()));
      this.baseline = JSON.stringify(this.form());
      this.toast.set('Rascunho salvo');
      if (!this.route.snapshot.paramMap.get('id')) {
        this.skipGuard = true;
        await this.router.navigate(['/painel/loja/estoque/entrada', this.form().entryId], { replaceUrl: true });
        this.skipGuard = false;
      }
    } catch (err) {
      this.error.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirm(): Promise<void> {
    const errors = entryErrors(this.form());
    this.errors.set(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      document.getElementById('f-' + first)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { units } = await this.repo.confirmEntry(toEntryInput(this.form()));
      this.skipGuard = true;
      await this.router.navigate(['/painel/loja/estoque'], {
        state: { toast: `Entrada confirmada: ${units} ${Math.abs(units) === 1 ? 'unidade' : 'unidades'}.` },
      });
    } catch (err) {
      const fields = (err as { details?: { fields?: string[] } }).details?.fields ?? [];
      if (fields.includes('nfNumber')) this.errors.set({ nfNumber: 'NF já registrada.' });
      this.error.set(callableErrorMessage(err));
    } finally {
      this.skipGuard = false;
      this.busy.set(false);
    }
  }

  // ---------- sair ----------
  protected cancel(): void {
    void this.router.navigate(['/painel/loja/estoque']);
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.skipGuard || this.state() !== 'ok' || JSON.stringify(this.form()) === this.baseline) {
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
