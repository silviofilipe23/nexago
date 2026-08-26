import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { submitContactLead } from './contact-writes';

type Status = 'idle' | 'loading' | 'success' | 'error';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const INPUT_CLASS =
  'min-h-[48px] w-full rounded-3 border border-line-strong bg-surface-0 px-4 text-[15px] text-fg placeholder:text-text-dim focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Porta de `ContactForm.tsx` (site Next.js). Mesma validação client-side do original
 * (nome ≥2 chars, e-mail via regex, mensagem ≥2 chars, telefone opcional) rodada no submit —
 * mantém FormGroup/FormControl (reactive forms) pro data binding, mas a checagem é a mesma
 * função imperativa do source em vez de `Validators.*`, pra reproduzir a UX 1:1 (uma única
 * mensagem de erro combinada, não erro por campo). `contact-writes.ts` revalida do mesmo jeito
 * como rede de segurança antes do `addDoc`.
 */
@Component({
  selector: 'app-contact-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonDirective],
  host: { class: 'contents' },
  template: `
    @if (status() === 'success') {
      <p
        aria-live="polite"
        class="inline-flex items-center gap-2 rounded-pill border border-win/30 bg-surface-0 px-5 py-3 text-sm font-600 text-win"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 5-5" />
        </svg>
        Mensagem enviada! Em breve a gente responde.
      </p>
    } @else {
      <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="grid gap-4 sm:grid-cols-2">
        <div class="sm:col-span-1">
          <label for="contact-name" class="mb-1.5 block text-sm font-600 text-fg">Nome</label>
          <input
            id="contact-name"
            type="text"
            autocomplete="name"
            required
            placeholder="Seu nome"
            formControlName="name"
            class="{{ inputClass }}"
          />
        </div>
        <div class="sm:col-span-1">
          <label for="contact-phone" class="mb-1.5 block text-sm font-600 text-fg">
            Telefone <span class="font-400 text-text-dim">(opcional)</span>
          </label>
          <input
            id="contact-phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="(00) 00000-0000"
            formControlName="phone"
            class="{{ inputClass }}"
          />
        </div>
        <div class="sm:col-span-2">
          <label for="contact-email" class="mb-1.5 block text-sm font-600 text-fg">E-mail</label>
          <input
            id="contact-email"
            type="email"
            inputmode="email"
            autocomplete="email"
            required
            placeholder="seu@email.com"
            formControlName="email"
            class="{{ inputClass }}"
          />
        </div>
        <div class="sm:col-span-2">
          <label for="contact-message" class="mb-1.5 block text-sm font-600 text-fg">Mensagem</label>
          <textarea
            id="contact-message"
            rows="4"
            required
            placeholder="Como podemos ajudar?"
            formControlName="message"
            class="{{ inputClass }} min-h-[112px] resize-y py-3"
          ></textarea>
        </div>

        <div class="sm:col-span-2">
          <button
            nxButton="primary"
            type="submit"
            [disabled]="status() === 'loading'"
            class="w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            @if (status() === 'loading') {
              <svg
                class="size-4 animate-spin motion-reduce:animate-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Enviando
            } @else {
              Enviar mensagem
              <svg
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            }
          </button>
        </div>

        @if (status() === 'error') {
          <p aria-live="assertive" class="text-sm text-live sm:col-span-2">{{ errorMessage() }}</p>
        }
      </form>
    }
  `,
})
export class ContactForm {
  private readonly fb = inject(FormBuilder);

  protected readonly inputClass = INPUT_CLASS;
  protected readonly status = signal<Status>('idle');
  protected readonly errorMessage = signal('');

  protected readonly form = this.fb.nonNullable.group({
    name: [''],
    phone: [''],
    email: [''],
    message: [''],
  });

  protected async onSubmit(): Promise<void> {
    const { name, email, phone, message } = this.form.getRawValue();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedMessage = message.trim();

    if (trimmedName.length < 2 || !EMAIL_RE.test(trimmedEmail) || trimmedMessage.length < 2) {
      this.status.set('error');
      this.errorMessage.set('Preencha nome, e-mail válido e mensagem.');
      return;
    }

    this.status.set('loading');
    this.errorMessage.set('');

    const result = await submitContactLead({
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      message: trimmedMessage,
    });

    if (result.ok) {
      this.status.set('success');
      this.form.reset({ name: '', phone: '', email: '', message: '' });
    } else {
      this.status.set('error');
      this.errorMessage.set(result.error);
    }
  }
}
