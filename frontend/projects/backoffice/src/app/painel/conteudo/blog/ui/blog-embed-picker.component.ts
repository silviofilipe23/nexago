import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import { callableErrorMessage } from '../../../data/callable-error';
import { TournamentsRepository, type TournamentRow } from '../../../torneios/data/tournaments.repository';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { IconComponent, type PanelIconName } from '../../../ui/icon.component';
import {
  filterArenas,
  filterProducts,
  mergeTournamentResults,
  productPriceLabel,
  tournamentMeta,
  type ArenaPick,
  type ShowcaseProduct,
} from '../data/blog-embeds';
import { BlogPostsRepository } from '../data/blog-posts.repository';

export type EmbedPickKind = 'tournament' | 'product' | 'arena';

const COPY: Record<EmbedPickKind, { title: string; description: string; placeholder: string; searchLabel: string; listLabel: string; icon: PanelIconName }> = {
  tournament: {
    title: 'Escolher torneio ou liga',
    description: 'O post mostra o card com a inscrição ao vivo.',
    placeholder: 'Nome do torneio',
    searchLabel: 'Buscar torneio',
    listLabel: 'Torneios',
    icon: 'trophy',
  },
  product: {
    title: 'Escolher produto da loja',
    description: 'O post mostra preço e estoque atualizados.',
    placeholder: 'Nome do produto',
    searchLabel: 'Buscar produto',
    listLabel: 'Produtos',
    icon: 'bag',
  },
  arena: {
    title: 'Escolher arena',
    description: 'No app, o post mostra os horários livres e o botão reservar.',
    placeholder: 'Nome ou cidade da arena',
    searchLabel: 'Buscar arena',
    listLabel: 'Arenas',
    icon: 'arena',
  },
};

interface PickRow {
  id: string;
  name: string;
  meta: string;
  imageUrl: string | null;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Escolher o torneio (busca em `tournaments`) ou o produto (vitrine `storeShowcase`) de um bloco
 * nexaGO. Monta aberto; o pai desmonta ao escolher ou cancelar.
 */
@Component({
  selector: 'bo-blog-embed-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, IconComponent],
  template: `
    <bo-confirm-dialog
      [open]="true"
      size="md"
      [title]="copy().title"
      [description]="copy().description"
      [confirmLabel]="replacing() ? 'Trocar' : 'Inserir'"
      [confirmDisabled]="!selected()"
      [error]="error()"
      (confirmed)="confirm()"
      (dismissed)="dismissed.emit()"
    >
      <div class="search">
        <bo-icon name="search" [size]="15" />
        <input
          type="search"
          [placeholder]="copy().placeholder"
          [attr.aria-label]="copy().searchLabel"
          [value]="term()"
          (input)="onSearch($event)"
        />
      </div>
      <div class="rows" role="listbox" [attr.aria-label]="copy().listLabel">
        @if (loading()) {
          @for (slot of [0, 1, 2]; track slot) {
            <div class="skeleton"></div>
          }
        } @else {
          @for (row of rows(); track row.id) {
            <button
              type="button"
              role="option"
              class="row"
              [class.on]="selected() === row.id"
              [attr.aria-selected]="selected() === row.id"
              (click)="selected.set(row.id)"
              (dblclick)="selected.set(row.id); confirm()"
            >
              @if (row.imageUrl; as src) {
                <img class="thumb" [src]="src" alt="" loading="lazy" />
              } @else {
                <span class="thumb icon"><bo-icon [name]="copy().icon" [size]="16" /></span>
              }
              <span class="text">
                <span class="name">{{ row.name }}</span>
                <span class="meta">{{ row.meta }}</span>
              </span>
            </button>
          } @empty {
            <p class="none">{{ term().trim() ? 'Nada com esse nome.' : 'Nada para mostrar.' }}</p>
          }
        }
      </div>
    </bo-confirm-dialog>
  `,
  styles: `
    .search { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text-dim); }
    .search:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13.5px; }
    .rows { display: flex; flex-direction: column; gap: 4px; max-height: 340px; overflow-y: auto; }
    .row { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: var(--nx-r-2); border: 1px solid transparent; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .row:hover { background: var(--nx-surface-1); }
    .row.on { border-color: rgba(255, 106, 26, 0.55); background: rgba(255, 106, 26, 0.07); }
    .row:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 1px; }
    .thumb { flex: none; width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: var(--nx-surface-2); }
    .thumb.icon { display: grid; place-items: center; color: var(--nx-orange-500); }
    .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { font-size: 12px; color: var(--nx-text-dim); }
    .skeleton { height: 56px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); opacity: 0.6; }
    .none { margin: 0; padding: 16px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
  `,
})
export class BlogEmbedPickerComponent implements OnInit {
  private readonly tournaments = inject(TournamentsRepository);
  private readonly posts = inject(BlogPostsRepository);

