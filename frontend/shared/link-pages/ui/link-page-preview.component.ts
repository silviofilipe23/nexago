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
 *  visita nem clique. */
@Component({
  selector: 'nx-link-page-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LinkIconComponent],
  template: `
    <div class="page">
      <div class="glow"></div>

      <header class="head">
        @if (page().avatarUrl; as avatar) {
          <img class="avatar" [src]="avatar" [alt]="page().title" />
        } @else {
          <div class="avatar avatar-fallback">{{ initials() }}</div>
        }
        <div class="name">{{ page().title || 'Sua página' }}</div>
        @if (handle()) {
          <div class="handle">
            <span class="dot"></span>
            <span>{{ handle() }}</span>
          </div>
        }
        @if (page().bio) {
          <p class="bio">{{ page().bio }}</p>
        }
        @if (page().highlights.length) {
          <div class="highlights">
            @for (h of page().highlights; track $index) {
              <div class="highlight">
                <div class="highlight-value">{{ h.value }}</div>
                <div class="highlight-label">{{ h.label }}</div>
              </div>
            }
          </div>
        }
      </header>

      <div class="links">
        @for (link of visibleLinks(); track link.id) {
          <div class="card" [class.featured]="link.featured">
            <div class="card-icon">
              <nx-link-icon [name]="link.icon" [size]="20" />
            </div>
            <div class="card-body">
              <div class="card-title">{{ link.title }}</div>
              @if (link.subtitle) {
                <div class="card-sub">{{ link.subtitle }}</div>
              }
            </div>
            @if (link.live) {
              <span class="live">LIVE</span>
            } @else {
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="arrow" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            }
          </div>
        } @empty {
          <p class="empty">Nenhum link ativo ainda — os que você ativar aparecem aqui.</p>
        }
      </div>

      <footer class="foot">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4 L5 20 M19 4 L19 20 M5 4 L19 20" stroke="currentColor" stroke-width="3.4" stroke-linecap="square" />
        </svg>
        <span>FEITO COM NEXAGO</span>
      </footer>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .page {
      width: 390px;
      background: #050505;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .glow {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(120% 40% at 50% -5%, rgba(255, 106, 26, 0.22) 0%, rgba(255, 106, 26, 0.05) 45%, transparent 70%);
    }

    .head {
      position: relative;
      padding: 44px 22px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .avatar {
      width: 88px;
      height: 88px;
      border-radius: 26px;
      object-fit: cover;
      box-shadow:
        0 0 0 3px #050505,
        0 0 0 5px rgba(255, 106, 26, 0.6),
        0 18px 40px rgba(0, 0, 0, 0.5);
    }

    .avatar-fallback {
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #f0a830 0%, #2260b8 100%);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      color: #fff;
    }

    .name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      letter-spacing: -0.02em;
      margin-top: 18px;
    }

    .handle {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 7px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 99px;
      background: var(--nx-win);
    }

    .bio {
      font-size: 14px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 12px 0 0;
      max-width: 300px;
    }

    .highlights {
      display: flex;
      gap: 8px;
      margin-top: 18px;
    }

    .highlight {
      padding: 10px 14px;
      border-radius: 13px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--nx-line);
      min-width: 78px;
    }

    .highlight-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-orange-500);
    }

    .highlight-label {
      font-family: var(--nx-font-mono);
      font-size: 7.5px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .links {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 0 20px 26px;
    }

    .card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 15px 16px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid var(--nx-line);
    }

    .card.featured {
      background: linear-gradient(135deg, #ff8a3d 0%, #ff6a1a 60%, #f05500 100%);
      border-color: rgba(255, 255, 255, 0.25);
      box-shadow: 0 12px 32px rgba(255, 106, 26, 0.28);
    }

    .card-icon {
      width: 42px;
      height: 42px;
      border-radius: 13px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .card.featured .card-icon {
      background: rgba(0, 0, 0, 0.18);
      color: #140a04;
    }

    .card-body {
      flex: 1;
      min-width: 0;
    }

    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }

    .card-sub {
      font-size: 12px;
      margin-top: 2px;
      color: var(--nx-text-dim);
    }

    .card.featured .card-title {
      color: #140a04;
    }

    .card.featured .card-sub {
      color: rgba(20, 10, 4, 0.7);
    }

    .arrow {
      color: rgba(244, 244, 245, 0.35);
      flex: none;
    }

    .card.featured .arrow {
      color: #140a04;
    }

    .live {
      padding: 4px 9px;
      border-radius: 7px;
      background: rgba(255, 59, 72, 0.14);
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.16em;
      color: var(--nx-live);
      flex: none;
    }

    .empty {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      text-align: center;
      margin: 8px 0 0;
    }

    .foot {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 4px 0 30px;
      color: var(--nx-orange-500);
    }

    .foot span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.2em;
      color: var(--nx-text-dim);
    }
  `,
})
export class LinkPagePreviewComponent {
  readonly page = input.required<LinkPage>();
  readonly links = input.required<readonly PageLink[]>();

  protected readonly visibleLinks = computed(() => activePageLinks(this.links()));
  protected readonly initials = computed(() => linkPageInitials(this.page().title));
  protected readonly handle = computed(() => {
    const raw = this.page().handle.trim();
    return raw ? `${raw.startsWith('@') ? raw : `@${raw}`} · NEXAGO` : 'NEXAGO';
  });
}
