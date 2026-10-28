import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { tournamentShareLink, type TournamentShareBaseUrls } from '../data/tournament-share';
import type { OrganizerTournament } from '../data/tournament.model';
import { OgIconComponent } from '../ui/icon.component';
import {
  STORY_PER_PAGE,
  buildInscricoesStory,
  storyFileName,
  type InscricoesStory,
  type StoryTheme,
} from './inscricoes-story';
import { loadStoryAssets, renderStoryPng } from './inscricoes-story-card';
import type { InscricaoRow } from './inscricoes.model';

type Step = 'edit' | 'sent';

/** Por onde as artes saíram — muda o que a tela de confirmação manda fazer depois. */
type SentVia = 'instagram' | 'compartilhar' | 'download';

interface RenderedPage {
  url: string;
  file: File;
}

const THEMES: readonly { id: StoryTheme; label: string }[] = [
  { id: 'dark', label: 'Escuro' },
  { id: 'orange', label: 'Laranja' },
];

/** Compartilhar arquivo pela Web Share API: celular, Safari e Chrome/Edge no Windows. No Chrome
 *  de Mac/Linux não existe, e aí sobra o download. */
function supportsFileShare(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([new Blob()], 'story.png', { type: 'image/png' })] })
    );
  } catch {
    return false;
  }
}

function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/**
 * "Compartilhar no Stories" — artes 1080×1920 com as duplas inscritas de UMA categoria, para o
 * organizador postar no Instagram (protótipo 22d–22h).
 *
 * Do computador o Instagram não aceita story, então o envio depende de onde o painel está aberto:
 * - celular/tablet: folha nativa do sistema, onde o Instagram aparece como destino. Uma imagem por
 *   toque — o Stories recebe uma de cada vez, e cada envio precisa do próprio gesto do usuário;
 * - computador: baixar os PNGs (e, onde houver folha nativa — Safari, Windows —, "Compartilhar",
 *   que leva por AirDrop/Nearby até o celular).
 *
 * As artes são geradas assim que os ajustes mudam, não no clique: o Safari só abre a folha
 * nativa se o `navigator.share` sair no mesmo gesto, sem esperar o desenho.
 */
