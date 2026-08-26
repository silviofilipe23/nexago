import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RevealDirective } from '../../../shared/reveal.directive';
import { submitLead } from './public-writes';

type LeadPersona = 'organizador' | 'arena';
type Status = 'idle' | 'loading' | 'success' | 'error';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface PersonaCopy {
  title: string;
  subtitle: string;
  orgLabel: string;
  orgPlaceholder: string;
}

const COPY: Record<LeadPersona, PersonaCopy> = {
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

const INPUT_CLASS =
  'min-h-[48px] w-full rounded-3 border border-line-strong bg-surface-0 px-4 text-[15px] text-fg placeholder:text-text-dim focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Porta de `LeadForm` (site Next.js) — formulário de contato B2B (organizador/arena), grava em
 * `leads` (Firestore). Usado nas páginas `/organizadores` e `/arenas` (fora do escopo desta
 * seção — não aparece diretamente na home).
 */
@Component({
  selector: 'app-lead-form-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RevealDirective],
  template: `
    <section [id]="id()" class="relative mx-auto max-w-2xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal>
        <div class="relative overflow-hidden rounded-5 border border-brand/20 bg-surface-1 px-6 py-10 sm:px-10 sm:py-12">
          <div
            aria-hidden="true"
            class="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full"
            style="background: radial-gradient(closest-side, rgba(255,106,26,0.20), transparent 70%)"
          ></div>

          <div class="relative">
            <h2 class="font-display text-[clamp(1.6rem,4.5vw,2.5rem)] font-700 leading-tight tracking-tight text-fg">
              {{ copy().title }}
            </h2>
            <p class="mt-3 max-w-md text-balance text-base text-text-mute">{{ copy().subtitle }}</p>

            @if (status() === 'success') {
              <p
                aria-live="polite"
                class="mt-8 inline-flex items-center gap-2 rounded-pill border border-win/30 bg-surface-0 px-5 py-3 text-sm font-600 text-win"
              >
                <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21.801 10A10 10 0 1 1 17 3.335" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
                Recebemos seu contato! Em breve a gente fala com você.
              </p>
            } @else {
              <form (ngSubmit)="onSubmit()" [formGroup]="form" novalidate class="mt-8 grid gap-4 sm:grid-cols-2">
                <div class="sm:col-span-1">
                  <label for="lead-name" class="mb-1.5 block text-sm font-600 text-fg">Nome</label>
                  <input id="lead-name" type="text" autocomplete="name" required placeholder="Seu nome" formControlName="name" [class]="inputClass" />
                </div>
                <div class="sm:col-span-1">
                  <label for="lead-phone" class="mb-1.5 block text-sm font-600 text-fg">Telefone / WhatsApp</label>
                  <input id="lead-phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="(00) 00000-0000" formControlName="phone" [class]="inputClass" />
                </div>
                <div class="sm:col-span-2">
                  <label for="lead-email" class="mb-1.5 block text-sm font-600 text-fg">E-mail</label>
                  <input id="lead-email" type="email" inputmode="email" autocomplete="email" required placeholder="seu@email.com" formControlName="email" [class]="inputClass" />
                </div>
                <div class="sm:col-span-2">
                  <label for="lead-org" class="mb-1.5 block text-sm font-600 text-fg">{{ copy().orgLabel }}</label>
                  <input id="lead-org" type="text" [placeholder]="copy().orgPlaceholder" formControlName="org" [class]="inputClass" />
                </div>
                <div class="sm:col-span-2">
                  <label for="lead-message" class="mb-1.5 block text-sm font-600 text-fg">
                    Mensagem <span class="font-400 text-text-dim">(opcional)</span>
                  </label>
                  <textarea
                    id="lead-message"
                    rows="3"
                    placeholder="Conte um pouco sobre o que você precisa"
                    formControlName="message"
                    [class]="inputClass + ' min-h-[88px] resize-y py-3'"
                  ></textarea>
                </div>

                <div class="sm:col-span-2">
                  <button
                    type="submit"
                    [disabled]="status() === 'loading'"
                    class="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand px-6 text-[15px] font-semibold tracking-tight text-on-brand shadow-glow-orange transition-all duration-200 ease-out hover:bg-brand-light active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
                  >
                    @if (status() === 'loading') {
                      <svg class="size-4 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Enviando
                    } @else {
                      Enviar contato
                      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    }
                  </button>
                </div>
              </form>
            }

            @if (status() === 'error') {
              <p aria-live="assertive" class="mt-4 text-sm text-live">{{ message() }}</p>
            }
          </div>
        </div>
      </div>
    </section>
  `,
})
export class LeadFormSection {
  readonly persona = input.required<LeadPersona>();
  readonly id = input('contato');

  protected readonly copy = computed(() => COPY[this.persona()]);
  protected readonly inputClass = INPUT_CLASS;

  private readonly formBuilder = inject(FormBuilder).nonNullable;

  protected readonly form = this.formBuilder.group({
    name: this.formBuilder.control(''),
    phone: this.formBuilder.control(''),
    email: this.formBuilder.control(''),
    org: this.formBuilder.control(''),
    message: this.formBuilder.control(''),
  });

  protected readonly status = signal<Status>('idle');
  protected readonly message = signal('');

  protected async onSubmit(): Promise<void> {
    const { name, email, phone, org, message } = this.form.getRawValue();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (trimmedName.length < 2 || !EMAIL_RE.test(trimmedEmail) || trimmedPhone.length < 8) {
      this.status.set('error');
      this.message.set('Preencha nome, e-mail e telefone válidos.');
      return;
    }

    this.status.set('loading');
    this.message.set('');
    try {
      const result = await submitLead({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        org: org.trim(),
        message: message.trim(),
        persona: this.persona(),
      });
      if (!result.ok) throw new Error(result.error);
      this.status.set('success');
      this.form.reset({ name: '', phone: '', email: '', org: '', message: '' });
    } catch (err) {
      this.status.set('error');
      this.message.set(err instanceof Error ? err.message : 'Não foi possível enviar agora.');
    }
  }
}
