import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TournamentsRepository, type TournamentRow } from '../../../torneios/data/tournaments.repository';
import { IconComponent } from '../../../ui/icon.component';
import { productPriceLabel, tournamentMeta, type ArenaPick, type ShowcaseProduct } from '../data/blog-embeds';
import { BlogPostsRepository } from '../data/blog-posts.repository';

type Preview =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error' }
  | { state: 'tournament'; row: TournamentRow }
  | { state: 'product'; product: ShowcaseProduct }
  | { state: 'arena'; arena: ArenaPick };

const MISSING: Record<EmbedPreviewKind, string> = {
  tournament: 'Torneio não encontrado',
  product: 'Produto fora da vitrine',
  arena: 'Arena não encontrada',
};

export type EmbedPreviewKind = 'tournament' | 'product' | 'arena';

/**
 * Prévia compacta do bloco nexaGO no editor, lida do Firestore pelo id. O leitor (app e site) lê de
 * novo ao renderizar; aqui é só para quem escreve ver o que escolheu.
 */
@Component({
  selector: 'bo-blog-embed-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @let p = preview();
    <div class="card" [class.bad]="p.state === 'missing' || p.state === 'error'">
      @switch (p.state) {
        @case ('loading') {
          <span class="thumb skeleton"></span>
          <span class="text"><span class="name dim">Carregando…</span></span>
        }
        @case ('missing') {
          <span class="thumb icon"><bo-icon name="alert" [size]="18" /></span>
          <span class="text">
            <span class="name">{{ missingLabel() }}</span>
            <span class="meta">O save recusa o post assim: troque ou remova o bloco.</span>
          </span>
        }
        @case ('error') {
          <span class="thumb icon"><bo-icon name="alert" [size]="18" /></span>
          <span class="text">
            <span class="name">Não foi possível carregar</span>
            <span class="meta">Confira a conexão; o bloco continua no post.</span>
          </span>
        }
        @case ('tournament') {
          <span class="thumb icon"><bo-icon name="trophy" [size]="20" /></span>
          <span class="text">
            <span class="kicker">Torneio ou liga</span>
            <span class="name">{{ p.row.name }}</span>
            <span class="meta">{{ meta(p.row) }}</span>
          </span>
        }
        @case ('arena') {
          @if (p.arena.coverUrl; as src) {
            <img class="thumb" [src]="src" alt="" />
          } @else {
            <span class="thumb icon"><bo-icon name="arena" [size]="20" /></span>
          }
          <span class="text">
            <span class="kicker">Arena</span>
            <span class="name">{{ p.arena.name }}</span>
            <span class="meta">{{ p.arena.location }} · horários livres e reservar no app</span>
          </span>
        }
        @case ('product') {
          @if (p.product.coverUrl; as src) {
            <img class="thumb" [src]="src" alt="" />
          } @else {
            <span class="thumb icon"><bo-icon name="bag" [size]="20" /></span>
          }
          <span class="text">
            <span class="kicker">Produto da loja</span>
            <span class="name">{{ p.product.name }}</span>
            <span class="meta">{{ price(p.product) }} · preço e estoque ao vivo no post</span>
          </span>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .card { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: var(--nx-r-3); border: 1px solid rgba(255, 106, 26, 0.3); background: rgba(255, 106, 26, 0.05); }
    .card.bad { border-color: rgba(255, 59, 48, 0.35); background: rgba(255, 59, 48, 0.05); }
    .thumb { flex: none; width: 56px; height: 56px; border-radius: var(--nx-r-2); object-fit: cover; background: var(--nx-surface-2); }
    .thumb.icon { display: grid; place-items: center; color: var(--nx-orange-500); }
    .card.bad .thumb.icon { color: var(--nx-live); }
    .skeleton { opacity: 0.6; }
    .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-orange-500); }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name.dim { color: var(--nx-text-dim); font-weight: 500; }
    .meta { font-size: 12px; color: var(--nx-text-mute); }
  `,
})
export class BlogEmbedPreviewComponent {
  private readonly tournaments = inject(TournamentsRepository);
  private readonly posts = inject(BlogPostsRepository);

  readonly kind = input.required<EmbedPreviewKind>();
  readonly id = input.required<string>();

  protected readonly preview = signal<Preview>({ state: 'loading' });
  private readonly now = new Date();
  private seq = 0;

  protected readonly meta = (row: TournamentRow) => tournamentMeta(row, this.now);
  protected readonly price = productPriceLabel;

  constructor() {
    effect(() => {
      const kind = this.kind();
      const id = this.id();
      untracked(() => void this.load(kind, id));
    });
  }

  protected readonly missingLabel = computed(() => MISSING[this.kind()]);

  private async load(kind: EmbedPreviewKind, id: string): Promise<void> {
    const seq = ++this.seq;
    this.preview.set({ state: 'loading' });
    try {
      const next: Preview =
        kind === 'tournament'
          ? await this.tournaments.byIds([id]).then((rows) => (rows[0] ? { state: 'tournament', row: rows[0] } : { state: 'missing' }))
          : kind === 'arena'
            ? await this.posts.arena(id).then((arena) => (arena ? { state: 'arena', arena } : { state: 'missing' }))
            : await this.posts.showcaseProduct(id).then((product) => (product ? { state: 'product', product } : { state: 'missing' }));
      if (seq === this.seq) {
        this.preview.set(next);
      }
    } catch {
      if (seq === this.seq) {
        this.preview.set({ state: 'error' });
      }
    }
  }
}
