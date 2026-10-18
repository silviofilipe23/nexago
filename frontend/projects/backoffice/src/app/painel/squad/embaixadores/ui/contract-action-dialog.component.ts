import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { SQUAD_TIERS, TIER_LABELS, versionLabel, type SquadRules, type SquadTier } from '../../niveis-regras/data/squad-rules';
import { packageSummary } from '../../data/package-summary';
import {
  END_REASONS,
  END_REASON_LABELS,
  type Contract,
  type ContractActionInput,
  type EndReason,
} from '../../data/squad-program.repository';
import { spDateKey } from '../../comissoes/data/commission';

export type ContractDialogMode = 'changeTier' | 'pause' | 'end';

/** Modais Mudar nível (gera aditivo) · Pausar · Encerrar, com o texto do que acontece em cada um. */
@Component({
  selector: 'bo-contract-action-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent],
  template: `
    <bo-confirm-dialog
      [open]="open()"
      [title]="title()"
      [description]="description()"
      [confirmLabel]="confirmLabel()"
      [tone]="mode() === 'end' ? 'danger' : 'primary'"
      size="md"
      [busy]="busy()"
      [confirmDisabled]="!valid()"
      [error]="error()"
      (confirmed)="submit()"
      (dismissed)="dismissed.emit()"
    >
      @switch (mode()) {
        @case ('changeTier') {
          <label class="field">
            <span>Novo nível</span>
            <select class="bo-input" [value]="tier()" (change)="tier.set(asTier($event))">
              @for (t of tiers; track t) {
                <option [value]="t" [selected]="tier() === t" [disabled]="t === contract()?.tier">{{ tierLabels[t] }}{{ t === contract()?.tier ? ' (atual)' : '' }}</option>
              }
            </select>
          </label>
          @if (proRange(); as range) {
            <label class="field">
              <span>Comissão do Pro ({{ range[0] }}–{{ range[1] }}%)</span>
              <input class="bo-input mono" type="number" [min]="range[0]" [max]="range[1]" step="0.5" [value]="pct()" (input)="pct.set(num($event))" />
            </label>
          }
          <dl class="pkg">
            @for (item of summary(); track item.label) {
              <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
            }
          </dl>
          <label class="field">
            <span>Motivo</span>
            <textarea class="bo-input" rows="2" maxlength="280" [value]="reason()" (input)="reason.set(text($event))"></textarea>
          </label>
        }
        @case ('pause') {
          <label class="field">
            <span>Motivo</span>
            <textarea class="bo-input" rows="2" maxlength="280" placeholder="Ex.: lesão, viagem" [value]="reason()" (input)="reason.set(text($event))"></textarea>
          </label>
          <label class="field">
            <span>Data de retorno (opcional)</span>
            <input class="bo-input" type="date" [min]="tomorrow()" [value]="date()" (input)="date.set(text($event))" />
          </label>
        }
        @case ('end') {
          <label class="field">
            <span>Motivo</span>
            <select class="bo-input" [value]="endReason()" (change)="endReason.set(asEndReason($event))">
              <option value="" [selected]="!endReason()" disabled>Escolha</option>
              @for (r of endReasons; track r) {
                <option [value]="r" [selected]="endReason() === r">{{ endLabels[r] }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>Data efetiva</span>
            <input class="bo-input" type="date" [min]="today()" [value]="date()" (input)="date.set(text($event))" />
          </label>
          <label class="field">
            <span>Observação interna (opcional)</span>
            <textarea class="bo-input" rows="2" maxlength="280" [value]="reason()" (input)="reason.set(text($event))"></textarea>
          </label>
        }
      }
    </bo-confirm-dialog>
  `,
  styles: `
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; font-size: 12px; color: var(--nx-text-mute); }
    textarea.bo-input { height: auto; padding: 10px 12px; resize: vertical; }
    input[type='date'] { color-scheme: dark; }
    .mono { font-family: var(--nx-font-mono); }
    .pkg { margin: 0 0 12px; padding: 12px 14px; display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 6px 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); font-size: 12.5px; }
    dt { color: var(--nx-text-dim); }
    dd { margin: 0; }
  `,
})
export class ContractActionDialogComponent {
  readonly open = input(false);
  readonly mode = input.required<ContractDialogMode>();
  readonly contract = input<Contract | null>(null);
  readonly rules = input.required<SquadRules>();
  readonly rulesVersion = input(1);
  /** Nível já escolhido ao abrir "Mudar nível" ("Promover a Pro" no perfil); sem ele, o primeiro diferente do atual. */
  readonly initialTier = input<SquadTier | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly now = input.required<Date>();

