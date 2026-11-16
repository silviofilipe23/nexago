import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import { TournamentsRepository, type TournamentRow } from '../../torneios/data/tournaments.repository';
import { clubErrorMessage } from '../data/club-errors';
import { TOURNAMENT_IDS_MAX, parseIds } from '../data/partner-premium';

/**
 * Torneios do requisito "Inscritos em torneios" (até 10): busca pelo começo do nome (a mesma
 * consulta da lista de torneios do backoffice) ou ids colados. Os escolhidos aparecem pelo nome.
 */
@Component({
  selector: 'bo-tournament-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="chosen" aria-live="polite">
      @for (id of ids(); track id) {
        <span class="chip" [attr.title]="id">
          {{ names()[id] ?? id }}
          <button type="button" class="x" [attr.aria-label]="'Tirar ' + (names()[id] ?? id)" (click)="remove(id)">✕</button>
        </span>
      } @empty {
        <span class="none">Nenhum torneio escolhido</span>
      }
      <span class="count">{{ ids().length }}/{{ max }}</span>
    </div>

    <form class="search" (submit)="$event.preventDefault(); search()">
      <input
        class="bo-input"
        placeholder="Buscar pelo começo do nome (ex.: Goiânia Open)"
        aria-label="Buscar torneio pelo nome"
        [disabled]="full()"
        [value]="term()"
        (input)="term.set(value($event))"
      />
      <button type="submit" class="bo-mini-btn" [disabled]="full() || searching() || term().trim().length < 2">
        @if (searching()) {
          <span class="bo-spinner small" aria-hidden="true"></span>
        } @else {
          <bo-icon name="search" [size]="13" />
        }
        Buscar
      </button>
    </form>
    @if (error(); as e) {
      <span class="err">{{ e }}</span>
    }
    @if (results(); as list) {
      @if (list.length === 0) {
        <span class="hint">Nenhum torneio começa com "{{ term().trim() }}". A busca diferencia maiúsculas: tente como está no nome.</span>
      } @else {
        <ul class="results">
          @for (t of list; track t.id) {
            <li>
              <span class="nm">{{ t.name }}</span>
              <span class="meta">{{ t.startAt ? date(t.startAt) : 'sem data' }}{{ t.place ? ' · ' + t.place : '' }}</span>
              <button type="button" class="bo-mini-btn" [disabled]="full() || ids().includes(t.id)" (click)="add(t.id, t.name)">
                {{ ids().includes(t.id) ? 'Escolhido' : 'Adicionar' }}
              </button>
            </li>
          }
        </ul>
      }
    }

    <details class="paste">
      <summary>Colar ids</summary>
      <form class="search" (submit)="$event.preventDefault(); paste()">
        <input class="bo-input mono" placeholder="id1, id2" aria-label="Ids de torneio" [value]="pasted()" (input)="pasted.set(value($event))" />
        <button type="submit" class="bo-mini-btn" [disabled]="full() || pasted().trim() === ''">Adicionar</button>
      </form>
    </details>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .chosen { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); font-size: 12px; color: var(--nx-text); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .x { border: none; background: transparent; color: var(--nx-text-mute); cursor: pointer; padding: 0 0 0 2px; font-size: 11px; }
    .x:hover { color: var(--nx-live); }
    .none, .hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .count { margin-left: auto; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .search { display: flex; gap: 8px; }
    .search .bo-input { flex: 1; min-width: 0; }
    .mono { font-family: var(--nx-font-mono); }
    .err { font-size: 11.5px; color: #ff9b94; }
    .results { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); max-height: 220px; overflow: auto; }
    .results li { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; column-gap: 10px; padding: 8px 10px; border-top: 1px solid var(--nx-line); align-items: center; }
    .results li:first-child { border-top: none; }
    .results .nm { font-size: 12.5px; color: var(--nx-text); overflow-wrap: anywhere; }
    .results .meta { grid-row: 2; font-size: 11px; color: var(--nx-text-dim); }
    .results .bo-mini-btn { grid-row: 1 / span 2; grid-column: 2; }
    .paste summary { cursor: pointer; font-size: 11.5px; color: var(--nx-text-mute); }
    .paste .search { margin-top: 8px; }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }
  `,
})
export class TournamentPickerComponent {
  private readonly tournaments = inject(TournamentsRepository);

  readonly ids = input.required<readonly string[]>();
  readonly idsChange = output<string[]>();

  protected readonly max = TOURNAMENT_IDS_MAX;
  protected readonly term = signal('');
  protected readonly pasted = signal('');
  protected readonly searching = signal(false);
  protected readonly error = signal('');
  protected readonly results = signal<TournamentRow[] | null>(null);
  /** id → nome dos já escolhidos (os que vieram gravados são buscados pelo id). */
  protected readonly names = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      const missing = this.ids().filter((id) => !(id in untracked(this.names)));
      if (missing.length > 0) void this.resolveNames(missing);
    });
  }

  protected full(): boolean {
    return this.ids().length >= TOURNAMENT_IDS_MAX;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected date(d: Date): string {
    return d.toLocaleDateString('pt-BR');
  }

  protected async search(): Promise<void> {
    this.searching.set(true);
    this.error.set('');
    try {
      const page = await this.tournaments.listTournaments(this.term(), null);
      this.results.set(page.rows);
    } catch (error) {
      this.error.set(clubErrorMessage(error));
    } finally {
      this.searching.set(false);
    }
  }

  protected add(id: string, name: string): void {
    if (this.ids().includes(id) || this.full()) return;
    this.names.update((n) => ({ ...n, [id]: name }));
    this.idsChange.emit([...this.ids(), id]);
  }

  protected remove(id: string): void {
    this.idsChange.emit(this.ids().filter((i) => i !== id));
  }

  protected paste(): void {
    const next = [...new Set([...this.ids(), ...parseIds(this.pasted())])].slice(0, TOURNAMENT_IDS_MAX);
    this.pasted.set('');
    this.idsChange.emit(next);
  }

  private async resolveNames(ids: readonly string[]): Promise<void> {
    // Marca como "buscando" (o próprio id) para não pedir de novo a cada mudança.
    this.names.update((n) => ({ ...n, ...Object.fromEntries(ids.map((id) => [id, n[id] ?? id])) }));
    try {
      const rows = await this.tournaments.byIds(ids);
      const found = new Map(rows.map((r) => [r.id, r.name]));
      const resolved = ids.map((id) => [id, found.get(id) ?? `${id} (não encontrado)`]);
      this.names.update((n) => ({ ...n, ...Object.fromEntries(resolved) }));
    } catch {
      // Sem o nome, o chip mostra o id: dá para salvar do mesmo jeito.
    }
  }
}
