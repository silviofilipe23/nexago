import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClubePartnerLogoComponent } from './clube-partner-logo.component';
import { consentTextFor, emphasize, maskCep, validateLead, type ClubSource, type Partner } from './clube.logic';
import type { ClubAthleteProfile } from './data/clube-api';
import { ClubStore } from './data/clube.store';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type LeadField = 'name' | 'whatsapp' | 'neighborhood' | 'cep';

/**
 * "Quero contratar" em modal: nome e WhatsApp vêm do perfil, bairro e CEP o atleta digita, e nada
 * sai sem a caixa de consentimento marcada (o servidor grava o mesmo texto que a tela mostra).
 * Fecha com Esc, prende o Tab e devolve o foco ao botão que abriu.
 */
@Component({
  selector: 'app-clube-lead-modal',
  imports: [RouterLink, ClubePartnerLogoComponent],
  templateUrl: './clube-lead-modal.component.html',
  styleUrl: './clube-lead-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Esc no documento: depois do envio o formulário sai da tela e o foco poderia cair no body.
  host: { '(keydown)': 'onKeydown($event)', '(document:keydown.escape)': 'onEscape($event)' },
})
export class ClubeLeadModalComponent implements OnDestroy {
  readonly partner = input.required<Partner>();
  readonly profile = input<ClubAthleteProfile | null>(null);
  readonly source = input.required<ClubSource>();
  readonly closed = output<void>();

  private readonly store = inject(ClubStore);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  /** Pré-preenchidos do perfil (`users/{uid}`); o atleta pode corrigir. */
  protected readonly name = linkedSignal(() => this.profile()?.name ?? '');
  protected readonly whatsapp = linkedSignal(() => this.profile()?.whatsapp ?? '');
  protected readonly neighborhood = signal('');
  protected readonly cep = signal('');
  protected readonly consent = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  /** O texto aceito, com o nome do parceiro em destaque como no desenho. */
  protected readonly consentParts = computed(() =>
    emphasize(consentTextFor(this.partner()), [this.partner().name]),
  );
  protected readonly titleId = `clube-lead-title-${Math.random().toString(36).slice(2, 8)}`;

  constructor() {
    document.body.style.overflow = 'hidden';
    afterNextRender(() => {
      // Nome e WhatsApp já vêm do perfil: o foco cai no primeiro campo vazio.
      const inputs = Array.from(this.el.nativeElement.querySelectorAll<HTMLInputElement>('input.cl-input'));
      (inputs.find((i) => i.value.trim() === '') ?? inputs[0])?.focus();
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.previouslyFocused?.focus();
  }

  protected setField(field: LeadField, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.error.set(null);
    switch (field) {
      case 'name':
        this.name.set(value);
        return;
      case 'whatsapp':
        this.whatsapp.set(value);
        return;
      case 'neighborhood':
        this.neighborhood.set(value);
        return;
      case 'cep': {
        const masked = maskCep(value);
        this.cep.set(masked);
        // Reescreve o campo na hora (o signal pode não mudar se a máscara deu o mesmo texto).
        (event.target as HTMLInputElement).value = masked;
        return;
      }
    }
  }

  protected setConsent(event: Event): void {
    this.consent.set((event.target as HTMLInputElement).checked);
    this.error.set(null);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.sending()) return;
    const result = validateLead({
      partnerId: this.partner().id,
      name: this.name(),
      whatsapp: this.whatsapp(),
      neighborhood: this.neighborhood(),
      cep: this.cep(),
      consent: this.consent(),
    });
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      this.success.set(await this.store.submitLead(this.partner(), result.lead, this.source()));
      // O botão Enviar sumiu com o formulário: o foco vai para o "Fechar" do sucesso.
      afterNextRender(() => this.el.nativeElement.querySelector<HTMLElement>('.lm-success-close')?.focus(), {
        injector: this.injector,
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível enviar agora. Tente de novo.');
    } finally {
      this.sending.set(false);
    }
  }

  protected close(): void {
    if (!this.sending()) this.closed.emit();
  }

  protected onEscape(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    // Prende o Tab no diálogo (mesmo racional do nx-blocking-dialog).
    const items = this.focusable();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
  }
}
