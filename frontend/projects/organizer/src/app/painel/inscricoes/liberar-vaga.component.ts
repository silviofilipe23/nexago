import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import {
  ATHLETE_SEARCH_MIN_TERM,
  athleteDisplayName,
  searchAthletes,
  type AthleteSearchResult,
} from '../data/athlete-search-repository';
import { initialsOf } from '../data/mock-data';
import type { TournamentSpotPass } from '../data/spot-passes-repository';
import type { OrganizerTournamentCategory } from '../data/tournament.model';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';

const SEARCH_DEBOUNCE_MS = 350;

export interface LiberarVagaSubmit {
  categoryId: string;
  athleteUid: string;
  athleteName: string;
}

const STATUS_LABEL: Record<TournamentSpotPass['status'], string> = {
  active: 'Aguardando o atleta',
  used: 'Inscrição feita',
  revoked: 'Revogada',
  expired: 'Expirada (chave publicada)',
};

/** Liberar uma vaga NOMINAL numa categoria lotada.
 *
 *  A diferença para "Nova inscrição" é quem dirige: ali o organizador monta a inscrição inteira
 *  (e a LGPD nasce pendente, e o uniforme é ele quem preenche); aqui ele só abre a porta para
 *  uma pessoa, e quem convida o parceiro, aceita a LGPD, escolhe o uniforme e paga é o atleta.
 *
 *  Só o atleta é escolhido, não a dupla: o parceiro entra de carona pelo convite normal, na
 *  mesma vaga. E o teto da categoria só sobe quando o convidado se inscrever — enquanto o passe
 *  espera, a categoria continua lotada para todo mundo, então ninguém passa na frente dele. */
@Component({
  selector: 'og-liberar-vaga',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgCardComponent, OgIconComponent, OgAvatarComponent, NxSpinnerComponent],
  template: `
    <og-card>
      <div class="og-lv">
        <header class="og-lv-head">
          <div>
            <h3>Liberar vaga</h3>
            <p>
              O atleta escolhido consegue se inscrever nesta categoria mesmo lotada, e paga
              normalmente pelo app. A vaga é dele até a chave ser publicada.
            </p>
          </div>
          <button type="button" class="og-mini-btn" (click)="cancelled.emit()">Fechar</button>
        </header>

        @if (categorias().length > 1) {
          <div class="og-lv-cats" role="group" aria-label="Categoria">
            @for (c of categorias(); track c.id) {
              <button
                type="button"
                class="og-chip"
                [class.active]="categoryId() === c.id"
                [attr.aria-pressed]="categoryId() === c.id"
                (click)="categoryId.set(c.id)"
              >
                {{ c.name }}
                @if (occupancyLabel(c); as label) {
                  <span class="og-lv-occ">{{ label }}</span>
                }
              </button>
            }
          </div>
        }

        @if (!isCategoryFull() && categoryId() !== '') {
          <!-- Liberar vaga em categoria com lugar sobrando é inofensivo (o servidor ignora o
               passe enquanto couber alguém), mas quase sempre é engano de clique. -->
          <div class="og-banner" role="status">
            Esta categoria ainda tem vaga livre — qualquer atleta consegue se inscrever sem
            passe.
          </div>
        }

        <label class="og-lv-field">
          <span>Atleta</span>
          <input
            type="search"
            class="og-lv-search"
            placeholder="Buscar por nome ou apelido"
            aria-label="Buscar atleta para liberar a vaga"
            [value]="searchTerm()"
            (input)="onSearchInput($event)"
          />
        </label>

        @if (termTooShort()) {
          <p class="og-lv-hint">Digite ao menos {{ minTerm }} letras.</p>
        } @else if (searching()) {
          <nx-spinner />
        } @else if (searched() && candidates().length === 0) {
          <p class="og-lv-hint">Nenhum atleta encontrado.</p>
        } @else {
          <ul class="og-lv-results">
            @for (a of candidates(); track a.uid) {
              <li>
                <og-avatar [initials]="initialsOf(nameOf(a))" [photoUrl]="a.photoUrl" [size]="30" />
                <span class="og-lv-name">{{ nameOf(a) }}</span>
                <button
                  type="button"
                  class="og-mini-btn og-mini-btn-primary"
                  [disabled]="busy() || categoryId() === ''"
                  (click)="grant(a)"
                >
                  Liberar
                </button>
              </li>
            }
          </ul>
        }

        @if (passesForCategory().length > 0) {
          <h4 class="og-lv-sub">Vagas liberadas nesta categoria</h4>
          <ul class="og-lv-passes">
            @for (p of passesForCategory(); track p.id) {
              <li>
                <span class="og-lv-name">{{ p.athleteName }}</span>
                <span class="og-lv-status" [class.win]="p.status === 'used'">{{ statusLabel(p) }}</span>
                @if (p.status === 'active') {
                  <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="revoked.emit(p.id)">
                    Revogar
                  </button>
                }
              </li>
            }
          </ul>
        }
      </div>
    </og-card>
  `,
  styles: [
    `
      .og-lv {
        display: grid;
        gap: 12px;
      }
      .og-lv-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .og-lv-head h3 {
        margin: 0 0 2px;
        font-size: 15px;
      }
      .og-lv-head p {
        margin: 0;
        max-width: 62ch;
        color: var(--og-text-dim);
        font-size: 12px;
        line-height: 1.45;
      }
      .og-lv-cats {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .og-lv-occ {
        margin-left: 6px;
        opacity: 0.7;
      }
      .og-lv-field {
        display: grid;
        gap: 4px;
        font-size: 12px;
      }
      .og-lv-search {
        width: min(340px, 100%);
        padding: 8px 10px;
        border: 1px solid var(--og-border);
        border-radius: 8px;
        background: var(--og-surface);
        color: inherit;
      }
      .og-lv-hint {
        margin: 0;
        color: var(--og-text-dim);
        font-size: 12px;
      }
      .og-lv-results,
      .og-lv-passes {
        display: grid;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .og-lv-results li,
      .og-lv-passes li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border: 1px solid var(--og-border);
        border-radius: 8px;
      }
      .og-lv-name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
      }
      .og-lv-status {
        color: var(--og-text-dim);
        font-size: 11px;
      }
      .og-lv-status.win {
        color: var(--og-success, #17a34a);
      }
      .og-lv-sub {
        margin: 6px 0 0;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--og-text-dim);
      }
    `,
  ],
})
export class OgLiberarVagaComponent {
  readonly categorias = input.required<readonly OrganizerTournamentCategory[]>();
  readonly occupancyByCategory = input<Record<string, number>>({});
  readonly categoriaInicial = input<string | null>(null);
  readonly passes = input<readonly TournamentSpotPass[]>([]);
  readonly busy = input(false);