@Component({
  selector: 'og-compartilhar-stories-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: {
    '(click)': 'closed.emit()',
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <div
      class="og-story"
      role="dialog"
      aria-modal="true"
      aria-labelledby="og-story-title"
      (click)="$event.stopPropagation()"
    >
      <div class="og-story-preview">
        <div class="og-story-frame">
          @if (current(); as shown) {
            <img [src]="shown.url" [alt]="previewAlt()" />
          } @else {
            <div class="og-story-skeleton" aria-hidden="true"></div>
          }
        </div>
        @if (renders().length > 1) {
          <div class="og-story-thumbs">
            @for (thumb of renders(); track thumb.url; let i = $index) {
              <button
                type="button"
                class="og-story-thumb"
                [class.active]="i === pageIndex()"
                [attr.aria-pressed]="i === pageIndex()"
                [attr.aria-label]="'Ver story ' + (i + 1) + ' de ' + renders().length"
                (click)="page.set(i)"
              >
                <img [src]="thumb.url" alt="" />
                @if (sharedPages().has(i)) {
                  <span class="og-story-thumb-done" aria-hidden="true">
                    <og-icon name="check" [size]="10" [strokeWidth]="3" />
                  </span>
                }
              </button>
            }
            <span class="og-story-thumbs-note">
              {{ renders().length }} stories · {{ perPage }} {{ unitPlural() }} cada
            </span>
          </div>
        }
      </div>

      <div class="og-story-side">
        <div class="og-story-head">
          <div class="og-story-head-text">
            <div class="og-story-kicker">Divulgação · Instagram</div>
            <h2 class="og-story-title" id="og-story-title">
              Compartilhar {{ unitPlural() }} no Stories
            </h2>
            <div class="og-story-sub">{{ tournament().name }} · {{ countLabel() }}</div>
          </div>
          <button type="button" class="og-story-close" aria-label="Fechar" (click)="closed.emit()">
            <og-icon name="close" [size]="16" />
          </button>
        </div>

        <div class="og-story-body">
          @if (step() === 'edit') {
            <div class="og-story-field">
              <div class="og-story-label" id="og-story-cat">Categoria</div>
              <div class="og-story-seg" role="group" aria-labelledby="og-story-cat">
                @for (c of categoryOptions(); track c.id) {
                  <button
                    type="button"
                    [class.on]="c.id === categoryId()"
                    [attr.aria-pressed]="c.id === categoryId()"
                    (click)="selectCategory(c.id)"
                  >
                    {{ c.name }} · {{ c.count }}
                  </button>
                }
              </div>
            </div>

            <div class="og-story-field">
              <div class="og-story-label" id="og-story-theme">Visual</div>
              <div class="og-story-seg" role="group" aria-labelledby="og-story-theme">
                @for (t of themes; track t.id) {
                  <button
                    type="button"
                    [class.on]="t.id === theme()"
                    [attr.aria-pressed]="t.id === theme()"
                    (click)="selectTheme(t.id)"
                  >
                    {{ t.label }}
                  </button>
                }
              </div>
            </div>

            <div>
              <button
                type="button"
                role="switch"
                class="og-story-switch"
                aria-labelledby="og-story-paid"
                aria-describedby="og-story-paid-desc"
                [attr.aria-checked]="paidOnly()"
                (click)="togglePaidOnly()"
              >
                <span class="og-story-switch-text">
                  <span class="og-story-switch-title" id="og-story-paid">Só inscrições pagas</span>
                  <span class="og-story-switch-desc" id="og-story-paid-desc">
                    Oculta {{ unitPlural() }} com pagamento pendente
                  </span>
                </span>
                <span class="og-toggle" [class.on]="paidOnly()"></span>
              </button>
              <button
                type="button"
                role="switch"
                class="og-story-switch"
                aria-labelledby="og-story-spots"
                aria-describedby="og-story-spots-desc"
                [disabled]="story().spotsAvailable == null"
                [attr.aria-checked]="spotsOn()"
                (click)="toggleSpots()"
              >
                <span class="og-story-switch-text">
                  <span class="og-story-switch-title" id="og-story-spots">Mostrar vagas restantes</span>
                  <span class="og-story-switch-desc" id="og-story-spots-desc">{{ spotsHint() }}</span>
                </span>
                <span class="og-toggle" [class.on]="spotsOn()"></span>
              </button>
            </div>

            @if (story().count === 0) {
              <p class="og-story-note" role="status">{{ emptyMessage() }}</p>
            }
          } @else {
            <div class="og-story-check" aria-hidden="true">
              <og-icon name="check" [size]="20" [strokeWidth]="2.4" />
            </div>
            <div>
              <div class="og-story-sent-title" role="status">{{ sentTitle() }}</div>
              <p class="og-story-sent-text">{{ sentText() }}</p>
            </div>
            <ol class="og-story-steps">
              @for (s of steps(); track s; let i = $index) {
                <li><span class="n">0{{ i + 1 }}</span>{{ s }}</li>
              }
            </ol>
          }

          @if (story().cta) {
            <div class="og-story-field">
              <div class="og-story-label" id="og-story-link">Link de inscrição</div>
              <div class="og-story-link" aria-labelledby="og-story-link">
                <og-icon name="link" [size]="14" />
                <span class="og-story-link-url">{{ linkLabel() }}</span>
                <button
                  type="button"
                  class="og-story-copy"
                  [class.done]="copied()"
                  (click)="copyLink()"
                >
                  {{ copied() ? 'Copiado' : 'Copiar' }}
                </button>
              </div>
              <p class="og-story-hint">
                Cole na figurinha “Link” do Instagram, sobre o botão “Inscreva-se”.
              </p>
            </div>
          } @else if (step() === 'edit') {
            <p class="og-story-hint">
              {{ closedHint() }}
            </p>
          }
        </div>

        @if (error(); as msg) {
          <p class="og-story-error" role="alert">{{ msg }}</p>
        }

        <div class="og-story-foot">
          @if (step() === 'edit') {
            @if (instagramShare) {
              <button type="button" class="og-ghost-btn" [disabled]="locked()" (click)="download()">
                <og-icon name="download" [size]="13" />{{ downloadLabel() }}
              </button>
              <button
                type="button"
                class="og-mini-btn og-mini-btn-primary"
                [disabled]="locked()"
                (click)="shareToInstagram(0)"
              >
                <og-icon name="instagram" [size]="14" />Enviar para o Instagram
              </button>
            } @else {
              @if (canShareFiles) {
                <button
                  type="button"
                  class="og-ghost-btn"
                  [disabled]="locked()"
                  (click)="shareFiles()"
                >
                  <og-icon name="share" [size]="13" />Compartilhar
                </button>
              }
              <button
                type="button"
                class="og-mini-btn og-mini-btn-primary"
                [disabled]="locked()"
                (click)="download()"
              >
                <og-icon name="download" [size]="14" />{{ downloadLabel() }}
              </button>
            }
          } @else {
            <button type="button" class="og-ghost-btn" (click)="step.set('edit')">
              <og-icon name="edit" [size]="13" />Editar arte
            </button>
            @if (sentVia() === 'instagram' && nextToShare() !== null) {
              <button
                type="button"
                class="og-mini-btn og-mini-btn-primary"
                [disabled]="locked()"
                (click)="shareToInstagram(nextToShare()!)"
              >
                <og-icon name="instagram" [size]="14" />Enviar story {{ nextToShare()! + 1 }}/{{
                  renders().length
                }}
              </button>
            } @else {
              <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="closed.emit()">
                Concluir
              </button>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(7, 7, 8, 0.66);
      backdrop-filter: blur(4px);
    }
    /* Altura em \`dvh\`, não em %: a linha do grid do host é \`auto\`, então 100% não limitava
       nada — o diálogo crescia além da tela e, centralizado, saía cortado em cima. */
    .og-story {
      width: min(960px, 100%);
      height: min(780px, calc(100dvh - 40px));
      display: grid;
      grid-template-columns: 440px minmax(0, 1fr);
      overflow: hidden;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      box-shadow: 0 40px 100px rgba(0, 0, 0, 0.5);
    }

    /* ── Prévia ─────────────────────────────────────────── */
    .og-story-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 24px;
      min-height: 0;
      background: #0b0b0d;
      border-right: 1px solid var(--nx-line);
    }
    .og-story-frame {
      width: 335px;
      aspect-ratio: 9 / 16;
      flex: none;
      overflow: hidden;
      border-radius: 16px;
      background: #050505;
    }
    .og-story-frame img,
    .og-story-skeleton {
      display: block;
      width: 100%;
      height: 100%;
    }
    .og-story-skeleton {
      background: linear-gradient(180deg, var(--nx-surface-1), var(--nx-surface-0));
    }
    .og-story-thumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .og-story-thumb {
      position: relative;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 8px;
      background: none;
      overflow: hidden;
      cursor: pointer;
      line-height: 0;
    }
    .og-story-thumb.active {
      border-color: var(--nx-orange-500);
    }
    .og-story-thumb img {
      width: 43px;
      height: 77px;
    }
    .og-story-thumb-done {
      position: absolute;
      right: 3px;
      bottom: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--nx-win);
      color: #0a0a0a;
    }
    .og-story-thumbs-note {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-left: 4px;
    }

    /* ── Ajustes ────────────────────────────────────────── */
    .og-story-side {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .og-story-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 24px 28px 18px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-story-head-text {
      min-width: 0;
    }
    .og-story-kicker,
    .og-story-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-story-title {
      margin: 6px 0 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 20px;
      color: var(--nx-text);
    }
    .og-story-sub {
      margin-top: 4px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-story-close {
      flex: none;
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      border: 1px solid var(--nx-line);
      background: transparent;
      color: var(--nx-text-mute);
      cursor: pointer;
    }
    .og-story-close:hover {
      color: var(--nx-text);
    }
    .og-story-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 20px 28px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .og-story-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    /* Quebra em mais de uma linha quando o torneio tem muitas categorias. */
    .og-story-seg {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-story-seg button {
      flex: 1 1 auto;
      min-height: 34px;
      padding: 0 12px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
    }
    .og-story-seg button:hover {
      color: var(--nx-text);
    }
    .og-story-seg button.on {
      background: var(--nx-surface-2);
      color: var(--nx-text);
    }
    .og-story-switch {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      border: none;
      border-bottom: 1px solid var(--nx-line);
      background: none;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .og-story-switch:disabled {
      cursor: not-allowed;
    }
    .og-story-switch:disabled .og-toggle {
      opacity: 0.45;
    }
    .og-story-switch-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .og-story-switch-title {
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-story-switch-desc,
    .og-story-hint {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--nx-text-dim);
    }
    .og-story-hint {
      margin: 0;
    }
    .og-story-note {
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-story-link {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 40px;
      padding: 0 6px 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
    }
    .og-story-link-url {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text);
    }
    .og-story-copy {
      flex: none;
      height: 28px;
      padding: 0 12px;
      border-radius: 7px;
      border: 1px solid var(--nx-line);
      background: transparent;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 11.5px;
      cursor: pointer;
    }
    .og-story-copy.done {
      color: var(--nx-win);
    }

    /* ── Enviado ────────────────────────────────────────── */
    .og-story-check {
      width: 44px;
      height: 44px;
      flex: none;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(43, 209, 126, 0.14);
      color: var(--nx-win);
    }
    .og-story-sent-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 18px;
      color: var(--nx-text);
    }
    .og-story-sent-text {
      margin: 4px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .og-story-steps {
      list-style: none;
      margin: 0;
      padding: 4px 16px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
    }
    .og-story-steps li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.4;
      color: var(--nx-text);
    }
    .og-story-steps li:last-child {
      border-bottom: none;
    }
    .og-story-steps .n {
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-orange-500);
    }

    .og-story-error {
      margin: 0;
      padding: 0 28px 12px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
    }
    .og-story-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 28px;
      border-top: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
    }
    .og-story-foot .og-ghost-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    /* Tablet e celular: uma coluna só, a prévia em cima e o diálogo inteiro rolando — o
       rodapé com os botões fica preso embaixo. */
    @media (max-width: 860px) {
      /* Coluna flex, não grid: com a altura do diálogo fixa, a linha do grid encolhia abaixo
         da prévia (o \`min-height: 0\` dela) e o topo da arte saía cortado. */
      .og-story {
        height: auto;
        max-height: calc(100dvh - 40px);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
      }
      .og-story-preview,
      .og-story-side {
        flex: none;
      }
      .og-story-preview {
        border-right: none;
        border-bottom: 1px solid var(--nx-line);
        padding: 20px;
      }
      .og-story-frame {
        width: min(240px, 58vw);
      }
      .og-story-body {
        overflow: visible;
      }
      .og-story-foot {
        position: sticky;
        bottom: 0;
      }
    }
    @media (max-width: 560px) {
      :host {
        padding: 0;
      }
      .og-story {
        width: 100%;
        height: 100dvh;
        max-height: none;
        border: none;
        border-radius: 0;
      }
      /* Prévia menor no celular: arte e botão de envio na mesma tela, ajustes logo abaixo. */
      .og-story-frame {
        width: min(190px, 50vw);
      }
      .og-story-head,
      .og-story-body,
      .og-story-foot {
        padding-left: 16px;
        padding-right: 16px;
      }
      .og-story-error {
        padding: 0 16px 12px;
      }
    }
  `,
})
export class OgCompartilharStoriesDialogComponent implements OnDestroy {
  readonly tournament = input.required<OrganizerTournament>();
  /** As linhas da tela de Inscrições, ao vivo — a arte acompanha quem entra enquanto está aberta. */
  readonly rows = input.required<readonly InscricaoRow[]>();
  readonly bases = input.required<TournamentShareBaseUrls>();
  /** Categoria filtrada na tela, quando há — o diálogo abre nela. */
  readonly initialCategoryId = input<string | null>(null);

  readonly closed = output<void>();

  protected readonly themes = THEMES;
  protected readonly perPage = STORY_PER_PAGE;
  protected readonly canShareFiles = supportsFileShare();
  /** Só no aparelho com tela de toque o Instagram aparece na folha nativa. */
  protected readonly instagramShare = this.canShareFiles && isTouchDevice();

  /** Vagas ocupadas por categoria (sem a fila) — o número de cada botão de categoria. */
  private readonly countByCategory = computed(() => {
    const counts = new Map<string, number>();
    for (const r of this.rows()) {
      if (r.categoriaId == null || r.pay === 'espera') continue;
      counts.set(r.categoriaId, (counts.get(r.categoriaId) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly categoryOptions = computed(() =>
    this.tournament().categories.map((c) => ({
      id: c.id,
      name: c.name,
      count: this.countByCategory().get(c.id) ?? 0,
    })),
  );

  /** A filtrada na tela; sem filtro, a primeira categoria que tem alguém pra mostrar. */
  private readonly defaultCategoryId = computed(() => {
    const options = this.categoryOptions();
    const initial = this.initialCategoryId();
    if (initial && options.some((c) => c.id === initial)) return initial;
    return (options.find((c) => c.count > 0) ?? options[0])?.id ?? '';
  });

  /** Mantém a escolha do organizador enquanto as inscrições mudam ao vivo; só volta ao padrão
   *  se a categoria escolhida deixar de existir. */
  protected readonly categoryId = linkedSignal<string, string>({
    source: this.defaultCategoryId,
    computation: (fallback, previous) =>
      previous && this.tournament().categories.some((c) => c.id === previous.value)
        ? previous.value
        : fallback,
  });

  protected readonly theme = signal<StoryTheme>('dark');
  protected readonly paidOnly = signal(false);
  protected readonly showSpots = signal(true);
  protected readonly page = signal(0);

  /** Compara pelo conteúdo: a lista ao vivo emite a cada mudança em qualquer categoria (e a
   *  chegada dos contatos remonta as linhas), mas a arte só precisa redesenhar quando o que ELA
   *  mostra mudou. */
  protected readonly story = computed<InscricoesStory>(
    () =>
      buildInscricoesStory(this.rows(), this.tournament(), {
        categoryId: this.categoryId(),
        paidOnly: this.paidOnly(),
        showSpots: this.showSpots(),
      }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  protected readonly renders = signal<readonly RenderedPage[]>([]);
  protected readonly rendering = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly step = signal<Step>('edit');
  protected readonly sentVia = signal<SentVia>('download');
  /** Páginas já entregues ao Instagram — uma por toque. */
  protected readonly sharedPages = signal<ReadonlySet<number>>(new Set());
  /** O link foi copiado junto com o envio — dá pra colar direto na figurinha. */
  private readonly linkCopiedOnShare = signal(false);

  protected readonly pageIndex = computed(() =>
    Math.min(this.page(), Math.max(0, this.renders().length - 1)),
  );
  protected readonly current = computed(() => this.renders()[this.pageIndex()] ?? null);
  protected readonly locked = computed(
    () =>
      this.rendering() || this.busy() || this.story().count === 0 || this.renders().length === 0,
  );

  protected readonly unitPlural = computed(() => `${this.story().unit}s`);
  protected readonly countLabel = computed(() => {
    const n = this.story().count;
    return `${n} ${n === 1 ? this.story().unit : this.unitPlural()}`;
  });

  protected readonly spotsOn = computed(
    () => this.showSpots() && this.story().spotsAvailable != null,
  );
  protected readonly spotsHint = computed(() => {
    const story = this.story();
    if (story.spotsAvailable != null) return 'Gera urgência para quem ainda não se inscreveu';
    if (story.closedReason === 'encerradas') return 'Inscrições encerradas: sem vagas para mostrar';
    if (story.closedReason === 'lotada') return 'Categoria lotada: a arte mostra o total inscrito';
    return 'Categoria sem limite de vagas';
  });

  /** Por que a arte sai sem o "Inscreva-se" — aparece no lugar do link de inscrição. */
  protected readonly closedHint = computed(() =>
    this.story().closedReason === 'lotada'
      ? 'A categoria está lotada: a arte sai sem o botão “Inscreva-se” e diz “Categoria lotada”.'
      : 'As inscrições estão encerradas: a arte sai sem o botão “Inscreva-se”.',
  );

  protected readonly emptyMessage = computed(() =>
    this.paidOnly()
      ? `Nenhuma ${this.story().unit} com pagamento confirmado nesta categoria ainda.`
      : `Nenhuma ${this.story().unit} inscrita nesta categoria ainda.`,
  );

  protected readonly downloadLabel = computed(() => {
    const n = this.renders().length;
    return n > 1 ? `Baixar ${n} PNGs` : 'Baixar PNG';
  });

  protected readonly link = computed(
    () => tournamentShareLink(this.tournament(), this.bases()).url,
  );
  protected readonly linkLabel = computed(() => this.link().replace(/^https?:\/\//, ''));

  protected readonly previewAlt = computed(() => {
    const s = this.story();
    const n = this.renders().length;
    const which = n > 1 ? ` (${this.pageIndex() + 1} de ${n})` : '';
    return `Prévia do story${which}: ${s.unitTitle.toLowerCase()} ${s.unitVerb.toLowerCase()} em ${s.categoryName}`;
  });

  protected readonly nextToShare = computed<number | null>(() => {
    const shared = this.sharedPages();
    const index = this.renders().findIndex((_, i) => !shared.has(i));
    return index < 0 ? null : index;
  });

  protected readonly sentTitle = computed(() => {
    const n = this.renders().length;
    switch (this.sentVia()) {
      case 'download':
        return n > 1 ? `${n} imagens baixadas` : 'Imagem baixada';
      case 'compartilhar':
        return n > 1 ? `${n} imagens prontas` : 'Imagem pronta';
      case 'instagram': {
        const done = this.sharedPages().size;
        if (done < n) return `${done} de ${n} stories enviados`;
        return n > 1 ? `${n} stories enviados` : 'Story enviado';
      }
    }
  });

  protected readonly sentText = computed(() => {
    const cta = this.story().cta;
    if (this.sentVia() === 'download')
      return 'As artes (1080×1920) estão na sua pasta de downloads.';
    if (this.sentVia() === 'compartilhar')
      return 'As artes (1080×1920) foram para o destino que você escolheu.';
    const copied = this.linkCopiedOnShare() && cta ? ' O link de inscrição já está copiado.' : '';
    if (this.nextToShare() !== null) {
      return `Poste no Instagram e volte aqui para enviar o próximo — um story por imagem, na ordem.${copied}`;
    }
    return cta
      ? `Falta só a figurinha com o link de inscrição.${copied}`
      : 'Pronto: a lista já está no seu Stories.';
  });

  protected readonly steps = computed(() => {
    const cta = this.story().cta;
    const many = this.renders().length > 1;
    if (this.sentVia() === 'instagram') {
      return [
        'Escolha “Story” no Instagram',
        ...(cta
          ? [
              'Toque em figurinhas e escolha “Link”',
              'Cole o link e posicione a figurinha sobre o “Inscreva-se”',
            ]
          : many
            ? ['Repita com cada imagem, na ordem']
            : []),
      ];
    }
    return [
      'Passe as imagens para o celular (WhatsApp, AirDrop ou e-mail)',
      many
        ? 'No Instagram, publique cada uma como story, na ordem'
        : 'No Instagram, publique como story',
      ...(cta ? ['Adicione a figurinha “Link” com o link de inscrição sobre o “Inscreva-se”'] : []),
    ];
  });

  /** Cada geração ganha um número: desenho que termina depois de outra troca de ajuste é descartado. */
  private generation = 0;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const story = this.story();
      const theme = this.theme();
      void this.render(story, theme, ++this.generation);
    });
  }

  ngOnDestroy(): void {
    this.generation++;
    for (const r of this.renders()) URL.revokeObjectURL(r.url);
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
  }

  private async render(
    story: InscricoesStory,
    theme: StoryTheme,
    generation: number,
  ): Promise<void> {
    this.rendering.set(true);
    const out: RenderedPage[] = [];
    try {
      const assets = await loadStoryAssets();
      for (const page of story.pages) {
        const blob = await renderStoryPng(story, page, theme, assets);
        if (!blob) throw new Error('canvas sem PNG');
        out.push({
          url: URL.createObjectURL(blob),
          file: new File([blob], storyFileName(story, page), { type: 'image/png' }),
        });
        if (generation !== this.generation) break;
      }
      if (generation !== this.generation) {
        for (const r of out) URL.revokeObjectURL(r.url);
        return;
      }
      const previous = this.renders();
      this.renders.set(out);
      for (const r of previous) URL.revokeObjectURL(r.url);
      this.error.set(null);
    } catch {
      for (const r of out) URL.revokeObjectURL(r.url);
      if (generation === this.generation)
        this.error.set('Não foi possível gerar a arte. Feche e abra de novo.');
    } finally {
      if (generation === this.generation) this.rendering.set(false);
    }
  }

  /** Mudar o que a arte mostra começa o envio do zero: as imagens já postadas são de outra arte. */
  private resetSent(): void {
    this.sharedPages.set(new Set());
    this.linkCopiedOnShare.set(false);
    this.error.set(null);
  }

  protected selectCategory(id: string): void {
    this.categoryId.set(id);
    this.page.set(0);
    this.resetSent();
  }

  protected selectTheme(theme: StoryTheme): void {
    this.theme.set(theme);
    this.resetSent();
  }

  protected togglePaidOnly(): void {
    this.paidOnly.update((v) => !v);
    this.page.set(0);
    this.resetSent();
  }

  protected toggleSpots(): void {
    this.showSpots.update((v) => !v);
    this.resetSent();
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.copied.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.error.set('Não foi possível copiar automaticamente. Selecione o link e copie.');
    }
  }

  /** Uma página por toque. `navigator.share` sai ANTES de qualquer `await` — o Safari recusa a
   *  folha nativa fora do gesto. A cópia do link vai no mesmo tique, de carona: no Chrome entra,
   *  no Safari pode ser recusada (o gesto já foi gasto) e aí o botão "Copiar" resolve. */
  protected async shareToInstagram(index: number): Promise<void> {
    const page = this.renders()[index];
    if (!page || this.locked()) return;
    this.error.set(null);
    this.busy.set(true);
    try {
      const sharing = navigator.share({ files: [page.file] });
      if (this.story().cta) {
        navigator.clipboard?.writeText(this.link()).then(
          () => this.linkCopiedOnShare.set(true),
          () => undefined,
        );
      }
      await sharing;
      this.sharedPages.update((s) => new Set(s).add(index));
      this.sentVia.set('instagram');
      this.step.set('sent');
      const next = this.nextToShare();
      if (next !== null) this.page.set(next);
    } catch (error) {
      // Fechar a folha nativa sem escolher nada dispara AbortError — não é falha.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.error.set(
          'Não foi possível abrir o compartilhamento. Baixe os PNGs e poste pelo app de fotos.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** No computador com folha nativa (Safari, Windows), todas as imagens de uma vez — AirDrop e
   *  afins aceitam várias. */
  protected async shareFiles(): Promise<void> {
    if (this.locked()) return;
    const files = this.renders().map((r) => r.file);
    if (!navigator.canShare?.({ files })) {
      this.download();
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    try {
      await navigator.share({ files });
      this.sentVia.set('compartilhar');
      this.step.set('sent');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.error.set('Não foi possível compartilhar. Baixe os PNGs.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Um arquivo por página. Os downloads saem espaçados: disparados no mesmo tique, o navegador
   *  costuma ficar só com o último. A partir do segundo, o Chrome pede uma vez a permissão de
   *  "vários arquivos". As URLs seguem vivas — são as mesmas da prévia. */
  protected download(): void {
    if (this.locked()) return;
    this.renders().forEach((page, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = page.url;
        a.download = page.file.name;
        a.click();
      }, i * 300);
    });
    this.sentVia.set('download');
    this.step.set('sent');
  }
}
