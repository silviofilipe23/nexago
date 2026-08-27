import { Check } from 'lucide-react';
import { FaqAccordion } from '@/components/sections/FaqAccordion';
import { FlowSteps } from './FlowSteps';
import { ScreenFigure } from './ScreenFigure';
import type { DocFeature } from '@/lib/docs/types';

export function FeatureSection({ feature }: { feature: DocFeature }) {
  const Icon = feature.icon;
  const phoneFigure = feature.screen && (feature.screen.kind === 'image' || feature.screen.frame === 'phone');

  return (
    <section id={feature.id} aria-labelledby={`${feature.id}-title`} className="scroll-mt-28 border-t border-line pt-12">
      <div className={phoneFigure ? 'grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-12' : ''}>
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <span className="mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-3 bg-brand-tint text-brand" aria-hidden="true">
              <Icon className="size-5" />
            </span>
            <div>
              <h3 id={`${feature.id}-title`} className="font-display text-2xl font-bold tracking-tight text-fg">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-base leading-relaxed text-text-mute">{feature.summary}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {feature.body.map((paragraph, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-text-mute">
                {paragraph}
              </p>
            ))}
          </div>

          {feature.rules && feature.rules.length > 0 && (
            <div className="mt-6 rounded-4 border border-line bg-surface-1 p-5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
                Regras que valem aqui
              </p>
              <ul className="mt-3 space-y-2.5">
                {feature.rules.map((rule) => (
                  <li key={rule} className="flex gap-2.5 text-sm leading-relaxed text-text-mute">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {feature.screen && phoneFigure && (
          <div className="lg:pt-2">
            <ScreenFigure screen={feature.screen} />
          </div>
        )}
      </div>

      {feature.screen && !phoneFigure && (
        <div className="mt-8">
          <ScreenFigure screen={feature.screen} />
        </div>
      )}

      {feature.flows && feature.flows.length > 0 && (
        <div className="mt-8 space-y-6">
          {feature.flows.map((flow) => (
            <FlowSteps key={flow.title} flow={flow} />
          ))}
        </div>
      )}

      {feature.faq && feature.faq.length > 0 && <FaqAccordion items={feature.faq} className="mt-8" />}
    </section>
  );
}
