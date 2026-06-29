import type { Metadata } from 'next';
import { Flag, Users, Waves } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { SpotlightCard } from '@/components/ui/spotlight-card';

export const metadata: Metadata = {
  title: 'Sobre o nexaGO',
  description:
    'O nexaGO conecta atletas, organizadores e arenas dos esportes de areia. Conheça o manifesto e a missão por trás da plataforma de beach tennis e vôlei de praia.',
  alternates: { canonical: '/sobre' },
  openGraph: {
    title: 'Sobre · nexaGO',
    description: 'O ecossistema dos esportes de areia: torneios, ranking e a Liga nexaGO.',
    url: '/sobre',
  },
};

const VALUES = [
  {
    icon: Waves,
    title: 'A areia em primeiro lugar',
    description:
      'Cada decisão de produto nasce de quem vive a quadra — do primeiro saque do iniciante ao match point do Open.',
  },
  {
    icon: Users,
    title: 'Comunidade que joga junto',
    description:
      'Atletas, organizadores e arenas no mesmo lugar. Quando a comunidade cresce, a temporada inteira ganha.',
  },
  {
    icon: Flag,
    title: 'Circuito de verdade',
    description:
      'Etapas, pontuação acumulada e ranking nacional. A Liga nexaGO transforma jogos avulsos em uma jornada.',
  },
];

export default function SobrePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <Reveal>
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
          Nosso manifesto
        </p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.75rem)] font-800 leading-[1.05] tracking-tight text-fg">
          Movemos a areia do Brasil.
        </h1>
        <p className="mt-6 text-balance text-lg leading-relaxed text-text-mute">
          O nexaGO nasceu na quadra. Cansamos de inscrições em planilhas, chaves em papel e
          torneios sem organização e desnivelados. Os esportes de areia e o vôlei de praia mereciam uma casa digital à altura
          da sua energia — e foi isso que construímos.
        </p>
        <p className="mt-5 text-balance text-base leading-relaxed text-text-mute">
          Beach tennis e vôlei de praia movem milhares de pessoas todo fim de semana. Nossa missão
          é simples: conectar quem joga, quem organiza e quem recebe os jogos, e transformar essa
          paixão em um circuito vivo, com a Liga nexaGO no centro.
        </p>
      </Reveal>

      <div className="mt-16 grid gap-5 sm:grid-cols-3">
        {VALUES.map((v, i) => (
          <Reveal key={v.title} delay={i * 0.08} className="h-full">
            <SpotlightCard as="article" className="h-full p-7">
              <div className="mb-5 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand transition-transform duration-300 ease-out group-hover/spot:-translate-y-0.5 group-hover/spot:scale-105 motion-reduce:transition-none">
                <v.icon className="size-6" aria-hidden="true" />
              </div>
              <h2 className="font-display text-lg font-700 tracking-tight text-fg">{v.title}</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-text-mute">{v.description}</p>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1} className="mt-16 text-center">
        <ButtonLink href="/#download">Baixar o app</ButtonLink>
      </Reveal>
    </main>
  );
}
