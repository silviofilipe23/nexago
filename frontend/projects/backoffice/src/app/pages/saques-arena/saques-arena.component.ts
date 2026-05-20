import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';

import {
  ArenaWithdrawalsService,
  type ArenaWithdrawalRow,
} from '../../core/payments/arena-withdrawals.service';

@Component({
  selector: 'app-saques-arena',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './saques-arena.component.html',
})
export class SaquesArenaComponent implements OnInit {
  private readonly withdrawals = inject(ArenaWithdrawalsService);

  /** `null` = carregando; array vazio = sem pendentes. */
  protected readonly lista = signal<ArenaWithdrawalRow[] | null>(null);
  protected readonly processandoId = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.erro.set(null);
    try {
      const rows = await this.withdrawals.listPending();
      this.lista.set(rows);
    } catch (e) {
      this.lista.set([]);
      this.erro.set(e instanceof Error ? e.message : 'Falha ao carregar saques.');
    }
  }

  protected async aprovarComPix(row: ArenaWithdrawalRow) {
    await this.revisar(row.id, 'approved');
  }

  protected async aprovarManual(row: ArenaWithdrawalRow) {
    const ok = confirm(
      `Confirma que você já enviou ${this.formatBrl(row.amountReais)} via PIX para ${row.pixKey}? ` +
        'O saque será marcado como aprovado sem nova chamada ao Asaas.',
    );
    if (!ok) return;
    await this.revisar(row.id, 'approved_manual', 'PIX enviado manualmente pelo admin');
  }

  protected async rejeitar(row: ArenaWithdrawalRow) {
    await this.revisar(row.id, 'rejected');
  }

  protected isStalePayoutError(row: ArenaWithdrawalRow): boolean {
    const err = row.payoutError ?? '';
    return (
      err.includes('Invalid signature') ||
      err.includes('transaction-intents') ||
      err.includes('Mercado Pago')
    );
  }

  private formatBrl(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private async revisar(
    id: string,
    decision: 'approved' | 'approved_manual' | 'rejected',
    note = '',
  ) {
    this.erro.set(null);
    this.processandoId.set(id);
    try {
      await this.withdrawals.review(id, decision, note);
      await this.carregar();
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Falha ao revisar saque.');
    } finally {
      this.processandoId.set(null);
    }
  }
}
