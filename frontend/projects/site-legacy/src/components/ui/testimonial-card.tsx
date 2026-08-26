import { Quote } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/spotlight-card';

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
};

/** Card de depoimento sobre o SpotlightCard (glow follow-cursor + lift). */
export function TestimonialCard({ quote, name, role }: Testimonial) {
  return (
    <SpotlightCard as="figure" className="flex h-full flex-col p-7">
      <Quote
        className="size-6 text-brand transition-transform duration-300 ease-out group-hover/spot:scale-110 motion-reduce:transition-none"
        aria-hidden="true"
      />
      <blockquote className="mt-4 flex-1 text-base leading-relaxed text-fg">“{quote}”</blockquote>
      <figcaption className="mt-6 border-t border-line pt-5">
        <div className="font-display text-sm font-700 tracking-tight text-fg">{name}</div>
        <div className="mt-0.5 text-xs text-text-mute">{role}</div>
      </figcaption>
    </SpotlightCard>
  );
}
