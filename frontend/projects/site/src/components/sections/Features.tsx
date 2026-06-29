import { Trophy, ClipboardList, MapPin, ArrowRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';

type Feature = {
  icon: LucideIcon;
  audience: string;
  title: string;
  description: string;
  points: string[];
  href: string;
  cta: string;
};

const FEATURES: Feature[] = [
  {
    icon: Trophy,
    audience: 'Atletas',
    title: 'Jogue, ranqueie, evolua.',
    description: 'Inscrição em poucos toques e seu progresso na areia em tempo real.',
    points: ['Inscrição nas etapas', 'Chaves e resultados ao vivo', 'Ranking e histórico por categoria'],
    href: '#download',
    cta: 'Baixar o app',
  },
  {
    icon: ClipboardList,
    audience: 'Organizadores',
    title: 'Torneios sem planilha.',
    description: 'Crie etapas, gere chaves automáticas e gerencie tudo de um painel só.',
    points: ['Chaves geradas automaticamente', 'Inscrições e pagamentos', 'Resultados e ranking integrados'],
    href: '/organizadores',
    cta: 'Saiba mais',
  },
  {
    icon: MapPin,
    audience: 'Arenas',
    title: 'Sua quadra, sempre cheia.',
    description: 'Divulgue, receba torneios e conecte sua arena à comunidade da areia.',
    points: ['Perfil público da arena', 'Agenda e disponibilidade', 'Visibilidade para atletas'],
    href: '/arenas',
    cta: 'Saiba mais',
  },
];

export function Features() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-24 sm:px-6 sm:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-sm font-600 uppercase tracking-[0.2em] text-brand">O ecossistema</p>
        <h2 className="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          Tudo pra jogar, organizar e evoluir
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-text-mute sm:text-lg">
          Um app que conecta os três lados do esporte de areia — do primeiro saque ao título.
        </p>
      </Reveal>

      <div className="mt-16 grid gap-5 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.audience} delay={i * 0.08} className="h-full">
            <Link
              href={f.href}
              className="group flex h-full flex-col rounded-5 border border-line bg-surface-1 p-7 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <div className="mb-6 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none">
                <f.icon className="size-6" aria-hidden="true" />
              </div>
              <p className="text-xs font-600 uppercase tracking-wider text-text-dim">{f.audience}</p>
              <h3 className="mt-1.5 font-display text-xl font-700 tracking-tight text-fg">{f.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-text-mute">{f.description}</p>
              <ul className="mt-6 space-y-2.5 border-t border-line pt-6">
                {f.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-fg">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-600 text-brand">
                {f.cta}
                <ArrowRight
                  className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
