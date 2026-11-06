import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { personName } from '../../../avaliacoes/data/tournament-reviews';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { PillComponent } from '../../../ui/pill.component';
import {
  costsLabel,
  dateTimeLabel,
  methodLabel,
  money,
  paymentsCsv,
  signedMoney,
  type PaymentRow,
} from '../data/tournament-revenue';

const PAGE = 40;

/** Pagamentos creditados no caixa do torneio, um a um, com o que a NexaGO ganhou em cada. */
@Component({
  selector: 'bo-revenue-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, PillComponent, IconComponent],
  template: `
    <bo-panel-card pad="sm" title="Pagamentos creditados" [kicker]="payments().length + ' · mais recentes primeiro'">
      @if (payments().length) {
        <div card-actions>
          <button type="button" class="bo-mini-btn" (click)="exportCsv()"><bo-icon name="download" [size]="13" /> Exportar CSV</button>
        </div>
      }
      <div class="scroll">
        <div class="table">
          <div class="p-head">
            <span>Data</span><span>Atleta</span><span>Forma</span><span class="r">Valor</span><span class="r">Taxa</span><span class="r">Bancado pela NexaGO</span><span class="r">Líquido</span>
          </div>
          @for (p of visible(); track p.line.id) {
            <div class="p-row">
              <span class="mono dim">{{ dateTime(p.line.createdAt) }}</span>
              <span class="name">{{ nameOf(p.line.payerUid) }}</span>
              <span><bo-pill [tone]="p.line.method === 'card' ? 'orange' : 'dim'">{{ method(p.line.method) }}</bo-pill></span>
              <span class="num">{{ money(p.line.grossCents) }}</span>
              <span class="num">{{ money(p.feeCents) }}</span>
              <span class="num dim">{{ costs(p) }}</span>
              <span class="num strong" [class.neg]="p.netCents < 0">{{ signedMoney(p.netCents) }}</span>
            </div>
          } @empty {
            <p class="status">Nenhum pagamento pela plataforma creditado no caixa deste torneio.</p>
          }
        </div>
      </div>
      @if (payments().length > limit()) {
        <button type="button" class="bo-mini-btn more" (click)="limit.set(limit() + page)">Mostrar mais {{ nextCount() }}</button>
      }
      @if (hasNegative()) {
        <p class="legend">Líquido negativo = o cashback usado passou da taxa daquele pagamento (a NexaGO completou o preço ao organizador).</p>
      }
    </bo-panel-card>
  `,
  styles: `
    .scroll { overflow-x: auto; margin: 0 -4px; }
    .table { min-width: 900px; padding: 0 4px; }
    .p-head, .p-row { display: grid; grid-template-columns: 104px minmax(160px, 1fr) 84px 104px 96px 190px 104px; gap: 12px; align-items: center; }
    .p-head { padding: 4px 10px 10px; border-bottom: 1px solid var(--nx-line); }
    .p-head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .p-row { padding: 11px 10px; border-bottom: 1px solid var(--nx-line); }
    .p-row:last-child { border-bottom: none; }
    .r { text-align: right; }
    .name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mono { font-family: var(--nx-font-mono); font-size: 12px; }
    .num { font-family: var(--nx-font-mono); font-size: 12.5px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .strong { font-weight: 600; }
    .neg { color: var(--nx-live); }
    .dim { color: var(--nx-text-dim); }
    .status { margin: 16px 10px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .more { align-self: flex-start; margin-top: 12px; }
    .legend { margin: 12px 10px 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
  `,
})
export class RevenuePaymentsComponent {
  private readonly document = inject(DOCUMENT);

  readonly payments = input.required<readonly PaymentRow[]>();
  /** `null` = nomes ainda carregando. */
  readonly names = input<ReadonlyMap<string, string> | null>(null);
  /** Base do nome do arquivo exportado. */
  readonly fileName = input('arrecadacao');

  protected readonly page = PAGE;
  protected readonly limit = signal(PAGE);
  protected readonly visible = computed(() => this.payments().slice(0, this.limit()));
  protected readonly nextCount = computed(() => Math.min(PAGE, this.payments().length - this.limit()));
  protected readonly hasNegative = computed(() => this.payments().some((p) => p.netCents < 0));

  protected readonly money = money;
  protected readonly signedMoney = signedMoney;
  protected readonly dateTime = dateTimeLabel;
  protected readonly method = methodLabel;
  protected readonly costs = costsLabel;

  protected nameOf(uid: string | null): string {
    return uid ? personName(uid, this.names()) : 'Sem atleta';
  }

  protected exportCsv(): void {
    // BOM: sem ele o Excel abre o UTF-8 como Latin-1 e estraga os acentos.
    const blob = new Blob(['﻿', paymentsCsv(this.payments(), (uid) => this.nameOf(uid))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `${this.fileName()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
