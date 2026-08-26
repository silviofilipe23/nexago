import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { SpotlightCard } from '../../../shared/ui/spotlight-card';

interface Plan {
  name: string;
  description: string;
  /** Valor mensal em reais. */
  monthly: number;
  /** Valor total anual em reais. */
  yearly: number;
  popular?: boolean;
  features: string[];
  cta: string;
}

/** Parcela do anual em pt-BR: preço futuro que não seja múltiplo de 12 renderizaria
 *  dízima crua ("R$ 90.83333333333333") sem passar por aqui. */
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Mantém alinhado com functions/src/arena-plans.ts (fonte da verdade),
// nexago_app arena_plan.dart e frontend/projects/arena
// (ARENA_PLAN_CATALOG). Ciclo anual = 1 mês grátis (12× 90/228/457).
const PLANS: Plan[] = [
  {
    name: 'Starter',
    description: 'Ideal para pequenas arenas começarem online.',
    monthly: 99,
    yearly: 1080,
    features: [
      'Até 2 quadras · 1 admin',
      'Site institucional + perfil na busca',
      'Agenda e reservas online (site e app)',
      'Avaliações e reputação',
      'Pagamento e saque via PIX',
      'Taxa de 8% por reserva',
    ],
    cta: 'Começar agora',
  },
  {
    name: 'Pro',
    description: 'A operação completa da arena.',
    monthly: 249,
    yearly: 2736,
    popular: true,
    features: [
      'Tudo do Starter · até 5 quadras',
      'Torneios ilimitados e ranking da arena',
      'Inscrições com pagamento online',
      'Relatórios e dashboard',
      'PDV, comandas e estoque',
      'Push para atletas · taxa de 6%',
    ],
    cta: 'Falar com a gente',
  },
  {
    name: 'Elite',
    description: 'Para arenas grandes e redes.',
    monthly: 499,
    yearly: 5484,
    features: [
      'Tudo do Pro · usuários ilimitados',
      'Análise financeira + consultoria semanal',
      'Landing pages ilimitadas',
      'Área de patrocinadores',
      'Suporte prioritário',
      'Taxa de 5% · saque PIX sem tarifa',
    ],
    cta: 'Falar com a gente',
  },
];

/**
 * Porta de `ArenaPlanos` (site Next.js) — usada nas páginas `/arenas` (fora do escopo desta
 * seção — não aparece diretamente na home). Diferenças do original:
 * - Sem `NumberFlow`: o preço troca direto (sem animação de dígitos), simplificação aceitável
 *   sem a lib de animação numérica.
 * - O switch mensal/anual não usa o `layoutId` (Framer Motion) de pílula deslizante — troca de
 *   classes com transição CSS simples no botão ativo, mesmo resultado visual sem a dependência.
 */
@Component({
  selector: 'app-arena-planos-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, SpotlightCard],
  template: `
    <section [id]="id()" class="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal class="mx-auto max-w-2xl text-center">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Planos</p>
        <h2 class="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          Invista no que enche suas quadras
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-balance text-base text-text-mute sm:text-lg">
          Ativação única de R$ 97 (domínio, site, onboarding e perfil na busca). No anual, 1 mês grátis em todos os
          planos.
        </p>
      </div>

      <div nxReveal [nxRevealDelay]="50" class="mt-10">
        <div role="group" aria-label="Período de cobrança" class="mx-auto flex w-fit rounded-pill border border-line bg-surface-2 p-1">
          <button
            type="button"
            (click)="yearly.set(false)"
            [attr.aria-pressed]="!yearly()"
            class="relative z-10 inline-flex min-h-[40px] items-center gap-2 rounded-pill px-5 text-sm font-600 transition-colors duration-200"
            [class]="!yearly() ? 'bg-brand text-on-brand shadow-glow-orange' : 'text-text-mute hover:text-fg'"
          >
            Mensal
          </button>
          <button
            type="button"
            (click)="yearly.set(true)"
            [attr.aria-pressed]="yearly()"
            class="relative z-10 inline-flex min-h-[40px] items-center gap-2 rounded-pill px-5 text-sm font-600 transition-colors duration-200"
            [class]="yearly() ? 'bg-brand text-on-brand shadow-glow-orange' : 'text-text-mute hover:text-fg'"
          >
            Anual
            <span class="rounded-pill px-2 py-0.5 text-xs font-600" [class]="yearly() ? 'bg-on-brand/15 text-on-brand' : 'bg-brand-tint text-brand'">
              1 mês grátis
            </span>
          </button>
        </div>
      </div>

      <!-- Mobile: carrossel horizontal sangrando até a borda, snap alinhado ao gutter
          (peek do próximo card sinaliza o swipe). md+: grid de 3 colunas.
          Sem h-full no item: o stretch do flex/grid iguala a altura dos cards. -->
      <div class="mt-14 -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:items-stretch md:gap-5 md:snap-none md:overflow-visible md:px-0 md:pb-0 md:pt-0">
        @for (plan of plans; track plan.name; let i = $index) {
          <div nxReveal [nxRevealDelay]="i * 80" class="w-[80%] shrink-0 snap-start sm:w-[56%] md:w-auto md:shrink">
            <app-spotlight-card [className]="'flex h-full flex-col p-7' + (plan.popular ? ' border-brand/50 shadow-glow-orange' : '')">
              <div class="flex items-center justify-between gap-3">
                <h3 class="font-display text-xl font-700 tracking-tight text-fg">{{ plan.name }}</h3>
                @if (plan.popular) {
                  <span class="rounded-pill bg-brand px-3 py-1 text-xs font-700 text-on-brand">Popular</span>
                }
              </div>
              <p class="mt-2 text-sm leading-relaxed text-text-mute">{{ plan.description }}</p>

              <div class="mt-6 flex items-baseline gap-1.5">
                <span class="font-display text-4xl font-800 tracking-tight text-fg [font-variant-numeric:tabular-nums]">
                  {{ formatBRL(yearly() ? plan.yearly : plan.monthly) }}
                </span>
                <span class="text-sm text-text-mute">/{{ yearly() ? 'ano' : 'mês' }}</span>
              </div>
              @if (yearly()) {
                <p class="mt-1.5 text-sm text-text-mute">12× de {{ formatBRL(plan.yearly / 12) }} · 1 mês grátis</p>
              }

              <a
                href="#contato"
                class="mt-7 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-pill px-6 text-[15px] font-semibold tracking-tight transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                [class]="plan.popular ? 'bg-brand text-on-brand shadow-glow-orange hover:bg-brand-light' : 'border border-line-strong bg-surface-2 text-fg hover:border-brand hover:text-brand'"
              >
                {{ plan.cta }}
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>

              <ul class="mt-7 space-y-3 border-t border-line pt-6">
                @for (feature of plan.features; track feature) {
                  <li class="flex items-start gap-2.5 text-sm text-fg">
                    <span class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand" aria-hidden="true">
                      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    {{ feature }}
                  </li>
                }
              </ul>
            </app-spotlight-card>
          </div>
        }
      </div>

      <div nxReveal [nxRevealDelay]="100">
        <p class="mt-10 text-center text-xs text-text-dim">
          Sem fidelidade. Cancele quando quiser — a taxa por reserva paga no app varia por plano (8%, 6% ou 5%).
        </p>
      </div>
    </section>
  `,
})
export class ArenaPlanosSection {
  readonly id = input('planos');

  protected readonly plans = PLANS;
  protected readonly yearly = signal(false);
  protected readonly formatBRL = formatBRL;
}
