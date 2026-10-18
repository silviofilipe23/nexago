import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CycleProgress } from '../../data/squad-metrics';

/** Linha do tempo do ciclo: início → revisão de meio de ciclo → promoções e encerramentos. */
@Component({
  selector: 'bo-cycle-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="edge">{{ p().startLabel }}</span>
    <div class="track" role="progressbar" [attr.aria-valuenow]="p().day" aria-valuemin="0" [attr.aria-valuemax]="p().total"
      [attr.aria-label]="'Dia ' + p().day + ' de ' + p().total + ' do ciclo'">
      <i class="fill" [style.width.%]="p().pct"></i>
      <span class="mark" [class.done]="p().day >= p().reviewDay" [style.left.%]="reviewPct()">
        <b></b><em>Revisão de {{ p().reviewDay }} dias</em>
      </span>
      <span class="mark end" [class.done]="p().state === 'done'">
        <b></b><em>Promoções e encerramentos</em>
      </span>
    </div>
    <span class="edge right">{{ p().endLabel }}</span>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 20px; padding: 16px 20px 34px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .edge { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-mute); white-space: nowrap; }
    .edge.right { padding-left: 64px; }
    .track { position: relative; flex: 1; height: 8px; border-radius: 99px; background: var(--nx-surface-2); }
    .fill { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--nx-orange-500); }
    .mark { position: absolute; top: -4px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; }
    .mark.end { left: 100%; }
    .mark b { width: 16px; height: 16px; box-sizing: border-box; border-radius: 99px; border: 2px solid var(--nx-line-strong); background: var(--nx-bg); }
    .mark.done b { border-color: var(--nx-orange-500); background: var(--nx-orange-500); }
    .mark em { font-style: normal; font-size: 11px; color: var(--nx-text-dim); margin-top: 6px; white-space: nowrap; }
    @media (max-width: 760px) {
      :host { gap: 12px; }
      .edge.right { padding-left: 0; }
      .mark em { display: none; }
    }
  `,
})
export class CycleStripComponent {
  readonly progress = input.required<CycleProgress>();
  protected readonly p = this.progress;
  protected readonly reviewPct = computed(() => (this.p().reviewDay / this.p().total) * 100);
}