  readonly submitted = output<LiberarVagaSubmit>();
  readonly revoked = output<string>();
  readonly cancelled = output<void>();

  protected readonly minTerm = ATHLETE_SEARCH_MIN_TERM;
  protected readonly nameOf = athleteDisplayName;
  protected readonly initialsOf = initialsOf;

  protected readonly categoryId = signal('');
  protected readonly searchTerm = signal('');
  protected readonly candidates = signal<AthleteSearchResult[]>([]);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly termTooShort = computed(() => {
    const term = this.searchTerm().trim();
    return term.length > 0 && term.length < ATHLETE_SEARCH_MIN_TERM;
  });

  protected readonly capacity = computed(
    () => this.categorias().find((c) => c.id === this.categoryId())?.maxTeams ?? null,
  );

  protected readonly occupancy = computed(() => this.occupancyByCategory()[this.categoryId()] ?? 0);

  protected readonly isCategoryFull = computed(() => {
    const max = this.capacity();
    return max != null && max > 0 && this.occupancy() >= max;
  });

  /** Passes da categoria em foco — a lista inteira do torneio confundiria mais do que ajuda. */
  protected readonly passesForCategory = computed(() =>
    this.passes().filter((p) => p.categoryId === this.categoryId()),
  );

  constructor() {
    // Categoria única ou já filtrada na tela: escolhe sozinho em vez de exigir um clique óbvio.
    effect(() => {
      const cats = this.categorias();
      const preferred = this.categoriaInicial();
      const current = this.categoryId();
      if (current && cats.some((c) => c.id === current)) return;
      if (preferred && cats.some((c) => c.id === preferred)) {
        this.categoryId.set(preferred);
        return;
      }
      this.categoryId.set(cats.length === 1 ? cats[0].id : '');
    });
  }

  protected occupancyLabel(category: OrganizerTournamentCategory): string | null {
    const max = category.maxTeams;
    if (max == null || max <= 0) return null;
    return `${this.occupancyByCategory()[category.id] ?? 0}/${max}`;
  }

  protected statusLabel(pass: TournamentSpotPass): string {
    return STATUS_LABEL[pass.status];
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const term = value.trim();
    if (term.length < ATHLETE_SEARCH_MIN_TERM) {
      this.candidates.set([]);
      this.searched.set(false);
      return;
    }
    this.searchTimer = setTimeout(() => void this.runSearch(term), SEARCH_DEBOUNCE_MS);
  }

  private async runSearch(term: string): Promise<void> {
    this.searching.set(true);
    try {
      this.candidates.set(await searchAthletes(term));
    } catch {
      // Busca é acessória: sem resultado a tela diz "nenhum atleta encontrado" em vez de quebrar.
      this.candidates.set([]);
    } finally {
      this.searching.set(false);
      this.searched.set(true);
    }
  }

  protected grant(athlete: AthleteSearchResult): void {
    const categoryId = this.categoryId();
    if (!categoryId) return;
    this.submitted.emit({
      categoryId,
      athleteUid: athlete.uid,
      athleteName: athleteDisplayName(athlete),
    });
  }
}
