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
  imports: [OgCardComponent, OgAvatarComponent, NxSpinnerComponent],
  template: `
    <og-card>
      <div class="og-lv">
        <header class="og-lv-head">
          <h3>Liberar vaga</h3>
          <p>
            Só o atleta escolhido consegue se inscrever, mesmo com a categoria lotada. Ele
            paga normalmente pelo app, e a vaga é dele até a chave ser publicada.
          </p>
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
              </button>
            }
          </div>
        }

        <!-- A régua da decisão: liberar não é "mais uma inscrição", é criar a vaga seguinte.
             Com vaga sobrando ela mesma diz que o passe não é necessário — um aviso separado
             repetiria o que o número já conta. -->
        @if (occupancyLabel(); as occupancy) {
          <p class="og-lv-gauge" [class.free]="!isCategoryFull()">
            <strong>{{ occupancy }}</strong>
            <span class="og-lv-gauge-unit">{{ unitLabelPlural() }} inscritas</span>
            <span class="og-lv-gauge-next">{{ nextSpotLabel() }}</span>
          </p>
        } @else if (categoryId() !== '') {
          <p class="og-lv-note">
            Esta categoria não declara teto de vagas — não há lotação para liberar.
          </p>
        }

        <input
          type="search"
          class="og-lv-search"
          placeholder="Buscar atleta por nome ou apelido"
          aria-label="Buscar atleta para liberar a vaga"
          [value]="searchTerm()"
          (input)="onSearchInput($event)"
        />

        @if (termTooShort()) {
          <p class="og-lv-hint">Digite ao menos {{ minTerm }} letras.</p>
        } @else if (searching()) {
          <app-nx-spinner [size]="13" />
        } @else if (searched() && candidates().length === 0) {
          <p class="og-lv-hint">Nenhum atleta encontrado.</p>
        } @else if (candidates().length > 0) {
          <ul class="og-lv-results">
            @for (a of candidates(); track a.uid) {
              <li>
                <og-avatar
                  zoomable
                  [initials]="initialsOf(nameOf(a))"
                  [photoUrl]="a.photoUrl"
                  [personName]="nameOf(a)"
                  [size]="28"
                />
                <span class="og-lv-name">{{ nameOf(a) }}</span>
                <button
                  type="button"
                  class="og-mini-btn og-mini-btn-primary"
                  [disabled]="busy() || categoryId() === ''"
                  [attr.aria-label]="'Liberar vaga para ' + nameOf(a)"
                  (click)="grant(a)"
                >
                  Liberar
                </button>
              </li>
            }
          </ul>
        }

        <div class="og-lv-sec">
          <h4>Vagas liberadas</h4>
          @if (passesForCategory().length > 0) {
            <span class="og-lv-count">{{ passesForCategory().length }}</span>
          }
        </div>
        @if (passesForCategory().length === 0) {
          <p class="og-lv-empty">Nenhuma vaga liberada nesta categoria.</p>
        } @else {
          <ul class="og-lv-passes">
            @for (p of passesForCategory(); track p.id) {
              <li>
                <span class="og-lv-dot" [class]="statusTone(p)" aria-hidden="true"></span>
                <span class="og-lv-name">{{ p.athleteName }}</span>
                <span class="og-lv-state">{{ statusLabel(p) }}</span>
                @if (p.status === 'active') {
                  <button
                    type="button"
                    class="og-mini-btn"
                    [disabled]="busy()"
                    [attr.aria-label]="'Revogar a vaga de ' + p.athleteName"
                    (click)="revoked.emit(p.id)"
                  >
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
  styles: `
    .og-lv {
      display: grid;
      gap: 12px;
    }
    .og-lv-head h3 {
      margin: 0 0 3px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 15px;
      color: var(--nx-text);
    }
    .og-lv-head p {
      margin: 0;
      max-width: 58ch;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .og-lv-cats {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .og-lv-gauge {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px 10px;
      margin: 0;
      padding: 12px 14px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
    }
    .og-lv-gauge strong {
      font-family: var(--nx-font-mono);
      font-weight: 600;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    .og-lv-gauge-unit {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-lv-gauge-next {
      margin-left: auto;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--nx-orange-500);
    }
    .og-lv-gauge.free .og-lv-gauge-next {
      font-weight: 500;
      color: var(--nx-text-dim);
    }
    .og-lv-note,
    .og-lv-hint {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .og-lv-search {
      width: 100%;
      box-sizing: border-box;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .og-lv-search:focus {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 0;
    }
    .og-lv-results,
    .og-lv-passes {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* Quatro linhas INTEIRAS: a lista de busca não pode empurrar as vagas já liberadas para
       fora da tela, e meia linha cortada lê como defeito, não como "tem mais abaixo". */
    .og-lv-results {
      max-height: 202px;
      overflow: auto;
      overscroll-behavior: contain;
    }
    .og-lv-results li,
    .og-lv-passes li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 10px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
    }
    .og-lv-results li {
      background: var(--nx-surface-0);
    }
    .og-lv-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-lv-sec {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 2px;
    }
    .og-lv-sec h4 {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-lv-count {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .og-lv-dot {
      width: 7px;
      height: 7px;
      flex: none;
      border-radius: 50%;
      background: var(--nx-text-dim);
    }
    .og-lv-dot.waiting {
      background: var(--nx-pending);
    }
    .og-lv-dot.done {
      background: var(--nx-win);
    }
    .og-lv-state {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }
    .og-lv-empty {
      margin: 0;
      padding: 14px;
      border: 1px dashed var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      text-align: center;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class OgLiberarVagaComponent {
  readonly categorias = input.required<readonly OrganizerTournamentCategory[]>();
  readonly occupancyByCategory = input<Record<string, number>>({});
  readonly categoriaInicial = input<string | null>(null);
  readonly passes = input<readonly TournamentSpotPass[]>([]);
  readonly busy = input(false);

  readonly submitted = output<LiberarVagaSubmit>();
  readonly revoked = output<string>();

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

  /** `16/16`, ou `null` quando a categoria não declara teto — aí não há lotação a mostrar. */
  protected readonly occupancyLabel = computed(() => {
    const max = this.capacity();
    if (max == null || max <= 0) return null;
    return `${this.occupancy()}/${max}`;
  });

  /** "duplas" / "equipes": o teto conta EQUIPES, e chamar trio de dupla mente na tela. */
  protected readonly unitLabelPlural = computed(() => {
    const size = this.categorias().find((c) => c.id === this.categoryId())?.teamSize ?? 2;
    return size >= 3 ? 'equipes' : 'duplas';
  });

  /**
   * A consequência do clique, em uma frase.
   *
   * Lotada, diz qual vaga nasce — liberar não é "mais uma inscrição", é criar a próxima vaga.
   * Com folga, diz que o passe não é necessário, no lugar de um aviso separado repetindo o
   * número que está logo ao lado.
   */
  protected readonly nextSpotLabel = computed(() => {
    const max = this.capacity();
    if (max == null || max <= 0) return '';
    if (this.isCategoryFull()) {
      return `Liberar cria a ${Math.max(max, this.occupancy()) + 1}ª vaga`;
    }
    const left = max - this.occupancy();
    return `${left} ${left === 1 ? 'vaga livre' : 'vagas livres'} — ninguém precisa de passe`;
  });

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

  protected statusLabel(pass: TournamentSpotPass): string {
    return STATUS_LABEL[pass.status];
  }

  /** Estado do passe vira cor: esperando (âmbar), usado (verde), morto (apagado). */
  protected statusTone(pass: TournamentSpotPass): string {
    if (pass.status === 'active') return 'waiting';
    return pass.status === 'used' ? 'done' : '';
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
