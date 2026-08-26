import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RevealDirective } from '../../../shared/reveal.directive';
import { submitWaitlist } from './public-writes';

type Status = 'idle' | 'loading' | 'success' | 'error';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Porta de `Waitlist` (site Next.js) — cadastro de newsletter, grava em `waitlist` (Firestore). */
@Component({
  selector: 'app-waitlist-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RevealDirective],
  template: `
    <section class="relative mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal>
        <div
          (mousemove)="onSpotlightMove($event)"
          class="group/spot relative overflow-hidden rounded-5 border border-brand/20 bg-surface-1 px-7 py-12 text-center transition-colors duration-300 hover:border-brand/40 sm:px-14 sm:py-16"
        >
          <div
            aria-hidden="true"
            class="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full"
            style="background: radial-gradient(closest-side, rgba(255,106,26,0.22), transparent 70%)"
          ></div>
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
            style="background: radial-gradient(400px circle at var(--mx, 50%) var(--my, 50%), rgba(255,106,26,0.12), transparent 60%)"
          ></span>

          <div class="relative">
            <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Newsletter</p>
            <h2 class="font-display text-[clamp(1.8rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
              O que acontece na areia, na sua caixa de entrada
            </h2>
            <p class="mx-auto mt-4 max-w-md text-balance text-base text-text-mute sm:text-lg">
              Fique por dentro dos torneios abertos, novidades do app, ligas e arenas parceiras — sem spam, só o que
              importa pra quem vive o esporte de areia.
            </p>

            @if (status() === 'success') {
              <p
                aria-live="polite"
                class="mx-auto mt-8 inline-flex items-center gap-2 rounded-pill border border-win/30 bg-surface-0 px-5 py-3 text-sm font-600 text-win"
              >
                <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21.801 10A10 10 0 1 1 17 3.335" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
                Inscrito! Fique de olho no seu e-mail.
              </p>
            } @else {
              <form (ngSubmit)="onSubmit()" [formGroup]="form" novalidate class="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
                <label for="newsletter-email" class="sr-only">Seu melhor e-mail</label>
                <input
                  id="newsletter-email"
                  type="email"
                  name="email"
                  inputmode="email"
                  autocomplete="email"
                  required
                  placeholder="seu@email.com"
                  formControlName="email"
                  (input)="onEmailInput()"
                  class="min-h-[48px] flex-1 rounded-pill border border-line-strong bg-surface-0 px-5 text-[15px] text-fg placeholder:text-text-dim focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                />
                <button
                  type="submit"
                  [disabled]="status() === 'loading'"
                  class="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-pill bg-brand px-6 text-[15px] font-semibold tracking-tight text-on-brand shadow-glow-orange transition-all duration-200 ease-out hover:bg-brand-light active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  @if (status() === 'loading') {
                    <svg class="size-4 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Enviando
                  } @else {
                    Assinar
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  }
                </button>
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
export class WaitlistSection {
  private readonly formBuilder = inject(FormBuilder).nonNullable;

  protected readonly form = this.formBuilder.group({
    email: this.formBuilder.control(''),
  });

  protected readonly status = signal<Status>('idle');
  protected readonly message = signal('');

  protected onSpotlightMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  protected onEmailInput(): void {
    if (this.status() === 'error') this.status.set('idle');
  }

  protected async onSubmit(): Promise<void> {
    const email = this.form.controls.email.value.trim();
    if (!EMAIL_RE.test(email)) {
      this.status.set('error');
      this.message.set('Informe um e-mail válido.');
      return;
    }

    this.status.set('loading');
    this.message.set('');
    try {
      const result = await submitWaitlist(email);
      if (!result.ok) throw new Error(result.error);
      this.status.set('success');
      this.form.reset({ email: '' });
    } catch (err) {
      this.status.set('error');
      this.message.set(err instanceof Error ? err.message : 'Não foi possível salvar agora.');
    }
  }
}
