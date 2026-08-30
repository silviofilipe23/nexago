import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

export interface SubstitutionSlot { uid: string; name: string; }
export interface SubstitutionCandidate { uid: string; name: string; }
export interface SubstitutionSendRequest {
  replacedUid: string;
  replacedName: string;
  inviteeUid: string;
  inviteeName: string;
}

/** Dialog "Substituir atleta": escolher a vaga → buscar o substituto → enviar
 *  o convite. A busca vem por `searchFn` (injetada pelo tab) para o componente
 *  ficar puro e testável. */
@Component({
  selector: 'app-substitution-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sub-backdrop" (click)="closed.emit()">
      <div class="sub-card" (click)="$event.stopPropagation()">
        <h3 class="sub-title">Substituir atleta</h3>
        <p class="sub-hint">
          A vaga (e o pagamento dela) passa para o substituto quando ele aceitar
          o convite. Válido até a publicação das chaves.
        </p>

        <strong class="sub-step">Quem sai?</strong>
        @for (slot of slots(); track slot.uid) {
          <label class="sub-slot">
            <input
              type="radio"
              name="sub-slot"
              [checked]="replaced()?.uid === slot.uid"
              (change)="replaced.set(slot)"
            />
            {{ slot.name }}
          </label>
        }

        @if (replaced()) {
          <input
            class="sub-search"
            type="search"
            placeholder="Buscar substituto por nome"
            [value]="term()"
            (input)="term.set($any($event.target).value)"
            (keydown.enter)="search()"
          />
          <button type="button" class="sub-search-btn" [disabled]="searching()" (click)="search()">
            {{ searching() ? 'Buscando…' : 'Buscar' }}
          </button>
          @for (candidate of results(); track candidate.uid) {
            <div class="sub-result">
              <span>{{ candidate.name }}</span>
              <button
                type="button"
                [disabled]="busy()"
                (click)="send.emit({
                  replacedUid: replaced()!.uid,
                  replacedName: replaced()!.name,
                  inviteeUid: candidate.uid,
                  inviteeName: candidate.name,
                })"
              >
                Convidar
              </button>
            </div>
          }
        }

        <button type="button" class="sub-close" (click)="closed.emit()">Fechar</button>
      </div>
    </div>
  `,
  styles: `
    .sub-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: grid; place-items: center; z-index: 60; padding: 16px; }
    .sub-card { background: var(--nx-surface, #fff); color: inherit; border-radius: 16px; padding: 20px; width: min(420px, 100%); max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    .sub-title { margin: 0; font-size: 1.05rem; }
    .sub-hint { margin: 0; font-size: 0.85rem; opacity: 0.75; }
    .sub-step { font-size: 0.9rem; }
    .sub-slot { display: flex; gap: 8px; align-items: center; font-size: 0.95rem; }
    .sub-search { padding: 10px 12px; border-radius: 10px; border: 1px solid rgb(128 128 128 / 0.35); background: transparent; color: inherit; }
    .sub-result { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0; }
  `,
})
export class SubstitutionDialogComponent {
  readonly slots = input.required<SubstitutionSlot[]>();
  readonly busy = input(false);
  readonly searchFn = input.required<(term: string) => Promise<SubstitutionCandidate[]>>();
  readonly closed = output<void>();
  readonly send = output<SubstitutionSendRequest>();

  protected readonly replaced = signal<SubstitutionSlot | null>(null);
  protected readonly term = signal('');
  protected readonly results = signal<SubstitutionCandidate[]>([]);
  protected readonly searching = signal(false);

  protected async search(): Promise<void> {
    const term = this.term().trim();
    if (term.length < 2 || this.searching()) return;
    this.searching.set(true);
    try {
      this.results.set(await this.searchFn()(term));
    } finally {
      this.searching.set(false);
    }
  }
}
