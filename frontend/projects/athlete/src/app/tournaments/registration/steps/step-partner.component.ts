import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

import { MOCK_PARTNER_SUGGESTIONS } from '../registration-partners.mock';
import { TournamentRegistrationService } from '../tournament-registration.service';

@Component({
  selector: 'app-step-partner',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './step-partner.component.html',
  styleUrl: './step-partner.component.scss',
})
export class StepPartnerComponent {
  private readonly reg = inject(TournamentRegistrationService);
  private readonly fb = inject(FormBuilder);

  protected readonly suggestions = MOCK_PARTNER_SUGGESTIONS;

  /** Primeiros 3 — vitrine “disponíveis agora”. */
  protected readonly spotlightSuggestions = computed(() => this.suggestions.slice(0, 3));

  protected readonly partner = toSignal(this.reg.selectedPartner$, { initialValue: null });

  protected readonly pickFlash = signal(false);

  protected readonly inviteForm = this.fb.nonNullable.group({
    target: ['', [Validators.required, Validators.minLength(2)]],
  });

  protected readonly searchQuery = this.fb.nonNullable.control('');

  private readonly searchQ = toSignal(
    this.searchQuery.valueChanges.pipe(startWith(this.searchQuery.value)),
    { initialValue: this.searchQuery.value },
  );

  /** Demais sugestões sem busca; com busca, filtra em toda a lista. */
  protected readonly searchResults = computed(() => {
    const q = this.searchQ().trim().toLowerCase();
    if (!q) {
      return this.suggestions.slice(3);
    }
    return this.suggestions.filter(
      (s) => s.displayName.toLowerCase().includes(q) || s.handle.toLowerCase().includes(q),
    );
  });

  /** Só mostra “vazio” quando o usuário digitou e não há match. */
  protected readonly searchEmptyNoResults = computed(() => {
    const q = this.searchQ().trim();
    return q.length > 0 && this.searchResults().length === 0;
  });

  protected isPartnerId(id: string): boolean {
    return this.partner()?.id === id;
  }

  protected submitInvite(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    this.reg.invitePartner(this.inviteForm.controls.target.value);
    this.triggerPickFeedback();
  }

  protected pickExisting(id: string): void {
    this.reg.pickExistingSuggestion(id);
    this.triggerPickFeedback();
  }

  protected runMatchmaking(): void {
    this.reg.findMatchmakingPartner();
    this.triggerPickFeedback();
  }

  protected continue(): void {
    this.reg.advanceFromPartner();
  }

  /** Feedback “wow”: flash visual + vibração leve no mobile (best-effort). */
  private triggerPickFeedback(): void {
    if (typeof globalThis.navigator !== 'undefined' && 'vibrate' in globalThis.navigator) {
      try {
        globalThis.navigator.vibrate(14);
      } catch {
        /* ignore */
      }
    }
    this.pickFlash.set(true);
    globalThis.setTimeout(() => this.pickFlash.set(false), 850);
  }
}
