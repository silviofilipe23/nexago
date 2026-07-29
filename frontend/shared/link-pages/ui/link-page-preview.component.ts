import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  activePageLinks,
  linkPageInitials,
  type LinkPage,
  type PageLink,
} from '../link-page.model';
import { LinkIconComponent } from './link-icon.component';

/** Prévia fiel da página pública (390px de largura), usada nos dois painéis.
 *
 *  É a mesma composição que o site renderiza em `/a/{slug}` — mantida aqui para o gestor ver
 *  o resultado enquanto edita, sem precisar abrir a página. Puramente visual: não registra
 *  visita nem clique.
 *
 *  A aparência estática é idêntica à do site; ficam de fora só os enfeites em loop (faixas
 *  de luz do fundo, brilho varrendo os cartões, pulso do selo AO VIVO), que distrairiam
 *  quem está editando ao lado. O anel do avatar gira porque o gradiente é assimétrico —
 *  parado, ele parece um arco quebrado. */
@Component({
  selector: 'nx-link-page-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LinkIconComponent],
  template: `
    <div class="page">
      <div class="glow"></div>

      <div class="wrap">
        <header class="head">
          <div class="avatar-ring">
            <div class="avatar">
              @if (avatarUrl(); as avatar) {
                <img class="avatar-img" [src]="avatar" [alt]="page().title" />
              } @else {
                <span class="avatar-initials">{{ initials() }}</span>
              }
            </div>
          </div>

          <div class="name">{{ page().title || 'Sua página' }}</div>

          @if (handle()) {
            <div class="handle">
              <span class="dot"></span>
              <span>{{ handle() }}</span>
            </div>
          }

          @if (page().bio) {
            <p class="tagline">{{ page().bio }}</p>
          }

          @if (page().highlights.length) {
            <div class="stats">
              @for (h of page().highlights; track $index) {
                <div class="stat">
                  <div class="stat-value">{{ h.value }}</div>
                  <div class="stat-label">{{ h.label }}</div>
                </div>
              }
            </div>
          }
        </header>

        <div class="links">
          @for (link of visibleLinks(); track link.id) {
            <div class="link" [class.featured]="link.featured">
              <div class="ic">
                <nx-link-icon [name]="link.icon" [size]="22" />
              </div>
              <div class="tx">
                <div class="t">{{ link.title }}</div>
                @if (link.subtitle) {
                  <div class="s">{{ link.subtitle }}</div>
                }
              </div>
              @if (link.live) {
                <span class="badge">Live</span>
              } @else {
                <svg
                  class="arrow"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              }
            </div>
          } @empty {
            <p class="empty">Nenhum link ativo ainda — os que você ativar aparecem aqui.</p>
          }
        </div>

        <footer class="foot">Feito com <b>nexaGO</b></footer>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .page {
      position: relative;
      width: 390px;
      overflow: hidden;
      background: #050505;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }

    .glow {
      position: absolute;
      left: 50%;
      top: -340px;
      width: 720px;
      height: 720px;
      transform: translateX(-50%);
      pointer-events: none;
      background: radial-gradient(circle, rgba(255, 106, 26, 0.16), transparent 62%);
    }

    .wrap {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 52px 22px 44px;
    }

    /* O respiro até os links vive aqui, não no bloco de destaques: destaques são
       opcionais, e sem eles o cabeçalho colava no primeiro cartão. */
    .head {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 30px;
    }

    .avatar-ring {
      position: relative;
      width: 112px;
      height: 112px;
      border-radius: 50%;
      display: grid;
      place-items: center;
    }

    .avatar-ring::before {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg,
        var(--nx-orange-500),
        transparent 30%,
        transparent 55%,
        var(--nx-orange-400),
        transparent 85%,
        var(--nx-orange-500)
      );
      animation: spin 5s linear infinite;
    }

    .avatar-ring::after {
      content: '';
      position: absolute;
      inset: -1px;
      border-radius: 50%;
      background: #050505;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .avatar {
      position: relative;
      z-index: 1;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: linear-gradient(160deg, var(--nx-surface-2), var(--nx-surface-0));
      box-shadow: var(--nx-elev-2);
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-initials {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.02em;
      color: var(--nx-orange-500);
    }

    .name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-top: 20px;
    }

    .handle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex: none;
      background: var(--nx-win);
    }

    .tagline {
      font-size: 14.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      max-width: 300px;
      margin: 14px 0 0;
    }

    .stats {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin: 26px 0 0;
    }

    .stat {
      background: var(--nx-glass);
      border: 1px solid var(--nx-line);
      border-radius: 14px;
      padding: 10px 16px;
      text-align: center;
    }

    .stat-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      color: var(--nx-orange-400);
      font-variant-numeric: tabular-nums;
    }

    .stat-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .links {
      display: flex;
      flex-direction: column;
      gap: 14px;
      width: 100%;
    }

    .link {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 17px 18px;
      border-radius: 18px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }

    .link.featured {
      background: linear-gradient(
        130deg,
        var(--nx-orange-600),
        var(--nx-orange-500) 55%,
        var(--nx-orange-400)
      );
      border-color: transparent;
    }

    .ic {
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .link.featured .ic {
      background: rgba(10, 10, 10, 0.18);
      color: var(--nx-text-on-orange);
    }

    .tx {
      flex: 1;
      min-width: 0;
    }

    .t {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15.5px;
      letter-spacing: -0.01em;
      color: var(--nx-text);
    }

    .s {
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }

    .link.featured .t {
      color: var(--nx-text-on-orange);
    }

    .link.featured .s {
      color: rgba(10, 10, 10, 0.68);
    }

    .arrow {
      flex: none;
      color: var(--nx-text-dim);
    }

    .link.featured .arrow {
      color: rgba(10, 10, 10, 0.6);
    }

    .badge {
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 4px 8px;
      border-radius: var(--nx-r-pill, 999px);
      background: rgba(255, 59, 48, 0.16);
      color: var(--nx-live);
    }

    .empty {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      text-align: center;
      margin: 8px 0 0;
    }

    .foot {
      margin-top: 38px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .foot b {
      color: var(--nx-orange-500);
      font-weight: 500;
    }
  `,
})
export class LinkPagePreviewComponent {
  readonly page = input.required<LinkPage>();
  readonly links = input.required<readonly PageLink[]>();
  /** Avatar do dono, usado quando a página não tem um próprio — o site aplica a mesma
   *  regra em `/a/{slug}`, e sem isso a prévia mostraria iniciais onde o público vê o logo. */
  readonly fallbackAvatarUrl = input<string | null>(null);

  protected readonly avatarUrl = computed(() => this.page().avatarUrl || this.fallbackAvatarUrl());
  protected readonly visibleLinks = computed(() => activePageLinks(this.links()));
  protected readonly initials = computed(() => linkPageInitials(this.page().title));
  protected readonly handle = computed(() => {
    // Sem handle preenchido, o slug é a identidade pública da página.
    const raw = (this.page().handle || this.page().slug).trim();
    return raw ? (raw.startsWith('@') ? raw : `@${raw}`) : '';
  });
}
