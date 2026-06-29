import { Reveal } from '@/components/motion/Reveal';
import { TestimonialsMarquee } from '@/components/sections/TestimonialsMarquee';
import type { Testimonial } from '@/components/ui/testimonial-card';

// TODO: substituir por depoimentos reais (atletas, organizadores e arenas parceiras).
const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Inscrevi minha dupla em segundos e acompanhei a chave ao vivo da arquibancada. Mudou como a gente vive o torneio.',
    name: 'Marina Costa',
    role: 'Atleta · Beach tennis',
  },
  {
    quote:
      'Larguei as planilhas. Gero as chaves automaticamente e o ranking se atualiza sozinho a cada etapa.',
    name: 'Rafael Menezes',
    role: 'Organizador · Circuito Litoral',
  },
  {
    quote:
      'Minha arena passou a receber etapas da Liga e a agenda encheu. A comunidade da areia chegou junto.',
    name: 'Arena Maré Alta',
    role: 'Arena parceira · Florianópolis',
  },
  {
    quote:
      'Ver meu ranking subir a cada etapa me deu um gás novo pra treinar. Virou parte da minha rotina.',
    name: 'Lucas Andrade',
    role: 'Atleta · Vôlei de praia',
  },
  {
    quote:
      'As inscrições com pagamento no app reduziram meu trabalho de bastidor pela metade.',
    name: 'Juliana Prado',
    role: 'Organizadora · Open da Areia',
  },
  {
    quote:
      'O perfil público trouxe atletas que nem sabiam que a gente existia. Ótimo retorno.',
    name: 'Beach Point',
    role: 'Arena parceira · Santos',
  },
];

// TODO: trocar por logos reais em public/brand/partners quando disponíveis.
const PARTNERS = ['Arena Maré Alta', 'Beach Point', 'Areia Viva', 'Praia Club', 'Costa Norte'];

export function ProvaSocial() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-24 sm:px-6 sm:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
          Quem joga, confia
        </p>
        <h2 className="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          A areia toda em um só lugar
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-text-mute sm:text-lg">
          Atletas, organizadores e arenas já fazem a temporada acontecer pelo nexaGO.
        </p>
      </Reveal>

      <TestimonialsMarquee testimonials={TESTIMONIALS} />

      <Reveal delay={0.1} className="mt-16">
        <p className="text-center font-mono text-xs font-600 uppercase tracking-[0.2em] text-text-dim">
          Arenas parceiras
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {PARTNERS.map((p) => (
            <li
              key={p}
              className="font-display text-base font-700 tracking-tight text-text-mute transition-[color,transform] duration-200 ease-out hover:scale-105 hover:text-fg motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
