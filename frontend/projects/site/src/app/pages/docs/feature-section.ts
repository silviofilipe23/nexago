import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DocIcon } from './doc-icon';
import { FlowSteps } from './flow-steps';
import { ScreenFigure } from './screen-figure';
import { FaqAccordion } from '../ajuda/faq-accordion';
import type { DocFeature } from '../../../lib/docs/types';

/**
 * Uma feature completa da documentação: ícone + título + resumo, corpo em parágrafos, regras
 * (se houver), figura de tela, fluxos passo a passo e FAQ. Porta de `FeatureSection.tsx`.
 *
 * `phoneFigure` decide o layout: telas em formato celular (screenshot real OU mock com
 * `frame: 'phone'`) viram uma coluna lateral fixa (240px) ao lado do texto no desktop; telas
 * "browser" (mock de painel web) ficam abaixo, ocupando a largura toda — igual ao source.
 *
 * O FAQ reaproveita `FaqAccordion` de `pages/ajuda/` (mesmo shape `{q, a}`) em vez de duplicar
 * o acordeão — só embrulhado num `div.mt-8` porque o componente reusado não expõe `class`
 * externo (seu host é estático `block space-y-3`).
 */
@Component({
  selector: 'app-feature-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DocIcon, FlowSteps, ScreenFigure, FaqAccordion],
  host: { class: 'block' },
  template: `
    <section
      [id]="feature().id"
      [attr.aria-labelledby]="feature().id + '-title'"
      class="scroll-mt-28 border-t border-line pt-12"
    >
      <div [class]="phoneFigure() ? 'grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-12' : ''">
        <div class="min-w-0">
          <div class="flex items-start gap-4">
            <span
              class="mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-3 bg-brand-tint text-brand"
              aria-hidden="true"
            >
              <app-doc-icon [name]="feature().icon" />
            </span>
            <div>
              <h3 [id]="feature().id + '-title'" class="font-display text-2xl font-bold tracking-tight text-fg">
                {{ feature().title }}
              </h3>
              <p class="mt-1.5 text-base leading-relaxed text-text-mute">{{ feature().summary }}</p>
            </div>
          </div>

          <div class="mt-6 space-y-4">
            @for (paragraph of feature().body; track $index) {
              <p class="text-[15px] leading-relaxed text-text-mute">{{ paragraph }}</p>
            }
          </div>

          @if (feature().rules; as rules) {
            @if (rules.length > 0) {
              <div class="mt-6 rounded-4 border border-line bg-surface-1 p-5">
                <p class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
                  Regras que valem aqui
                </p>
                <ul class="mt-3 space-y-2.5">
                  @for (rule of rules; track rule) {
                    <li class="flex gap-2.5 text-sm leading-relaxed text-text-mute">
                      <svg
                        class="mt-0.5 size-4 shrink-0 text-brand"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {{ rule }}
                    </li>
                  }
                </ul>
              </div>
            }
          }
        </div>

        @if (feature().screen; as screen) {
          @if (phoneFigure()) {
            <div class="lg:pt-2">
              <app-screen-figure [screen]="screen" />
            </div>
          }
        }
      </div>

      @if (feature().screen; as screen) {
        @if (!phoneFigure()) {
          <div class="mt-8">
            <app-screen-figure [screen]="screen" />
          </div>
        }
      }

      @if (feature().flows; as flows) {
        @if (flows.length > 0) {
          <div class="mt-8 space-y-6">
            @for (flow of flows; track flow.title) {
              <app-flow-steps [flow]="flow" />
            }
          </div>
        }
      }

      @if (feature().faq; as faq) {
        @if (faq.length > 0) {
          <div class="mt-8">
            <app-faq-accordion [items]="faq" />
          </div>
        }
      }
    </section>
  `,
})
export class FeatureSection {
  readonly feature = input.required<DocFeature>();

  protected readonly phoneFigure = computed(() => {
    const screen = this.feature().screen;
    if (!screen) return false;
    return screen.kind === 'image' || screen.frame === 'phone';
  });
}