  readonly submitted = output<ContractActionInput>();
  readonly dismissed = output<void>();

  protected readonly tiers = SQUAD_TIERS;
  protected readonly tierLabels = TIER_LABELS;
  protected readonly endReasons = END_REASONS;
  protected readonly endLabels = END_REASON_LABELS;

  protected readonly tier = signal<SquadTier>('amb');
  protected readonly pct = signal<number | null>(null);
  protected readonly reason = signal('');
  protected readonly date = signal('');
  protected readonly endReason = signal<EndReason | ''>('');

  protected readonly today = computed(() => spDateKey(this.now()));
  protected readonly tomorrow = computed(() => spDateKey(new Date(this.now().getTime() + 86_400_000)));

  protected readonly proRange = computed(() => {
    const c = this.rules().tiers.pro.commissionPct;
    return this.tier() === 'pro' && Array.isArray(c) ? c : null;
  });
  protected readonly summary = computed(() => packageSummary(this.rules().tiers[this.tier()]));

  protected readonly title = computed(() => {
    const name = this.contract()?.name ?? '';
    return this.mode() === 'changeTier' ? `Mudar nível de ${name}` : this.mode() === 'pause' ? `Pausar ${name}?` : `Encerrar contrato de ${name}?`;
  });
  protected readonly description = computed(() => {
    switch (this.mode()) {
      case 'changeTier':
        return `Gera um aditivo com o pacote das regras ${versionLabel(this.rulesVersion())}. O atleta aceita no app; até lá segue no nível atual.`;
      case 'pause':
        return 'O código mostra "Código indisponível" no checkout e para de gerar comissão. As comissões já liberadas continuam no repasse.';
      default:
        return 'O código é desativado na data efetiva. Comissões aguardando seguem até confirmar ou cancelar e entram no último repasse.';
    }
  });
  protected readonly confirmLabel = computed(() =>
    this.mode() === 'changeTier' ? 'Enviar aditivo' : this.mode() === 'pause' ? 'Pausar' : 'Encerrar contrato',
  );

  protected readonly valid = computed(() => {
    const reasonOk = this.reason().trim().length >= 3;
    switch (this.mode()) {
      case 'changeTier': {
        const range = this.proRange();
        const pct = this.pct();
        const pctOk = !range || (pct !== null && pct >= range[0] && pct <= range[1]);
        return reasonOk && this.tier() !== this.contract()?.tier && pctOk;
      }
      case 'pause':
        return reasonOk && (!this.date() || this.date() > this.today());
      default:
        return !!this.endReason() && !!this.date() && this.date() >= this.today() &&
          (this.reason().trim() === '' || reasonOk);
    }
  });

  constructor() {
    // Cada abertura começa limpa (o reset não pode rastrear os próprios signals).
    effect(() => {
      if (!this.open()) return;
      const mode = this.mode();
      const contract = this.contract();
      untracked(() => {
        this.reason.set('');
        this.endReason.set('');
        this.date.set(mode === 'end' ? this.today() : '');
        const preset = this.initialTier();
        const next = preset && preset !== contract?.tier ? preset : (SQUAD_TIERS.find((t) => t !== contract?.tier) ?? 'amb');
        this.tier.set(next);
        const range = this.rules().tiers.pro.commissionPct;
        this.pct.set(Array.isArray(range) ? range[0] : null);
      });
    });
  }

  protected submit(): void {
    if (!this.valid()) return;
    switch (this.mode()) {
      case 'changeTier':
        this.submitted.emit({
          action: 'changeTier',
          tier: this.tier(),
          reason: this.reason().trim(),
          commissionPct: this.proRange() ? this.pct() : null,
        });
        return;
      case 'pause':
        this.submitted.emit({ action: 'pause', reason: this.reason().trim(), until: this.date() || null });
        return;
      default:
        this.submitted.emit({
          action: 'end',
          reason: this.endReason() as EndReason,
          note: this.reason().trim() || null,
          effectiveDate: this.date(),
        });
    }
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected num(event: Event): number | null {
    const v = (event.target as HTMLInputElement).valueAsNumber;
    return Number.isFinite(v) ? v : null;
  }

  protected asTier(event: Event): SquadTier {
    return (event.target as HTMLSelectElement).value as SquadTier;
  }

  protected asEndReason(event: Event): EndReason {
    return (event.target as HTMLSelectElement).value as EndReason;
  }
}
