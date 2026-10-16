import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../../data/callable-error';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { PanelShellComponent } from '../../../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../../../ui/pill.component';
import { findByCode, qtyTone, skuKey, type StockLocation, type StockRow } from '../data/stock';
import { StockRepository, type TransferDoc, type TransferStatus } from '../data/stock.repository';
import {
  COVERAGE_DAYS,
  addTransferLine,
  availableAt,
  fillSuggested,
  formatStamp,
  lowAfter,
  newTransferForm,
  suggestedQty,
  suggestedRows,
  toTransferInput,
  transferErrors,
  transferTotals,
  type TransferErrors,
  type TransferForm,
} from '../data/transfer-form';
import { transferLines, type Order } from '../../pedidos/data/order';
import { OrdersRepository } from '../../pedidos/data/orders.repository';
import { QtyStepperComponent } from '../ui/qty-stepper.component';
import { SkuPickerComponent } from '../ui/sku-picker.component';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABEL: Record<TransferStatus, string> = {
  rascunho: 'Rascunho',
  separacao: 'Separação',
  em_transito: 'Em trânsito',
  recebido: 'Recebido',
  cancelada: 'Cancelada',
};
const STATUS_TONE: Record<TransferStatus, PillTone> = {
  rascunho: 'dim',
  separacao: 'yellow',
  em_transito: 'orange',
  recebido: 'green',
  cancelada: 'dim',
};
const FLOW: TransferStatus[] = ['rascunho', 'separacao', 'em_transito', 'recebido'];

type LoadState = 'loading' | 'ok' | 'missing' | 'error';

