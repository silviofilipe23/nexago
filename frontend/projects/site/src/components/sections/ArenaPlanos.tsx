'use client';

import { useState } from 'react';
import NumberFlow from '@number-flow/react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';

type Plan = {
  name: string;
  description: string;
  /** Valor mensal em reais (0 = grátis). */
  monthly: number;
  /** Valor total anual em reais. */
  yearly: number;
  popular?: boolean;
  features: string[];
  cta: string;
};

// Mantém alinhado com functions/src/arena-plans.ts (fonte da verdade) e
// nexago_app arena_plan.dart. Ciclo anual = 2 meses grátis.
const PLANS: Plan[] = [
  {
    name: 'Essencial',
    description: 'Comece a receber reservas online sem pagar mensalidade.',
    monthly: 0,
    yearly: 0,
    features: [
      'Perfil público e listagem na busca',
      'Reservas online com pagamento PIX',
      'Agenda e disponibilidade das quadras',
      'Avaliações da arena',
      'Carteira e saque via PIX',
    ],
    cta: 'Começar grátis',
  },
  {
    name: 'Pro',
    description: 'A operação completa da arena, do balcão ao torneio.',
    monthly: 149,
    yearly: 1490,
    popular: true,
    features: [
      'Tudo do Essencial',
      'PDV e comandas',
      'Controle de estoque e produtos',
      'Destaque na busca e promoções de horário',
      'Dashboard completo, insights e seguidores',
      'Receber etapas e torneios',
    ],
    cta: 'Falar com a gente',
  },
  {
    name: 'Parceiro',
    description: 'Para redes e arenas que sediam a Liga nexaGO.',
    monthly: 399,
    yearly: 3990,
    features: [
      'Tudo do Pro',
      'Múltiplas quadras / unidades, sem limite',
      'Prioridade em etapas da Liga nexaGO',
      'Gerente de conta dedicado',
    ],
    cta: 'Falar com a gente',
  },
];

function BillingSwitch({ yearly, onChange }: { yearly: boolean; onChange: (v: boolean) => void }) {
  const reduce = useReducedMotion();
  return (
    <div
      role="group"
      aria-label="Período de cobrança"
      className="mx-auto flex w-fit rounded-pill border border-line bg-surface-2 p-1"
    >
      {[
        { label: 'Mensal', value: false },
        { label: 'Anual', value: true },
      ].map((opt) => {
        const active = yearly === opt.value;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'relative z-10 inline-flex min-h-[40px] items-center gap-2 rounded-pill px-5 text-sm font-600 transition-colors duration-200',
              active ? 'text-on-brand' : 'text-text-mute hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId="billing-pill"
                className="absolute inset-0 -z-10 rounded-pill bg-brand shadow-glow-orange"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
              />
            )}
            {opt.label}
            {opt.value && (
              <span
                className={cn(
                  'rounded-pill px-2 py-0.5 text-xs font-600',
                  active ? 'bg-on-brand/15 text-on-brand' : 'bg-brand-tint text-brand',
                )}
              >
                2 meses grátis
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ArenaPlanos({ id = 'planos' }: { id?: string }) {
  const [yearly, setYearly] = useState(false);

  return (
    <section id={id} className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Planos</p>
        <h2 className="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          Invista no que enche suas quadras
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-text-mute sm:text-lg">
          Comece grátis hoje. Quando a agenda ganhar ritmo, suba de plano para receber torneios,
          aparecer em destaque e atrair quem já joga na areia — sem fidelidade, no seu tempo.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mt-10">
        <BillingSwitch yearly={yearly} onChange={setYearly} />
      </Reveal>

      {/* Mobile: carrossel horizontal sangrando até a borda, snap alinhado ao gutter
          (peek do próximo card sinaliza o swipe). md+: grid de 3 colunas.
          Sem `h-full` no item: o stretch do flex/grid iguala a altura dos cards. */}
      <div className="mt-14 -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:items-stretch md:gap-5 md:snap-none md:overflow-visible md:px-0 md:pb-0 md:pt-0">
        {PLANS.map((plan, i) => {
          const value = yearly ? plan.yearly : plan.monthly;
          const free = plan.monthly === 0;
          return (
            <Reveal
              key={plan.name}
              delay={i * 0.08}
              className="w-[80%] shrink-0 snap-start sm:w-[56%] md:w-auto md:shrink"
            >
              <SpotlightCard
                className={cn(
                  'flex h-full flex-col p-7',
                  plan.popular && 'border-brand/50 shadow-glow-orange',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-700 tracking-tight text-fg">{plan.name}</h3>
                  {plan.popular && (
                    <span className="rounded-pill bg-brand px-3 py-1 text-xs font-700 text-on-brand">
                      Popular
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-text-mute">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-1.5">
                  {free ? (
                    <span className="font-display text-4xl font-800 tracking-tight text-fg">Grátis</span>
                  ) : (
                    <>
                      <NumberFlow
                        value={value}
                        locales="pt-BR"
                        format={{ style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }}
                        className="font-display text-4xl font-800 tracking-tight text-fg [font-variant-numeric:tabular-nums]"
                      />
                      <span className="text-sm text-text-mute">/{yearly ? 'ano' : 'mês'}</span>
                    </>
                  )}
                </div>

                <a
                  href="#contato"
                  className={cn(
                    'mt-7 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-pill px-6 text-[15px] font-semibold tracking-tight transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    plan.popular
                      ? 'bg-brand text-on-brand shadow-glow-orange hover:bg-brand-light'
                      : 'border border-line-strong bg-surface-2 text-fg hover:border-brand hover:text-brand',
                  )}
                >
                  {plan.cta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>

                <ul className="mt-7 space-y-3 border-t border-line pt-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-fg">
                      <span
                        className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand"
                        aria-hidden="true"
                      >
                        <Check className="size-3.5" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </SpotlightCard>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={0.1}>
        <p className="mt-10 text-center text-xs text-text-dim">
          Sem fidelidade. O Essencial é grátis para sempre — você só paga a taxa por reserva paga.
        </p>
      </Reveal>
    </section>
  );
}
