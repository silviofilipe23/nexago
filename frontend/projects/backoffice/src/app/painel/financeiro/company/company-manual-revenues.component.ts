import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { CompanyFinanceRepository, type RecordRevenueInput } from '../data/company-finance.repository';
import { money, type ManualRevenue, type RevenueArena } from '../data/company-finance';
import { RecordRevenueDialogComponent } from '../ui/record-revenue-dialog.component';

/**
 * Receitas avulsas da janela: mensalidades de plano que a arena pagou fora do Asaas, lançadas à
 * mão. Entram em "Planos das arenas" no mês do recebimento. Lançar e anular recarregam o Financeiro.
 */
@Component({
  selector: 'bo-company-manual-revenues',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent, ConfirmDialogComponent, RecordRevenueDialogComponent],
  template: `
    <bo-panel-card pad="sm" title="Receitas avulsas" kicker="Mensalidades pagas fora do Asaas · entram em Planos das arenas">
      <div card-actions>
        <button type="button" class="bo-mini-btn" (click)="openRecord()"><bo-icon name="plus" [size]="13" /> Registrar mensalidade</button>
      </div>
      <div class="scroll">
        <div class="table">
          <div class="row head"><span>Data</span><span>Arena</span><span>Observação</span><span class="r">Valor</span><span></span></div>
          @for (r of revenues(); track r.id) {
            <div class="row">
              <span class="mono dim">{{ day(r.receivedOn) }}</span>
              <span class="arena">{{ r.arenaName ?? 'Arena sem nome' }}</span>
              <span class="note" [title]="r.note">{{ r.note || '—' }}</span>
              <span class="num">{{ money(r.amountCents) }}</span>
              <span class="r"><button type="button" class="bo-mini-btn" (click)="askVoid(r)">Anular</button></span>
            </div>
          } @empty {
            <p class="empty">Nenhuma receita avulsa nestes meses.</p>
          }
        </div>
      </div>
      @if (revenues().length) {
        <p class="total">Total nestes meses: <strong>{{ money(total()) }}</strong></p>
      }
    </bo-panel-card>

    <bo-record-revenue-dialog [open]="recording()" [arenas]="arenas()" [busy]="saving()" [error]="saveError()"
      (submitted)="record($event)" (dismissed)="closeRecord()" />

    <bo-confirm-dialog [open]="!!voiding()" title="Anular receita avulsa" tone="danger" confirmLabel="Anular"
      [description]="voidText()" [busy]="saving()" [error]="saveError()"
      (confirmed)="confirmVoid()" (dismissed)="closeVoid()" />
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .scroll { overflow-x: auto; margin: 0 -4px; }
    .table { min-width: 720px; padding: 0 4px; }
    .row { display: grid; grid-template-columns: 96px minmax(0, 1.2fr) minmax(0, 1.6fr) 120px 84px; gap: 12px; align-items: center; padding: 10px; border-bottom: 1px solid var(--nx-line); font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .head { padding-top: 4px; }
    .head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .r { text-align: right; }
    .mono { font-family: var(--nx-font-mono); font-size: 12px; }
    .dim { color: var(--nx-text-dim); }
    .arena, .note { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .note { color: var(--nx-text-mute); }
    .num { font-family: var(--nx-font-mono); font-size: 12.5px; text-align: right; white-space: nowrap; color: var(--nx-win); }
    .empty { margin: 14px 10px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .total { margin: 10px 10px 2px; font-size: 12.5px; color: var(--nx-text-mute); }
    .total strong { font-family: var(--nx-font-mono); color: var(--nx-text); }
  `,
})
export class CompanyManualRevenuesComponent {
  private readonly repo = inject(CompanyFinanceRepository);

  readonly revenues = input.required<readonly ManualRevenue[]>();
  readonly arenas = input.required<readonly RevenueArena[]>();
  readonly changed = output<void>();

  protected readonly money = money;
  protected readonly recording = signal(false);
  protected readonly voiding = signal<ManualRevenue | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly total = computed(() => this.revenues().reduce((s, r) => s + r.amountCents, 0));
  protected readonly voidText = computed(() => {
    const r = this.voiding();
    if (!r) return '';
    return `${this.day(r.receivedOn)} · ${r.arenaName ?? 'Arena sem nome'} · ${money(r.amountCents)}. ` +
      'Sai de Planos das arenas; o registro continua guardado como anulado.';
  });

  protected openRecord(): void {
    this.saveError.set(null);
    this.recording.set(true);
  }

  protected closeRecord(): void {
    if (!this.saving()) this.recording.set(false);
  }

  protected askVoid(r: ManualRevenue): void {
    this.saveError.set(null);
    this.voiding.set(r);
  }

  protected closeVoid(): void {
    if (!this.saving()) this.voiding.set(null);
  }

  protected async record(input: RecordRevenueInput): Promise<void> {
    await this.save(() => this.repo.recordRevenue(input), () => this.recording.set(false));
  }

  protected async confirmVoid(): Promise<void> {
    const r = this.voiding();
    if (!r) return;
    await this.save(() => this.repo.voidRevenue(r.id, ''), () => this.voiding.set(null));
  }

  private async save(call: () => Promise<void>, close: () => void): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await call();
      close();
      this.changed.emit();
    } catch (e) {
      this.saveError.set(callableErrorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** `2026-11-05` → `05/11/2026`. */
  protected day(date: string): string {
    return date.length >= 10 ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : date;
  }
}