/** 06b · Nova transferência (e o detalhe dela: separação → trânsito → recebimento). */
@Component({
  selector: 'bo-stock-transfer',
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
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <nav class="crumb" aria-label="Trilha">
            <span>Loja</span><bo-icon name="chevron-right" [size]="10" /><a routerLink="/painel/loja/estoque">Estoque</a>
          </nav>
          <div class="title-row">
            <h1>{{ editable() ? 'Nova transferência' : 'Transferência ' + (doc()?.code ?? '') }}</h1>
            <bo-pill [tone]="statusTone()">{{ doc()?.code ? doc()!.code + ' · ' : '' }}{{ statusLabel() }}</bo-pill>
          </div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn ghost" [disabled]="busy()" (click)="back()">{{ editable() ? 'Cancelar' : 'Voltar' }}</button>
        <button type="button" class="bo-mini-btn" [disabled]="state() !== 'ok' || form().lines.length === 0" (click)="print()">
          <bo-icon name="file" [size]="13" /> Romaneio
        </button>
        @switch (status()) {
          @case ('rascunho') {
            <button type="button" class="bo-mini-btn" [disabled]="busy() || state() !== 'ok'" (click)="save(false)">Salvar rascunho</button>
            <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || state() !== 'ok'" (click)="save(true)">
              @if (busy()) { <span class="bo-spinner small" aria-hidden="true"></span> } @else { <bo-icon name="swap" [size]="13" /> }
              Criar transferência
            </button>
          }
          @case ('separacao') {
            <button type="button" class="bo-mini-btn danger" [disabled]="busy()" (click)="cancelOpen.set(true)">Cancelar transferência</button>
            <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="advance('em_transito')">Marcar em trânsito</button>
          }
          @case ('em_transito') {
            <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="advance('recebido')">
              <bo-icon name="check" [size]="13" /> Confirmar recebimento
            </button>
          }
        }
      </header>

      @switch (state()) {
        @case ('loading') { <div class="state">Carregando…</div> }
        @case ('missing') { <div class="state">Transferência não encontrada.</div> }
        @case ('error') { <div class="state">Não foi possível carregar o estoque. <button type="button" class="bo-mini-btn" (click)="load()">Tentar de novo</button></div> }
        @default {
          <div class="body">
            @if (error(); as e) { <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div> }
            @if (toast(); as t) { <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div> }
            @if (orderNumbers().length > 0) {
              <div class="bo-info-card" role="note" style="margin-top: 0"><bo-icon name="file" [size]="16" />
                <span>Remessa {{ orderNumbers().length === 1 ? 'do pedido' : 'dos pedidos' }} {{ orderNumbers().join(', ') }}: ao criar, a reserva deles passa para esta transferência e eles ficam prontos para retirar quando a arena confirmar o recebimento.</span></div>
            }

            <div class="cols">
              <div class="main">
                <bo-panel-card title="Rota">
                  <div class="card-body">
                    <div class="route">
                      <label class="place" [class.err]="errors().fromLocationId">
                        <span class="label">Origem</span>
                        <select id="f-fromLocationId" aria-label="Origem" [disabled]="!editable() || busy()" (change)="setRoute('fromLocationId', val($event))">
                          @for (l of locations(); track l.id) { <option [value]="l.id" [selected]="form().fromLocationId === l.id">{{ l.name }}</option> }
                        </select>
                        <span class="sub">{{ int(originAvailable()) }} un. disponíveis</span>
                      </label>
                      <span class="arrow" aria-hidden="true">→</span>
                      <label class="place dest" [class.err]="errors().toLocationId">
                        <span class="label">Destino</span>
                        <select id="f-toLocationId" aria-label="Destino" [disabled]="!editable() || busy()" (change)="setRoute('toLocationId', val($event))">
                          @for (l of locations(); track l.id) { <option [value]="l.id" [selected]="form().toLocationId === l.id">{{ l.name }}</option> }
                        </select>
                        <span class="sub">{{ errors().toLocationId ?? 'Sem pedidos aguardando retirada' }}</span>
                      </label>
                    </div>
                  </div>
                </bo-panel-card>

                <bo-panel-card [kicker]="itemsKicker()" title="Itens" id="f-lines">
                  @if (editable()) {
                    <button card-actions type="button" class="link-action" [disabled]="busy()" (click)="fill()">
                      <bo-icon name="chevron-left" [size]="12" /> Preencher com sugerido
                    </button>
                  }
                  <div class="card-body">
                    @if (editable()) {
                      <div class="info-box" [class.calm]="!hasSuggestions()">
                        <bo-icon name="trend-up" [size]="14" />
                        @if (hasSuggestions()) {
                          <span>Sugestão para repor <strong>até o alerta de estoque</strong> na {{ destName() }}. Com saídas registradas, passa a cobrir <strong>{{ days }} dias de giro</strong> + pedidos pagos.</span>
                        } @else {
                          <span>Estoque da {{ destName() }} está acima do alerta em todos os SKUs.</span>
                        }
                      </div>
                      <bo-sku-picker [rows]="rows()" placeholder="Adicionar SKU à transferência" [disabled]="busy()" [scanHint]="scanHint()"
                        (picked)="add($event)" (scanned)="onScanned($event)" />
                    }

                    <div class="table">
                      <div class="tr th" [class.receiving]="receiving()">
                        <span>SKU</span><span class="num">No {{ originShort() }}</span><span class="num">Na {{ destShort() }}</span>
                        <span class="num">{{ receiving() ? 'Enviado' : 'Sugerido' }}</span>
                        <span class="num">{{ receiving() ? 'Recebido' : 'Transferir' }}</span>
                        <span class="num">{{ receiving() ? 'Diferença' : originShort() + ' após' }}</span><span></span>
                      </div>
                      @for (line of form().lines; track line.key; let i = $index) {
                        @let r = rowOf(line.key);
                        <div class="tr" [class.receiving]="receiving()">
                          <span class="sku">
                            <span class="thumb" aria-hidden="true">@if (r?.imageUrl) { <img [src]="r!.imageUrl" alt="" width="26" height="26" /> }</span>
                            <span class="who"><span class="name">{{ r?.productName ?? itemName(line.key) }}</span><span class="variant">{{ r?.variantLabel }}</span></span>
                          </span>
                          <span class="num qty">{{ r ? originQty(r) : '—' }}</span>
                          <span class="num qty" [class]="'num qty tone-' + destTone(r)">{{ r ? destQty(r) : '—' }}</span>
                          @if (receiving()) {
                            <span class="num qty">{{ line.qty }}</span>
                            <span class="num"><bo-qty-stepper [value]="receivedOf(line.key, line.qty)" [min]="0" [disabled]="busy()" ariaLabel="Unidades recebidas" (valueChange)="setReceived(line.key, $event)" /></span>
                            <span class="num qty" [class.tone-zero]="receivedOf(line.key, line.qty) !== line.qty">{{ receivedOf(line.key, line.qty) - line.qty }}</span>
                            <span></span>
                          } @else {
                            <span class="num qty sugg">{{ r ? suggested(r) : '—' }}</span>
                            <span class="num">
                              @if (editable()) {
                                <bo-qty-stepper [value]="line.qty" [max]="r ? available(r) : 0" [disabled]="busy()" [ariaLabel]="'Transferir ' + (r?.productName ?? '')" (valueChange)="setQty(i, $event)" />
                              } @else { <strong>{{ line.qty }}</strong> }
                            </span>
                            <span class="num qty" [class.tone-zero]="r && after(r, line.qty) < r.threshold">{{ r ? after(r, line.qty) : '—' }}</span>
                            @if (editable()) {
                              <button type="button" class="icon-btn" [attr.aria-label]="'Remover ' + (r?.productName ?? '')" [disabled]="busy()" (click)="remove(i)">×</button>
                            } @else { <span></span> }
                          }
                        </div>
                      } @empty {
                        <div class="empty">Adicione SKUs ou use Preencher com sugerido.</div>
                      }
                    </div>
                    @if (errors().lines; as e) { <p class="error">{{ e }}</p> }
                    @if (editable() && lowOrigin().length > 0) {
                      <div class="danger-box"><span class="bang">!</span>
                        <span>{{ lowOriginLabel() }} {{ lowOrigin().length === 1 ? 'fica' : 'ficam' }} abaixo do alerta no {{ originShort() }} —
                          <a [routerLink]="['/painel/loja/estoque/entrada/nova']" [queryParams]="{ sku: lowOriginKey() }">considere registrar uma entrada</a>.</span>
                      </div>
                    }
                    @if (receiving() && hasDivergence()) {
                      <bo-field label="Motivo da divergência" hint="Vira um ajuste de estoque no destino, com o seu nome.">
                        <input class="bo-input" placeholder="Ex.: 1 un. chegou avariada" [value]="divergenceReason()" (input)="divergenceReason.set(val($event))" />
                      </bo-field>
                    }
                  </div>
                </bo-panel-card>
              </div>

              <aside class="side">
                <bo-panel-card title="Logística">
                  <div class="card-body">
                    <bo-field label="Transporte">
                      <input class="bo-input" list="transports" placeholder="Van própria · placa" [value]="form().transport" [disabled]="!editable() || busy()" (input)="set('transport', val($event))" />
                    </bo-field>
                    <div class="grid two">
                      <bo-field label="Saída"><input class="bo-input" type="datetime-local" [value]="form().departAt" [disabled]="!editable() || busy()" (input)="set('departAt', val($event))" /></bo-field>
                      <bo-field label="Chegada prevista"><input class="bo-input" type="datetime-local" [value]="form().arriveAt" [disabled]="!editable() || busy()" (input)="set('arriveAt', val($event))" /></bo-field>
                    </div>
                    <bo-field label="Recebe na arena">
                      <input class="bo-input" list="receivers" placeholder="Nome · função" [value]="form().receiver" [disabled]="!editable() || busy()" (input)="set('receiver', val($event))" />
                    </bo-field>
                    <bo-field label="Observação">
                      <textarea class="bo-input area" placeholder="Instruções para separação ou recebimento" [value]="form().note" [disabled]="!editable() || busy()" (input)="set('note', val($event))"></textarea>
                    </bo-field>
                    <datalist id="transports">@for (s of transports(); track s) { <option [value]="s"></option> }</datalist>
                    <datalist id="receivers">@for (s of receivers(); track s) { <option [value]="s"></option> }</datalist>
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Resumo">
                  <div class="card-body">
                    <div class="sum-row"><span>Unidades</span><strong>{{ totals().units }}</strong></div>
                    <div class="sum-row" title="Em breve: depende do cadastro de embalagem"><span>Volumes estimados</span><strong class="dim">—</strong></div>
                    <div class="sum-row" title="Em breve: depende dos pedidos da Loja"><span>Pedidos atendidos</span><strong class="dim">—</strong></div>
                    <div class="sum-total"><span>Valor em custo</span><strong>{{ totals().costCents === null ? '—' : money(totals().costCents!) }}</strong></div>
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Fluxo">
                  <div class="card-body">
                    <ol class="flow">
                      @for (step of flow; track step; let i = $index) {
                        <li [class.done]="stepIndex() > i" [class.current]="stepIndex() === i">
                          <span class="dot"></span>
                          <span class="step"><strong>{{ flowLabel(step) }}</strong><span>{{ flowSub(step) }}</span></span>
                        </li>
                      }
                    </ol>
                    <p class="muted">Unidades ficam como <strong>“em trânsito”</strong> e só entram no estoque da arena após a conferência.</p>
                  </div>
                </bo-panel-card>
              </aside>
            </div>
          </div>
        }
      }
    </bo-panel-shell>

    <!-- Romaneio: só aparece na impressão. -->
    <section class="romaneio" aria-hidden="true">
      <h1>Romaneio {{ doc()?.code ?? '' }}</h1>
      <p>{{ originName() }} → {{ destName() }} · Saída {{ stamp(form().departAt) || '—' }} · Chegada {{ stamp(form().arriveAt) || '—' }}</p>
      <p>Transporte: {{ form().transport || '—' }} · Recebe: {{ form().receiver || '—' }}</p>
      <table>
        <thead><tr><th>SKU</th><th>Produto</th><th>Variação</th><th>Qtd.</th><th>Conferido</th></tr></thead>
        <tbody>
          @for (line of form().lines; track line.key) {
            @let r = rowOf(line.key);
            <tr><td>{{ r?.skuCode }}</td><td>{{ r?.productName ?? itemName(line.key) }}</td><td>{{ r?.variantLabel }}</td><td>{{ line.qty }}</td><td></td></tr>
          }
        </tbody>
      </table>
      <div class="sign"><span>Separado por</span><span>Recebido por</span></div>
    </section>

    <bo-confirm-dialog [open]="cancelOpen()" title="Cancelar transferência?"
      description="As unidades reservadas voltam a ficar disponíveis na origem." confirmLabel="Cancelar transferência" tone="danger" [busy]="busy()"
      (confirmed)="advance('cancelar')" (dismissed)="cancelOpen.set(false)" />
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
    .bo-mini-btn.danger { color: var(--nx-live); border-color: rgba(255, 59, 48, 0.35); background: rgba(255, 59, 48, 0.08); }
    .state { padding: 48px 32px; color: var(--nx-text-mute); display: flex; gap: 12px; align-items: center; }
    .body { padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    .main, .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .card-body { margin-top: 14px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .grid.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .muted { margin: 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .error { margin: 0; font-size: 12px; color: var(--nx-live); }

    .route { display: grid; grid-template-columns: minmax(0, 1fr) 32px minmax(0, 1fr); align-items: center; gap: 10px; }
    .place { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); cursor: pointer; }
    .place.dest { background: rgba(255, 106, 26, 0.08); border-color: rgba(255, 106, 26, 0.4); }
    .place.err { border-color: var(--nx-live); }
    .place select { appearance: none; background: none; border: none; outline: none; padding: 0; color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; cursor: pointer; }
    .place select option { background: var(--nx-surface-0); }
    .sub { font-size: 11px; color: var(--nx-text-dim); }
    .arrow { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; border: 1px solid var(--nx-line-strong); color: var(--nx-orange-500); }

    .link-action { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text-mute); cursor: pointer; }
    .link-action:hover:not(:disabled) { color: var(--nx-text); }
    .info-box, .danger-box { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--nx-r-2); font-size: 12px; color: var(--nx-text-mute); }
    .info-box { background: rgba(255, 106, 26, 0.08); border: 1px solid rgba(255, 106, 26, 0.3); }
    .info-box bo-icon { color: var(--nx-orange-500); }
    .info-box.calm { background: var(--nx-surface-1); border-color: var(--nx-line); }
    .info-box strong { color: var(--nx-text); }
    .danger-box { background: rgba(255, 59, 48, 0.06); border: 1px solid rgba(255, 59, 48, 0.3); }
    .danger-box a { color: var(--nx-live); }
    .bang { color: var(--nx-live); font-weight: 800; }

    .table { display: flex; flex-direction: column; }
    .tr { display: grid; grid-template-columns: minmax(180px, 2fr) 70px 78px 78px 104px 78px 28px; align-items: center; gap: 10px; min-height: 50px; border-top: 1px solid var(--nx-line); }
    .th { min-height: 0; padding: 6px 0 10px; border-top: none; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .num { text-align: center; display: flex; justify-content: center; }
    .sku { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .thumb { width: 26px; height: 26px; flex: none; border-radius: 6px; overflow: hidden; border: 1px solid var(--nx-line); background: repeating-linear-gradient(-45deg, var(--nx-surface-1), var(--nx-surface-1) 4px, var(--nx-surface-2) 4px, var(--nx-surface-2) 8px); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .variant { font-size: 11px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qty { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .sugg { color: var(--nx-orange-500); }
    .tone-low { color: var(--nx-pending); }
    .tone-zero { color: var(--nx-live); }
    .empty { padding: 28px 0; text-align: center; font-size: 12.5px; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }
    .icon-btn { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; border: none; background: none; color: var(--nx-text-dim); cursor: pointer; font-size: 15px; }
    .icon-btn:hover:not(:disabled) { background: var(--nx-surface-1); color: var(--nx-text); }
    .area { height: 80px; padding: 10px 12px; resize: vertical; }

    .sum-row { display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; color: var(--nx-text-mute); }
    .sum-row strong { color: var(--nx-text); font-family: var(--nx-font-display); }
    .sum-row strong.dim { color: var(--nx-text-dim); }
    .sum-total { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--nx-line); font-size: 12.5px; font-weight: 600; }
    .sum-total strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 18px; }

    .flow { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; position: relative; }
    .flow li { display: flex; gap: 10px; position: relative; }
    .flow li:not(:last-child)::after { content: ''; position: absolute; left: 5px; top: 16px; bottom: -14px; width: 1px; background: var(--nx-line-strong); }
    .dot { width: 11px; height: 11px; margin-top: 3px; flex: none; border-radius: 50%; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); }
    .flow li.done .dot { background: var(--nx-text-dim); border-color: var(--nx-text-dim); }
    .flow li.current .dot { background: var(--nx-orange-500); border-color: var(--nx-orange-500); box-shadow: 0 0 0 4px rgba(255, 106, 26, 0.18); }
    .step { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
    .step span { font-size: 11px; color: var(--nx-text-dim); }
    .flow li:not(.current):not(.done) strong { color: var(--nx-text-mute); font-weight: 500; }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }

    .romaneio { display: none; }
    @media print {
      bo-panel-shell, bo-confirm-dialog { display: none !important; }
      .romaneio { display: block; color: #000; font-family: var(--nx-font-ui); padding: 24px; }
      .romaneio h1 { font-size: 20px; margin: 0 0 8px; color: #000; }
      .romaneio p { margin: 0 0 4px; font-size: 12px; }
      .romaneio table { width: 100%; margin-top: 16px; border-collapse: collapse; font-size: 12px; }
      .romaneio th, .romaneio td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
      .romaneio .sign { display: flex; gap: 40px; margin-top: 48px; font-size: 12px; }
      .romaneio .sign span { flex: 1; border-top: 1px solid #000; padding-top: 6px; }
    }
    @media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
  `,
})
export class StockTransferComponent {
  private readonly repo = inject(StockRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly ordersRepo = inject(OrdersRepository);
  /** Pedidos que esta remessa leva (02 › "Criar remessa p/ arena"). */
  private orderIds: string[] = [];
  protected readonly orderNumbers = signal<string[]>([]);

  protected readonly days = COVERAGE_DAYS;
  protected readonly flow = FLOW;

  protected readonly state = signal<LoadState>('loading');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly errors = signal<TransferErrors>({});
  protected readonly rows = signal<StockRow[]>([]);
  protected readonly locations = signal<StockLocation[]>([]);
  protected readonly transports = signal<string[]>([]);
  protected readonly receivers = signal<string[]>([]);
  protected readonly doc = signal<TransferDoc | null>(null);
  protected readonly form = signal<TransferForm>(newTransferForm('', ''));
  protected readonly received = signal<Record<string, number>>({});
  protected readonly divergenceReason = signal('');
  protected readonly scanHint = signal('Cada leitura soma +1 no SKU.');
  protected readonly cancelOpen = signal(false);

  protected readonly status = computed<TransferStatus>(() => this.doc()?.status ?? 'rascunho');
  protected readonly editable = computed(() => this.status() === 'rascunho');
  protected readonly receiving = computed(() => this.status() === 'em_transito');
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);
  protected readonly statusTone = computed(() => STATUS_TONE[this.status()]);
  protected readonly stepIndex = computed(() => FLOW.indexOf(this.status()));

  private readonly byKey = computed(() => new Map(this.rows().map((r) => [skuKey(r), r])));
  private readonly rowOfFn = (key: string) => this.byKey().get(key);
  protected readonly totals = computed(() => transferTotals(this.form(), this.rowOfFn));
  protected readonly itemsKicker = computed(() => `${this.totals().skus} SKUs · ${this.totals().units} unidades`);
  protected readonly lowOrigin = computed(() => lowAfter(this.form(), this.rowOfFn));
  protected readonly hasSuggestions = computed(() => suggestedRows(this.rows(), this.form()).length > 0);
  protected readonly originAvailable = computed(() =>
    this.rows().reduce((n, r) => n + availableAt(r, this.form().fromLocationId), 0),
  );
  protected readonly hasDivergence = computed(() =>
    this.form().lines.some((l) => this.receivedOf(l.key, l.qty) !== l.qty),
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
      this.transports.set(sugg?.transports ?? []);
      this.receivers.set(sugg?.receivers ?? []);
      const cd = snap.locations.find((l) => l.type === 'cd')?.id ?? snap.locations[0]?.id ?? '';
      const arena = snap.locations.find((l) => l.id !== cd)?.id ?? '';
      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        const doc = await this.repo.transfer(id);
        if (!doc) {
          this.state.set('missing');
          return;
        }
        this.doc.set(doc);
        this.form.set({
          fromLocationId: doc.fromLocationId,
          toLocationId: doc.toLocationId,
          lines: doc.items.map((i) => ({ key: `${i.productId}/${i.skuId}`, productId: i.productId, skuId: i.skuId, qty: i.qty })),
          transport: doc.transport,
          departAt: doc.departAt,
          arriveAt: doc.arriveAt,
          receiver: doc.receiver,
          note: doc.note,
        });
        if (doc.status === 'rascunho' && doc.orderIds?.length) await this.attachOrders(doc.orderIds, false);
      } else {
        let form = newTransferForm(cd, arena);
        // "Transferir" da tela de Estoque chega com o SKU pronto na linha.
        const pre = this.route.snapshot.queryParamMap.get('sku');
        const row = pre ? this.byKey().get(pre) : undefined;
        if (row) {
          form = { ...form, lines: addTransferLine([], row, Math.max(1, suggestedQty(row, form))) };
        }
        this.form.set(form);
        const pedidos = (this.route.snapshot.queryParamMap.get('pedidos') ?? '').split(',').filter(Boolean);
        if (pedidos.length > 0) await this.attachOrders(pedidos, true);
      }
      this.state.set('ok');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Pedidos na remessa: a reserva deles na origem passa para a transferência, então
   * aqui ela conta como disponível (o servidor faz a mesma troca na mesma transação).
   */
  private async attachOrders(ids: string[], prefill: boolean): Promise<void> {
    const orders = (await this.ordersRepo.many(ids)).filter((o) => o.reservation?.active && !o.transferId);
    if (orders.length === 0) return;
    this.orderIds = orders.map((o) => o.id);
    this.orderNumbers.set(orders.map((o) => '#' + o.number));
    const held = new Map<string, { qty: number; from: string }>();
    for (const o of orders as Order[]) {
      for (const i of o.items) {
        const key = `${i.productId}/${i.skuId}`;
        const cur = held.get(key);
        held.set(key, { qty: (cur?.qty ?? 0) + i.qty, from: o.reservation!.locationId });
      }
    }
    this.rows.update((rows) =>
      rows.map((r) => {
        const h = held.get(skuKey(r));
        if (!h) return r;
        const reserved = { ...r.reservedByLocation, [h.from]: Math.max(0, (r.reservedByLocation[h.from] ?? 0) - h.qty) };
        return { ...r, reservedByLocation: reserved, reserved: Math.max(0, r.reserved - h.qty) };
      }),
    );
    if (prefill) {
      const first = orders[0]!;
      this.form.update((f) => ({
        ...f,
        fromLocationId: first.reservation!.locationId,
        toLocationId: first.delivery.locationId ?? f.toLocationId,
        lines: transferLines(orders).map((l) => ({ key: `${l.productId}/${l.skuId}`, ...l })),
        note: f.note || `Pedidos ${orders.map((o) => '#' + o.number).join(', ')}`,
      }));
    }
  }

  protected rowOf(key: string): StockRow | undefined {
    return this.byKey().get(key);
  }
  protected itemName(key: string): string {
    const item = this.doc()?.items.find((i) => `${i.productId}/${i.skuId}` === key);
    return item ? `${item.productName} ${item.variantLabel}`.trim() : 'SKU removido';
  }
  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  protected int(n: number): string {
    return n.toLocaleString('pt-BR');
  }
  protected money(cents: number): string {
    return BRL.format(cents / 100);
  }
  protected stamp(v: string): string {
    return formatStamp(v);
  }
  private nameOf(id: string): string {
    return this.locations().find((l) => l.id === id)?.name ?? id;
  }
  protected originName(): string {
    return this.nameOf(this.form().fromLocationId);
  }
  protected destName(): string {
    return this.nameOf(this.form().toLocationId);
  }
  /** Rótulo curto para cabeçalho de coluna: "CD" ou o nome do local. */
  protected originShort(): string {
    const l = this.locations().find((x) => x.id === this.form().fromLocationId);
    return l?.type === 'cd' ? 'CD' : (l?.name ?? 'origem');
  }
  protected destShort(): string {
    const l = this.locations().find((x) => x.id === this.form().toLocationId);
    return l?.type === 'cd' ? 'CD' : 'arena';
  }

  protected originQty(r: StockRow): number {
    // Em rascunho, o que importa é o disponível; depois disso a reserva já é desta transferência.
    return this.editable() ? availableAt(r, this.form().fromLocationId) : (r.byLocation[this.form().fromLocationId] ?? 0);
  }
  protected destQty(r: StockRow): number {
    return r.byLocation[this.form().toLocationId] ?? 0;
  }
  protected destTone(r: StockRow | undefined): string {
    return r ? qtyTone(this.destQty(r), r.threshold) : 'ok';
  }
  protected available(r: StockRow): number {
    return availableAt(r, this.form().fromLocationId);
  }
  protected suggested(r: StockRow): number {
    return suggestedQty(r, this.form());
  }
  protected after(r: StockRow, qty: number): number {
    return (r.byLocation[this.form().fromLocationId] ?? 0) - (this.editable() ? qty : 0);
  }
  protected lowOriginLabel(): string {
    const names = this.lowOrigin().map(({ row, after }) => `${row.productName} ${row.variantLabel === 'único' ? '' : row.variantLabel} (${after} un.)`.replace(/\s+/g, ' '));
    return names.join(', ');
  }
  protected lowOriginKey(): string {
    return this.lowOrigin()[0] ? skuKey(this.lowOrigin()[0]!.row) : '';
  }
  protected flowLabel(s: TransferStatus): string {
    return { rascunho: 'Rascunho', separacao: `Separação no ${this.originShort()}`, em_transito: 'Em trânsito', recebido: `Recebido na ${this.destShort()}`, cancelada: 'Cancelada' }[s];
  }
  protected flowSub(s: TransferStatus): string {
    const h = this.doc()?.history.filter((x) => x.status === s).at(-1);
    if (h?.at) {
      return `${h.actor.name} · ${h.at.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    }
    switch (s) {
      case 'rascunho': return 'Agora';
      case 'separacao': return 'Reserva as unidades na origem';
      case 'em_transito': return this.form().arriveAt ? `Previsto ${formatStamp(this.form().arriveAt)}` : 'Sai da origem';
      default: return this.form().receiver ? `Conferência: ${this.form().receiver}` : 'Conferência pelo gerente';
    }
  }

  protected set<K extends keyof TransferForm>(key: K, value: TransferForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }
  protected setRoute(key: 'fromLocationId' | 'toLocationId', id: string): void {
    this.set(key, id);
    this.errors.set({});
  }
  protected add(row: StockRow, qty = 1): void {
    this.form.update((f) => ({ ...f, lines: addTransferLine(f.lines, row, qty) }));
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
  protected remove(i: number): void {
    this.form.update((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }
  /** Sem linhas, semeia com todo SKU que tem sugestão; com linhas, copia o sugerido para cada uma. */
  protected fill(): void {
    this.form.update((f) => {
      if (f.lines.length === 0) {
        const lines = suggestedRows(this.rows(), f).reduce((acc, r) => addTransferLine(acc, r, suggestedQty(r, f)), f.lines);
        return { ...f, lines };
      }
      return { ...f, lines: fillSuggested(f, this.rowOfFn) };
    });
  }
  protected receivedOf(key: string, sent: number): number {
    return this.received()[key] ?? sent;
  }
  protected setReceived(key: string, qty: number): void {
    this.received.update((r) => ({ ...r, [key]: qty }));
  }

  protected print(): void {
    window.print();
  }
  protected back(): void {
    void this.router.navigate(['/painel/loja/estoque']);
  }

  protected async save(submit: boolean): Promise<void> {
    const errors = transferErrors(this.form(), this.rowOfFn, submit);
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      document.getElementById('f-' + Object.keys(errors)[0])?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const doc = this.doc();
      const r = await this.repo.saveTransfer({
        ...toTransferInput(this.form(), { transferId: doc?.id ?? null, version: doc?.version ?? null }, submit),
        orderIds: this.orderIds,
      });
      if (submit) {
        await this.router.navigate(['/painel/loja/estoque'], { state: { toast: `${r.code} criada: separação no ${this.originShort()}.` } });
        return;
      }
      this.toast.set(`Rascunho ${r.code} salvo`);
      if (!doc) {
        await this.router.navigate(['/painel/loja/estoque/transferencia', r.transferId], { replaceUrl: true });
      }
      await this.reloadDoc(r.transferId);
    } catch (err) {
      this.error.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async advance(action: 'em_transito' | 'recebido' | 'cancelar'): Promise<void> {
    const doc = this.doc();
    if (!doc) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.repo.advanceTransfer({
        transferId: doc.id,
        version: doc.version,
        action,
        ...(action === 'recebido' ? { received: this.received(), reason: this.divergenceReason() } : {}),
      });
      this.cancelOpen.set(false);
      const msg = { em_transito: `${doc.code} em trânsito: saiu do ${this.originShort()}.`, recebido: `${doc.code} recebida na ${this.destName()}.`, cancelar: `${doc.code} cancelada.` }[action];
      await this.router.navigate(['/painel/loja/estoque'], { state: { toast: msg } });
    } catch (err) {
      this.cancelOpen.set(false);
      this.error.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  private async reloadDoc(id: string): Promise<void> {
    const doc = await this.repo.transfer(id);
    if (doc) this.doc.set(doc);
  }
}
