import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { funnelSteps, type Funnel } from '../data/squad-metrics';

/**
 * Funil de atribuição (protótipo EmFunnel): Cliques → Cadastros → Inscrições → Pagas. Cliques ainda
 * não são medidos ("—"); as barras são relativas ao maior número conhecido.
 */
@Component({
  selector: 'bo-squad-funnel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (s of steps(); track s.label; let last = $last; let i = $index) {
      <div class="step" [class.last]="last">
        <span class="name">{{ s.label }}</span>
        <span class="track" aria-hidden="true">
          @if (s.value !== null) {
            <i [style.width.%]="s.pct" [style.opacity]="last ? 1 : 0.28 + i * 0.16"></i>
          }
        </span>
        <span class="num" [attr.title]="s.value === null ? 'Cliques no link e no QR ainda não são medidos' : null">
          {{ s.value === null ? '—' : s.value.toLocaleString('pt-BR') }}
        </span>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    :host(.dense) { gap: 10px; }
    .step { display: grid; grid-template-columns: 96px minmax(0, 1fr) 60px; align-items: center; gap: 12px; }
    :host(.dense) .step { grid-template-columns: 82px minmax(0, 1fr) 48px; }
    .name { font-size: 12.5px; color: var(--nx-text-mute); }
    .last .name { color: var(--nx-text); font-weight: 600; }
    .track { height: 26px; border-radius: 7px; background: rgba(255, 255, 255, 0.04); overflow: hidden; }
    :host(.dense) .track { height: 22px; }
    .track i { display: block; height: 100%; border-radius: 7px; background: var(--nx-orange-500); }
    .num { font-family: var(--nx-font-mono); font-size: 13px; font-weight: 700; text-align: right; color: var(--nx-text); }
    .last .num { color: var(--nx-orange-500); }
  `,
})
export class SquadFunnelComponent {
  readonly funnel = input.required<Funnel>();
  protected readonly steps = computed(() => funnelSteps(this.funnel()));
}
