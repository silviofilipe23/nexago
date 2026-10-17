import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CampaignBanner } from '../data/campaign';

/**
 * Prévia do banner como a vitrine desenha. `web` = o bloco de 2 colunas do portal
 * (`loja-banner.component` do atleta: texto à esquerda, foto à direita, 300px);
 * `app` = o card de 196px do carrossel (foto inteira, título em até 2 linhas, sem subtítulo
 * nem CTA secundário). Só visual: os botões não navegam.
 */
@Component({
  selector: 'bo-campaign-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (format() === 'web') {
      <section class="web" [attr.aria-label]="'Prévia web: ' + banner().title">
        <div class="copy">
          @if (banner().kicker) {
            <div class="kicker">{{ banner().kicker }}</div>
          }
          <h3 class="title">{{ banner().title }}</h3>
          @if (banner().subtitle) {
            <p class="subtitle">{{ banner().subtitle }}</p>
          }
          <div class="actions">
            <span class="btn primary">{{ banner().primary.label }}</span>
            @if (banner().secondary; as sec) {
              <span class="btn ghost">{{ sec.label }}</span>
            }
          </div>
        </div>
        <div class="media" aria-hidden="true">
          @if (banner().imageUrl; as img) {
            <img [src]="img" alt="" />
          }
        </div>
      </section>
    } @else {
      <section class="app" [attr.aria-label]="'Prévia app: ' + banner().title">
        @if (banner().imageUrl; as img) {
          <img [src]="img" alt="" />
        }
        <div class="shade"></div>
        <div class="app-copy">
          @if (banner().kicker) {
            <div class="app-kicker">{{ banner().kicker }}</div>
          }
          <div class="app-row">
            <div class="app-title">{{ banner().title }}</div>
            <span class="arrow" aria-hidden="true">→</span>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; container-type: inline-size; }

    .web {
      display: grid;
      grid-template-columns: 1.05fr 1fr;
      min-height: 300px;
      overflow: hidden;
      border: 1px solid var(--nx-line);
      border-radius: 20px;
      background-color: var(--nx-surface-0);
      background-image: radial-gradient(110% 120% at 0% 0%, rgba(255, 106, 26, 0.26), rgba(255, 106, 26, 0.04) 60%);
    }
    .copy { display: flex; flex-direction: column; justify-content: center; gap: 12px; padding: 32px; min-width: 0; }
    .kicker { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.16em; color: var(--nx-orange-500); overflow-wrap: anywhere; }
    .title { margin: 0; max-width: 14ch; font-family: var(--nx-font-display); font-size: 34px; font-weight: 800; line-height: 1.04; letter-spacing: -0.035em; color: var(--nx-text); text-wrap: balance; overflow-wrap: anywhere; }
    .subtitle { margin: 0; max-width: 420px; font-size: 14px; line-height: 1.5; color: var(--nx-text-mute); overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
    .btn { display: inline-flex; align-items: center; height: 44px; padding: 0 18px; border-radius: 12px; font-family: var(--nx-font-display); font-size: 13.5px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; }
    .btn.primary { background: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .btn.ghost { border: 1px solid var(--nx-line-strong); color: var(--nx-text); }
    /* Sem foto: o fundo listrado da marca, como na vitrine. */
    .media { position: relative; min-height: 300px; background-color: #16120f; background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 9px, transparent 9px 18px); border-left: 1px solid var(--nx-line); }
    .media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    /* Em tela estreita a vitrine esconde a foto e o texto ocupa tudo; a prévia faz igual. */
    @container (max-width: 560px) {
      .web { grid-template-columns: 1fr; min-height: 0; }
      .copy { padding: 22px 20px; }
      .title { font-size: 26px; }
      .media { display: none; }
    }

    .app {
      position: relative;
      width: 100%;
      max-width: 360px;
      height: 196px;
      overflow: hidden;
      border-radius: 20px;
      background-color: #16120f;
      background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 9px, transparent 9px 18px);
    }
    .app img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .shade { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(18, 14, 11, 0) 20%, rgba(18, 14, 11, 0.96)); }
    .app-copy { position: absolute; inset: auto 0 0 0; padding: 20px; display: flex; flex-direction: column; gap: 6px; }
    .app-kicker { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-orange-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .app-row { display: flex; align-items: flex-end; gap: 12px; }
    .app-title { flex: 1; min-width: 0; font-family: var(--nx-font-display); font-size: 22px; font-weight: 800; line-height: 1.08; letter-spacing: -0.03em; color: var(--nx-text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .arrow { flex: none; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: var(--nx-orange-500); color: var(--nx-text-on-orange); font-size: 18px; font-weight: 700; }
  `,
})
export class CampaignPreviewComponent {
  readonly banner = input.required<CampaignBanner>();
  readonly format = input<'web' | 'app'>('web');
}
