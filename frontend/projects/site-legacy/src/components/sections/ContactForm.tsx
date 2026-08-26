'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { submitLead } from '@/lib/firestore/public-writes';

type Status = 'idle' | 'loading' | 'success' | 'error';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const inputClass =
  'min-h-[48px] w-full rounded-3 border border-line-strong bg-surface-0 px-4 text-[15px] text-fg placeholder:text-text-dim focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const phone = String(data.get('phone') ?? '').trim();
    const msg = String(data.get('message') ?? '').trim();

    if (name.length < 2 || !EMAIL_RE.test(email) || msg.length < 2) {
      setStatus('error');
      setMessage('Preencha nome, e-mail válido e mensagem.');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const result = await submitLead({ name, email, phone, org: '', message: msg, persona: 'geral' });
      if (!result.ok) throw new Error(result.error);
      setStatus('success');
      form.reset();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Não foi possível enviar agora.');
    }
  }

  if (status === 'success') {
    return (
      <p
        aria-live="polite"
        className="inline-flex items-center gap-2 rounded-pill border border-win/30 bg-surface-0 px-5 py-3 text-sm font-600 text-win"
      >
        <CheckCircle2 className="size-5" aria-hidden="true" />
        Mensagem enviada! Em breve a gente responde.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-1">
        <label htmlFor="contact-name" className="mb-1.5 block text-sm font-600 text-fg">
          Nome
        </label>
        <input id="contact-name" name="name" type="text" autoComplete="name" required placeholder="Seu nome" className={inputClass} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="contact-phone" className="mb-1.5 block text-sm font-600 text-fg">
          Telefone <span className="font-400 text-text-dim">(opcional)</span>
        </label>
        <input id="contact-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="contact-email" className="mb-1.5 block text-sm font-600 text-fg">
          E-mail
        </label>
        <input id="contact-email" name="email" type="email" inputMode="email" autoComplete="email" required placeholder="seu@email.com" className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-600 text-fg">
          Mensagem
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={4}
          required
          placeholder="Como podemos ajudar?"
          className={`${inputClass} min-h-[112px] resize-y py-3`}
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
              Enviar mensagem
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      {status === 'error' && (
        <p aria-live="assertive" className="text-sm text-live sm:col-span-2">
          {message}
        </p>
      )}
    </form>
  );
}
