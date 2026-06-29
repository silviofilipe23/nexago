'use client';

import { useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';

type Status = 'idle' | 'loading' | 'success' | 'error';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function onSpotlightMove(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export function Waitlist() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setStatus('error');
      setMessage('Informe um e-mail válido.');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Não foi possível salvar agora.');
      }
      setStatus('success');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar agora.');
    }
  }

  return (
    <section className="relative mx-auto max-w-3xl px-5 py-24 sm:px-6 sm:py-32">
      <Reveal>
        <div
          onMouseMove={onSpotlightMove}
          className="group/spot relative overflow-hidden rounded-5 border border-brand/20 bg-surface-1 px-7 py-12 text-center transition-colors duration-300 hover:border-brand/40 sm:px-14 sm:py-16"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgba(255,106,26,0.22), transparent 70%)' }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
            style={{
              background:
                'radial-gradient(400px circle at var(--mx, 50%) var(--my, 50%), rgba(255,106,26,0.12), transparent 60%)',
            }}
          />

          <div className="relative">
            <h2 className="font-display text-[clamp(1.8rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
              Entre na lista da Liga
            </h2>
            <p className="mx-auto mt-4 max-w-md text-balance text-base text-text-mute sm:text-lg">
              Receba em primeira mão a abertura das inscrições da 1ª etapa e novidades do circuito.
            </p>

            {status === 'success' ? (
              <p
                aria-live="polite"
                className="mx-auto mt-8 inline-flex items-center gap-2 rounded-pill border border-win/30 bg-surface-0 px-5 py-3 text-sm font-600 text-win"
              >
                <CheckCircle2 className="size-5" aria-hidden="true" />
                Pronto! Você está na lista.
              </p>
            ) : (
              <form
                onSubmit={onSubmit}
                noValidate
                className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
              >
                <label htmlFor="waitlist-email" className="sr-only">
                  Seu melhor e-mail
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  name="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                  className="min-h-[48px] flex-1 rounded-pill border border-line-strong bg-surface-0 px-5 text-[15px] text-fg placeholder:text-text-dim focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-pill bg-brand px-6 text-[15px] font-semibold tracking-tight text-on-brand shadow-glow-orange transition-all duration-200 ease-out hover:bg-brand-light active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      Enviando
                    </>
                  ) : (
                    <>
                      Quero entrar
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </button>
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
