'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';

type Persona = 'organizador' | 'arena';
type Status = 'idle' | 'loading' | 'success' | 'error';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const COPY: Record<Persona, { title: string; subtitle: string; orgLabel: string; orgPlaceholder: string }> = {
  organizador: {
    title: 'Vamos montar seu próximo torneio',
    subtitle: 'Conte sobre seu circuito e a gente te mostra como gerenciar tudo num painel só.',
    orgLabel: 'Nome do circuito / organização',
    orgPlaceholder: 'Ex.: Circuito Litoral',
  },
  arena: {
    title: 'Coloque sua arena no mapa',
    subtitle: 'Fale com a gente e comece a receber etapas e a comunidade da areia na sua quadra.',
    orgLabel: 'Nome da arena',
    orgPlaceholder: 'Ex.: Arena Maré Alta',
  },
};

const inputClass =
  'min-h-[48px] w-full rounded-3 border border-line-strong bg-surface-0 px-4 text-[15px] text-fg placeholder:text-text-dim focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

export function LeadForm({ persona, id = 'contato' }: { persona: Persona; id?: string }) {
  const copy = COPY[persona];
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const phone = String(data.get('phone') ?? '').trim();
    const org = String(data.get('org') ?? '').trim();
    const msg = String(data.get('message') ?? '').trim();

    if (name.length < 2 || !EMAIL_RE.test(email) || phone.length < 8) {
      setStatus('error');
      setMessage('Preencha nome, e-mail e telefone válidos.');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, org, message: msg, persona }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Não foi possível enviar agora.');
      }
      setStatus('success');
      form.reset();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Não foi possível enviar agora.');
    }
  }

  return (
    <section id={id} className="relative mx-auto max-w-2xl scroll-mt-24 px-5 py-24 sm:px-6 sm:py-32">
      <Reveal>
        <div className="relative overflow-hidden rounded-5 border border-brand/20 bg-surface-1 px-6 py-10 sm:px-10 sm:py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgba(255,106,26,0.20), transparent 70%)' }}
          />

          <div className="relative">
            <h2 className="font-display text-[clamp(1.6rem,4.5vw,2.5rem)] font-700 leading-tight tracking-tight text-fg">
              {copy.title}
            </h2>
            <p className="mt-3 max-w-md text-balance text-base text-text-mute">{copy.subtitle}</p>

            {status === 'success' ? (
              <p
                aria-live="polite"
                className="mt-8 inline-flex items-center gap-2 rounded-pill border border-win/30 bg-surface-0 px-5 py-3 text-sm font-600 text-win"
              >
                <CheckCircle2 className="size-5" aria-hidden="true" />
                Recebemos seu contato! Em breve a gente fala com você.
              </p>
            ) : (
              <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <label htmlFor="lead-name" className="mb-1.5 block text-sm font-600 text-fg">
                    Nome
                  </label>
                  <input id="lead-name" name="name" type="text" autoComplete="name" required placeholder="Seu nome" className={inputClass} />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="lead-phone" className="mb-1.5 block text-sm font-600 text-fg">
                    Telefone / WhatsApp
                  </label>
                  <input id="lead-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(00) 00000-0000" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="lead-email" className="mb-1.5 block text-sm font-600 text-fg">
                    E-mail
                  </label>
                  <input id="lead-email" name="email" type="email" inputMode="email" autoComplete="email" required placeholder="seu@email.com" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="lead-org" className="mb-1.5 block text-sm font-600 text-fg">
                    {copy.orgLabel}
                  </label>
                  <input id="lead-org" name="org" type="text" placeholder={copy.orgPlaceholder} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="lead-message" className="mb-1.5 block text-sm font-600 text-fg">
                    Mensagem <span className="font-400 text-text-dim">(opcional)</span>
                  </label>
                  <textarea
                    id="lead-message"
                    name="message"
                    rows={3}
                    placeholder="Conte um pouco sobre o que você precisa"
                    className={`${inputClass} min-h-[88px] resize-y py-3`}
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand px-6 text-[15px] font-semibold tracking-tight text-on-brand shadow-glow-orange transition-all duration-200 ease-out hover:bg-brand-light active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
                  >
                    {status === 'loading' ? (
                      <>
                        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        Enviando
                      </>
                    ) : (
                      <>
                        Enviar contato
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {status === 'error' && (
              <p aria-live="assertive" className="mt-4 text-sm text-live">
                {message}
              </p>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
