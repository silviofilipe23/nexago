import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ChipTone, DocFlow } from '../../../lib/docs/types';

const CHIP_CLASSES: Record<ChipTone, string> = {
  brand: 'text-brand bg-brand-tint',
  pending: 'text-pending bg-pending/12',
  live: 'text-live bg-live/12',
  win: 'text-win bg-win/12',
  neutral: 'text-text-mute bg-surface-2',
};

/**
 * Fluxo passo a passo — trilho numerado no vocabulário do produto: numerais mono, linha
 * conectora e chips de estado iguais aos do app ("Pagamento pendente", "Aguardando
 * parceiro"…). Porta 1:1 de `FlowSteps.tsx`.
 */
@Component({
  selector: 'app-flow-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="rounded-4 border border-line bg-surface-0 p-5 sm:p-6">
      <p class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Fluxo</p>
      <h4 class="mt-1.5 font-display text-lg font-bold tracking-tight text-fg">{{ flow().title }}</h4>
      @if (flow().intro; as intro) {
        <p class="mt-2 text-sm leading-relaxed text-text-mute">{{ intro }}</p>
      }

      <ol class="mt-5">
        @for (step of flow().steps; track step.title; let i = $index; let last = $last) {
          <li class="relative flex gap-4 pb-6 last:pb-0">
            @if (!last) {
              <span class="absolute left-[13px] top-8 bottom-0 w-px bg-line" aria-hidden="true"></span>
            }
            <span
              class="z-[1] inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-surface-1 font-mono text-xs font-bold text-brand"
              aria-hidden="true"
            >
              {{ stepNumber(i) }}
            </span>
            <div class="min-w-0 pt-0.5">
              <div class="flex flex-wrap items-center gap-2">
                <h5 class="text-[15px] font-bold tracking-tight text-fg">{{ step.title }}</h5>
                @if (step.state; as state) {
                  <span [class]="chipClasses(state.tone)">
                    <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
                    {{ state.label }}
                  </span>
                }
              </div>
              <p class="mt-1 text-sm leading-relaxed text-text-mute">{{ step.detail }}</p>
            </div>
          </li>
        }
      </ol>

      @if (flow().outcome; as outcome) {
        <p class="mt-5 rounded-3 border border-win/25 bg-win/8 px-4 py-3 text-sm leading-relaxed text-text-mute">
          <span class="mr-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-win">Resultado</span>
          {{ outcome }}
        </p>
      }
    </div>
  `,
})
export class FlowSteps {
  readonly flow = input.required<DocFlow>();

  protected stepNumber(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  protected chipClasses(tone: ChipTone | undefined): string {
    return `inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${CHIP_CLASSES[tone ?? 'neutral']}`;
  }
}
