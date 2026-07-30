import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { fetchArenaAthleteIdsOnce, resolveAthleteLabel } from '../bookings/bookings-repository';
import { arenaFirestore } from '../data/firestore';
import { filterAthleteCandidates, type AthleteCandidate } from './athlete-search-filter';

/** Campo de busca de atleta pra vincular um mensalista de horário fixo — pesquisa entre os
 *  atletas que já reservaram nesta arena (mesma base do Ranking de clientes), não uma busca
 *  global no app. Antes usava `arenas/{arenaId}/followers` (quem clicou "seguir" a arena),
 *  mas essa base fica vazia na prática — poucos atletas seguem a arena. */
@Component({
  selector: 'ar-athlete-search-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <div class="field-label">Buscar atleta</div>
    <input
      type="text"
      class="input-box"
      placeholder="Digite o nome do atleta…"
      [value]="queryText()"
      (focus)="onFocus()"
      (input)="onQueryInput($any($event.target).value)"
    />
    @if (open() && queryText().trim().length >= 2) {
      <div class="dropdown">
        @if (loading()) {
          <div class="empty">Carregando…</div>
        } @else if (loadError()) {
          <button type="button" class="empty retry" (click)="retryLoad()">Erro ao carregar atletas. Toque para tentar de novo.</button>
        } @else if (results().length === 0) {
          <div class="empty">Nenhum atleta encontrado.</div>
        } @else {
          @for (r of results(); track r.athleteId) {
            <button type="button" class="item" (click)="select(r)">{{ r.name }}</button>
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    .dropdown {
      position: absolute;
      z-index: 40;
      top: calc(100% - 12px);
      left: 0;
      right: 0;
      max-height: 220px;
      overflow: auto;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
    }

    .item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 10px 14px;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-size: 13px;
      cursor: pointer;
    }

    .item:last-child {
      border-bottom: none;
    }

    .item:hover {
      background: var(--nx-surface-2);
    }

    .empty {
      padding: 12px 14px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .retry {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      cursor: pointer;
      font-family: inherit;
    }

    /* .field-label/.input-box não são classes globais — cada componente
     * as redefine localmente (mesmo padrão em panel-recurring, panel-agenda,
     * panel-court-form etc., confirmado durante a Task 8/ar-date-range-picker,
     * que teve a mesma lacuna). View encapsulation do Angular não deixa o CSS
     * do modal pai (Task 11) alcançar o template deste componente filho. */
    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
  `,
})
export class AthleteSearchFieldComponent {
  readonly arenaId = input.required<string>();
  readonly selected = output<AthleteCandidate>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly db = arenaFirestore();
  private candidates: AthleteCandidate[] | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly queryText = signal('');
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly results = signal<AthleteCandidate[]>([]);
  protected readonly open = signal(false);

  protected onFocus(): void {
    this.open.set(true);
    void this.ensureCandidatesLoaded();
  }

  protected retryLoad(): void {
    void this.ensureCandidatesLoaded();
  }

  protected onQueryInput(value: string): void {
    this.queryText.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.runFilter(), 200);
  }

  protected select(candidate: AthleteCandidate): void {
    this.selected.emit(candidate);
    this.queryText.set(candidate.name);
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  private async ensureCandidatesLoaded(): Promise<void> {
    if (this.candidates) return;
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const athleteIds = await fetchArenaAthleteIdsOnce(this.db, this.arenaId());
      const withNames = await Promise.all(
        athleteIds.map(async (athleteId): Promise<AthleteCandidate> => ({
          athleteId,
          name: await resolveAthleteLabel(this.db, athleteId),
        })),
      );
      this.candidates = withNames.filter((c) => c.name && c.name !== '—');
    } catch {
      this.candidates = null;
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
      this.runFilter();
    }
  }

  private runFilter(): void {
    this.results.set(filterAthleteCandidates(this.candidates ?? [], this.queryText()));
  }
}
