import type { Metadata } from 'next';
import { Mail, MapPin, Building2 } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ContactForm } from '@/components/sections/ContactForm';

function InstagramIcon() {
  return (
    <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: 'Contato',
  description:
    'Fale com o nexaGO. Tire dúvidas, proponha parcerias ou envie uma mensagem para a equipe do ecossistema de esportes de areia.',
  alternates: { canonical: '/contato' },
  openGraph: {
    title: 'Contato · nexaGO',
    description: 'Fale com a equipe do nexaGO — dúvidas, parcerias e suporte.',
    url: '/contato',
  },
};

const CONTACT_EMAIL = 'contato@nexago.com.br';
const ADDRESS = 'Rua Pais Leme, 215, Conj 1713, Pinheiros, São Paulo, SP, 05424-150';
const COMPANY = 'nexaGO - NRS Desenvolvimento De Programas De Computador Sob Encomenda Ltda';

export default function ContatoPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <Reveal className="max-w-2xl">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Contato</p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Vamos conversar
        </h1>
        <p className="mt-4 text-balance text-base leading-relaxed text-text-mute sm:text-lg">
          Dúvidas, parcerias ou suporte? Escreva pelo formulário ou fale direto pelos nossos canais —
          a gente responde o quanto antes.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Formulário */}
        <Reveal>
          <div className="rounded-5 border border-line bg-surface-1 p-6 sm:p-8">
            <h2 className="font-display text-xl font-700 tracking-tight text-fg">Envie uma mensagem</h2>
            <p className="mt-2 text-sm text-text-mute">Respondemos no e-mail informado.</p>
            <div className="mt-7">
              <ContactForm />
            </div>
          </div>
        </Reveal>

        {/* Canais diretos */}
        <Reveal delay={0.08}>
          <div className="flex flex-col gap-4">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="group flex items-start gap-4 rounded-5 border border-line bg-surface-1 p-6 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
                <Mail className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-display text-base font-700 tracking-tight text-fg">E-mail</span>
                <span className="mt-0.5 block text-sm text-text-mute transition-colors group-hover:text-fg">
                  {CONTACT_EMAIL}
                </span>
              </span>
            </a>

            <a
              href="https://www.instagram.com/nexagobr"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-4 rounded-5 border border-line bg-surface-1 p-6 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
                <InstagramIcon />
              </span>
              <span>
                <span className="block font-display text-base font-700 tracking-tight text-fg">Instagram</span>
                <span className="mt-0.5 block text-sm text-text-mute transition-colors group-hover:text-fg">
                  @nexagobr
                </span>
              </span>
            </a>

            <div className="flex items-start gap-4 rounded-5 border border-line bg-surface-1 p-6">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
                <MapPin className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-display text-base font-700 tracking-tight text-fg">Endereço</span>
                <address className="mt-0.5 block text-sm not-italic leading-relaxed text-text-mute">{ADDRESS}</address>
              </span>
            </div>

            <div className="flex items-start gap-4 rounded-5 border border-line bg-surface-1 p-6">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
                <Building2 className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-display text-base font-700 tracking-tight text-fg">Empresa</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-text-mute">{COMPANY}</span>
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
