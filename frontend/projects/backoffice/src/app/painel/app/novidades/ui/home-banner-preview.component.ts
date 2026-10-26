import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { destinationLabel, type HomeBanner } from '../data/home-banner';

/**
 * Prévia fiel ao app (`home_news_carousel.dart`): mesmas medidas, Sora em tudo (o app não tem
 * Inter) e o preto da Home. `carousel` = título da seção, contador, card com imagem 112×132 e os
 * pontos; `compact` = a linha única com o ícone laranja. Só visual: o botão não navega.
 */
@Component({
  selector: 'bo-home-banner-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @let b = banner();
    @if (b.format === 'compact') {
      <section class="compact" [attr.aria-label]="'Prévia compacta: ' + b.title">
        <span class="badge" aria-hidden="true"><bo-icon name="phone" [size]="20" [strokeWidth]="2" /></span>
        <span class="compact-copy">
          <span class="compact-title"><span class="new">Novo · </span>{{ b.title }}</span>
          <span class="compact-desc">{{ b.description }}</span>
        </span>
        @if (b.dismissible) {
          <span class="x" aria-hidden="true"></span>
        }
      </section>
    } @else {
      <section [attr.aria-label]="'Prévia do carrossel: ' + b.title">
        <div class="head">
          <span class="section-title">Novidades no app</span>
          @if (total() > 1) {
            <span class="counter">{{ position() }} de {{ total() }}</span>
          }
        </div>
        <div class="card">
          <div class="art" aria-hidden="true">
            @if (b.imageUrl; as img) {
              <img [src]="img" alt="" />
            } @else {
              <span>{{ artLabel() }}</span>
            }
          </div>
          <div class="copy">
            <div class="top">
              <span class="tag">NOVO</span>
              @if (b.dismissible) {
                <span class="x" aria-hidden="true"></span>
              }
            </div>
            <div class="title">{{ b.title }}</div>
            <div class="desc">{{ b.description }}</div>
            <span class="cta-wrap">
              <span class="cta">{{ b.ctaLabel }} <bo-icon name="chevron-right" [size]="14" [strokeWidth]="2.4" /></span>
            </span>
          </div>
        </div>
        @if (total() > 1) {
          <div class="dots" aria-hidden="true">
            @for (d of dots(); track $index) {
              <span [class.on]="d"></span>
            }
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; font-family: var(--nx-font-display); --fg: #f7f7f8; --dim: rgba(247, 247, 248, 0.52); --or: #ff6a1a; --surf: #111113; }
    .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
    .section-title { font-weight: 700; font-size: 18px; color: var(--fg); letter-spacing: -0.02em; }
    .counter { font-size: 13px; color: var(--dim); }
    .card { display: flex; gap: 16px; min-height: 164px; padding: 16px; border-radius: 24px; background: var(--surf); box-sizing: border-box; }
    .art { position: relative; flex: none; width: 112px; height: 132px; border-radius: 18px; overflow: hidden; display: grid; place-items: center; padding: 8px; box-sizing: border-box; text-align: center; background: repeating-linear-gradient(135deg, rgba(255, 106, 26, 0.1) 0 7px, rgba(255, 106, 26, 0.03) 7px 14px); border: 1px solid rgba(255, 106, 26, 0.18); font-family: var(--nx-font-mono); font-size: 8px; line-height: 1.5; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; }
    .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; min-height: 32px; }
    .tag { margin-top: 4px; padding: 4px 9px; border-radius: 99px; background: rgba(255, 106, 26, 0.14); font-weight: 700; font-size: 10.5px; color: var(--or); letter-spacing: 0.04em; }
    .x { position: relative; flex: none; width: 32px; height: 32px; border-radius: 99px; background: rgba(255, 255, 255, 0.06); }
    .x::before, .x::after { content: ''; position: absolute; left: 10px; right: 10px; top: 15px; height: 1.6px; background: var(--dim); transform: rotate(45deg); }
    .x::after { transform: rotate(-45deg); }
    .title { margin-top: 6px; font-weight: 800; font-size: 19px; line-height: 1.1; letter-spacing: -0.025em; color: var(--fg); overflow-wrap: anywhere; }
    .desc { margin-top: 5px; font-weight: 400; font-size: 12.5px; line-height: 1.4; color: var(--dim); overflow-wrap: anywhere; }
    .cta-wrap { margin-top: auto; padding-top: 10px; align-self: flex-start; }
    .cta { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 16px; border-radius: 14px; background: var(--or); color: #0a0a0a; font-weight: 700; font-size: 13.5px; }
    .dots { display: flex; justify-content: center; gap: 6px; margin-top: 14px; }
    .dots span { width: 6px; height: 6px; border-radius: 99px; background: rgba(255, 255, 255, 0.16); }
    .dots span.on { width: 18px; background: var(--or); }

    .compact { display: flex; align-items: center; gap: 13px; padding: 12px 10px 12px 12px; border-radius: 22px; background: var(--surf); border: 1px solid rgba(255, 106, 26, 0.22); }
    .badge { flex: none; width: 46px; height: 46px; border-radius: 15px; background: var(--or); display: grid; place-items: center; color: #0a0a0a; }
    .compact-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .compact-title { font-weight: 700; font-size: 14.5px; letter-spacing: -0.015em; color: var(--fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .new { color: var(--or); }
    .compact-desc { font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `,
})
export class HomeBannerPreviewComponent {
  readonly banner = input.required<HomeBanner>();
  /** Quantos cards o carrossel tem e qual deste (1-based): contador e pontos. */
  readonly total = input(1);
  readonly position = input(1);

  /** Sem imagem, o app mostra o ícone do destino; aqui, o nome dele. */
  protected readonly artLabel = computed(() => destinationLabel(this.banner().destination));
  protected readonly dots = computed(() => Array.from({ length: this.total() }, (_, i) => i === this.position() - 1));
}