  readonly kind = input.required<EmbedPickKind>();
  /** Id já escolhido no bloco (trocar): começa marcado. */
  readonly current = input<string | null>(null);

  readonly picked = output<string>();
  readonly dismissed = output<void>();

  protected readonly term = signal('');
  protected readonly selected = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly replacing = computed(() => this.current() !== null);

  protected readonly copy = computed(() => COPY[this.kind()]);
  private readonly products = signal<ShowcaseProduct[]>([]);
  private readonly arenas = signal<ArenaPick[]>([]);
  private readonly recentTournaments = signal<TournamentRow[]>([]);
  private readonly prefixTournaments = signal<TournamentRow[]>([]);
  private readonly now = new Date();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  protected readonly rows = computed<PickRow[]>(() => {
    if (this.kind() === 'arena') {
      return filterArenas(this.arenas(), this.term()).map((a) => ({ id: a.id, name: a.name, meta: a.location, imageUrl: a.coverUrl }));
    }
    if (this.kind() === 'product') {
      return filterProducts(this.products(), this.term()).map((p) => ({
        id: p.id,
        name: p.name,
        meta: productPriceLabel(p),
        imageUrl: p.coverUrl,
      }));
    }
    return mergeTournamentResults(this.prefixTournaments(), this.recentTournaments(), this.term()).map((t) => ({
      id: t.id,
      name: t.name,
      meta: tournamentMeta(t, this.now),
      imageUrl: null,
    }));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
    });
  }

  ngOnInit(): void {
    this.selected.set(this.current());
    void this.loadInitial();
  }

  private async loadInitial(): Promise<void> {
    try {
      if (this.kind() === 'arena') {
        this.arenas.set(await this.posts.listArenas());
      } else if (this.kind() === 'product') {
        this.products.set(await this.posts.listShowcase());
      } else {
        this.recentTournaments.set((await this.tournaments.listTournaments('', null)).rows);
      }
    } catch (error) {
      this.error.set(`Não foi possível carregar a lista. ${callableErrorMessage(error)}`);
    } finally {
      this.loading.set(false);
    }
  }

  protected onSearch(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
    if (this.kind() !== 'tournament') {
      return;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.searchTournaments(this.term()), SEARCH_DEBOUNCE_MS);
  }

  /** Prefixo do nome no Firestore (alcança torneio antigo ou sem data, fora dos recentes). */
  private async searchTournaments(term: string): Promise<void> {
    const seq = ++this.seq;
    if (!term.trim()) {
      this.prefixTournaments.set([]);
      return;
    }
    try {
      const page = await this.tournaments.listTournaments(term, null);
      if (seq === this.seq) {
        this.prefixTournaments.set(page.rows);
      }
    } catch {
      // Sem a busca no servidor, os recentes filtrados na tela continuam valendo.
    }
  }

  protected confirm(): void {
    const id = this.selected();
    if (id) {
      this.picked.emit(id);
    }
  }
}
