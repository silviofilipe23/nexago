import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { shortDate, type FeatureDraft, type ReleaseDraft } from '../data/app-news';

export type AppNewsPreviewMode = 'lista' | 'detalhe' | 'stories';

const MODES: ReadonlyArray<{ id: AppNewsPreviewMode; label: string }> = [
  { id: 'lista', label: 'Lista' },
  { id: 'detalhe', label: 'Detalhe' },
  { id: 'stories', label: 'Stories' },
];

/**
 * Prévia da versão no app: a tela de Novidades, o detalhe da funcionalidade aberta e o story
 * dela. Segue o que o app faz (`app_news_page.dart`, `app_news_detail_page.dart`,
 * `app_news_stories_page.dart`): a primeira funcionalidade é o destaque, passos vazios somem,
 * descrição vazia cai no resumo e os stories só levam as marcadas.
 */
@Component({
  selector: 'bo-app-news-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="wrap">
      <div class="head">
        <span>Prévia no app</span>
        <span class="head-title">{{ mode() === 'detalhe' && current() ? current()!.title : '' }}</span>
      </div>
      <div class="segmented" role="tablist" aria-label="Prévia">
        @for (m of modes; track m.id) {
          <button type="button" role="tab" [attr.aria-selected]="mode() === m.id" [class.on]="mode() === m.id" (click)="mode.set(m.id)">
            {{ m.label }}
          </button>
        }
      </div>

      <div class="phone">
        @switch (mode()) {
          @case ('lista') {
            <div class="screen">
              <div class="kick">Versão {{ release().version || '—' }} · {{ dateText() }}</div>
              <div class="h1">Novidades</div>
              @if (hero(); as h) {
                <div class="hero">
                  <div class="art hero-art">
                    @if (h.imageUrl) {
                      <img [src]="h.imageUrl" alt="" />
                    } @else {
                      <span>Imagem</span>
                    }
                  </div>
                  <div class="hero-body">
                    <span class="badge">NOVO</span>
                    <div class="hero-title">{{ h.title || 'Título' }}</div>
                    <div class="hero-sum">{{ h.summary || '' }}</div>
                    @if (h.destination !== null) {
                      <div class="cta-row"><span class="cta">{{ h.ctaLabel || 'Botão' }} <bo-icon name="chevron-right" [size]="13" [strokeWidth]="2.4" /></span></div>
                    }
                  </div>
                </div>
              } @else {
                <p class="empty">Sem funcionalidades</p>
              }
              @if (rest().length > 0) {
                <div class="kick sec">Também nesta versão</div>
                <div class="rows">
                  @for (f of rest(); track f.key) {
                    <div class="row">
                      <span class="ic"></span>
                      <span class="row-text">
                        <span class="row-title">{{ f.title || 'Sem título' }}</span>
                        @if (f.summary) {
                          <span class="row-sum">{{ f.summary }}</span>
                        }
                      </span>
                    </div>
                  }
                </div>
              }
              @if (improvements().length > 0) {
                <div class="kick sec">Melhorias</div>
                <div class="box">
                  @for (m of improvements(); track $index) {
                    <div class="imp">•&nbsp; {{ m }}</div>
                  }
                </div>
              }
            </div>
          }
          @case ('detalhe') {
            @if (current(); as f) {
              <div class="detail">
                <div class="art detail-art">
                  @if (f.imageUrl) {
                    <img [src]="f.imageUrl" alt="" />
                  } @else {
                    <span>Imagem</span>
                  }
                </div>
                <div class="detail-body">
                  <span class="badge">NOVO</span>
                  <div class="detail-title">{{ f.title || 'Título' }}</div>
                  <div class="detail-text">{{ f.description || f.summary || 'Descrição da funcionalidade.' }}</div>
                  @if (stepsOf(f).length > 0) {
                    <div class="kick sec">Como funciona</div>
                    <div class="steps">
                      @for (st of stepsOf(f); track $index; let i = $index) {
                        <div class="step"><span class="dot" [class.first]="i === 0">{{ i + 1 }}</span><span>{{ st }}</span></div>
                      }
                    </div>
                  }
                  @if (f.where) {
                    <div class="where"><span>Onde encontrar</span><strong>{{ f.where }}</strong></div>
                  }
                </div>
                <div class="detail-foot">
                  <span class="ghost">Voltar</span>
                  @if (f.destination !== null) {
                    <span class="cta">{{ f.ctaLabel || 'Botão' }} <bo-icon name="chevron-right" [size]="13" [strokeWidth]="2.4" /></span>
                  }
                </div>
              </div>
            } @else {
              <p class="empty pad">Adicione uma funcionalidade</p>
            }
          }
          @case ('stories') {
            @if (!release().stories) {
              <p class="empty pad">Stories desligado para esta versão.<br />O atleta vê só a tela de Novidades.</p>
            } @else if (story(); as s) {
              <div class="story">
                <div class="bars">
                  @for (x of storyItems(); track x.key; let k = $index) {
                    <span [class.on]="k <= s.index"></span>
                  }
                </div>
                <div class="kick">Novo na {{ release().version || '—' }} · {{ s.index + 1 }} de {{ storyItems().length }}</div>
                <div class="art story-art">
                  @if (s.feature.imageUrl) {
                    <img [src]="s.feature.imageUrl" alt="" />
                  } @else {
                    <span>Imagem</span>
                  }
                </div>
                <div class="story-title">{{ s.feature.title || 'Título' }}</div>
                <div class="story-sum">{{ s.feature.summary }}</div>
                <div class="story-foot">
                  @if (s.feature.destination !== null) {
                    <span class="cta grow">{{ s.feature.ctaLabel || 'Botão' }} <bo-icon name="chevron-right" [size]="13" [strokeWidth]="2.4" /></span>
                  }
                  <span class="ghost">{{ s.index === storyItems().length - 1 ? 'Fechar' : 'Próxima' }}</span>
                </div>
              </div>
            } @else {
              <p class="empty pad">Nenhuma funcionalidade marcada para os stories.</p>
            }
          }
        }
      </div>
      <p class="note">{{ note() }}</p>
    </div>
  `,
  styles: `
    :host { display: block; }
    .wrap { padding: 16px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 14px; }
    .head { display: flex; justify-content: space-between; gap: 10px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .head-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .segmented { display: grid; grid-template-columns: repeat(3, 1fr); padding: 3px; gap: 3px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .segmented button { height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .segmented button.on { background: var(--nx-surface-0); color: var(--nx-text); }

    /* Cores fixas do app (tema escuro), não do painel. */
    .phone { position: relative; height: 620px; border-radius: 30px; background: #050505; border: 6px solid #1a1a1c; overflow: hidden auto; scrollbar-width: none; color: #f7f7f8; font-family: Inter, var(--nx-font-ui); }
    .phone::-webkit-scrollbar { display: none; }
    .kick { font-family: var(--nx-font-mono); font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(247, 247, 248, 0.52); }
    .kick.sec { margin: 18px 0 8px; }
    .empty { margin: 0; padding: 40px 0; text-align: center; font-size: 11.5px; line-height: 1.5; color: rgba(247, 247, 248, 0.52); }
    .empty.pad { padding: 60px 24px; }
    .art { display: grid; place-items: center; overflow: hidden; background: repeating-linear-gradient(135deg, rgba(255, 106, 26, 0.1) 0 7px, rgba(255, 106, 26, 0.03) 7px 14px); border: 1px solid rgba(255, 106, 26, 0.18); font-family: var(--nx-font-mono); font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255, 255, 255, 0.4); }
    .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .badge { align-self: flex-start; padding: 4px 8px; border-radius: 99px; background: rgba(255, 106, 26, 0.14); color: #ff6a1a; font-weight: 700; font-size: 9.5px; letter-spacing: 0.04em; }
    .cta { height: 40px; padding: 0 16px; border-radius: 13px; background: #ff6a1a; color: #0a0a0a; font-family: Sora, var(--nx-font-display); font-weight: 700; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
    .cta.grow { flex: 1; }
    .ghost { height: 40px; padding: 0 14px; border-radius: 13px; border: 1px solid rgba(255, 255, 255, 0.14); font-family: Sora, var(--nx-font-display); font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; }

    .screen { padding: 18px 16px 24px; }
    .h1 { margin-top: 5px; font-family: Sora, var(--nx-font-display); font-weight: 800; font-size: 24px; letter-spacing: -0.03em; }
    .hero { margin-top: 14px; padding: 10px; border-radius: 20px; background: #111113; }
    .hero-art { height: 120px; border-radius: 16px; }
    .hero-body { padding: 12px 4px 2px; display: flex; flex-direction: column; gap: 6px; }
    .hero-title { font-family: Sora, var(--nx-font-display); font-weight: 800; font-size: 18px; letter-spacing: -0.025em; }
    .hero-sum { font-size: 11.5px; line-height: 1.4; color: rgba(247, 247, 248, 0.52); }
    .cta-row { display: flex; margin-top: 6px; }
    .cta-row .cta { flex: 1; }
    .rows { display: flex; flex-direction: column; gap: 7px; }
    .row { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 16px; background: #111113; }
    .ic { flex: none; width: 34px; height: 34px; border-radius: 11px; background: rgba(255, 106, 26, 0.14); }
    .row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .row-title { font-family: Sora, var(--nx-font-display); font-weight: 700; font-size: 12.5px; }
    .row-sum { font-size: 10.5px; color: rgba(247, 247, 248, 0.52); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .box { padding: 4px 12px; border-radius: 16px; background: #111113; }
    .imp { padding: 8px 0; font-size: 11.5px; line-height: 1.4; }
    .imp + .imp { border-top: 1px solid rgba(255, 255, 255, 0.06); }

    .detail { min-height: 100%; display: flex; flex-direction: column; }
    .detail-art { height: 230px; flex: none; border: none; border-bottom: 1px solid rgba(255, 106, 26, 0.18); }
    .detail-body { flex: 1; padding: 16px 16px 20px; display: flex; flex-direction: column; }
    .detail-title { margin-top: 10px; font-family: Sora, var(--nx-font-display); font-weight: 800; font-size: 22px; line-height: 1.05; letter-spacing: -0.03em; }
    .detail-text { margin-top: 8px; font-size: 12px; line-height: 1.5; color: rgba(247, 247, 248, 0.72); }
    .steps { display: flex; flex-direction: column; gap: 10px; font-size: 12px; }
    .step { display: flex; align-items: center; gap: 10px; }
    .dot { flex: none; width: 24px; height: 24px; border-radius: 99px; display: grid; place-items: center; background: #111113; font-family: Sora, var(--nx-font-display); font-weight: 800; font-size: 11px; }
    .dot.first { background: #ff6a1a; color: #0a0a0a; }
    .where { margin-top: 18px; padding: 10px 12px; border-radius: 13px; background: #111113; display: flex; flex-direction: column; gap: 2px; }
    .where span { font-size: 10px; color: rgba(247, 247, 248, 0.52); }
    .where strong { font-weight: 600; font-size: 12px; }
    .detail-foot { position: sticky; bottom: 0; display: flex; gap: 8px; padding: 12px 16px 16px; background: linear-gradient(to top, #050505 70%, transparent); }
    .detail-foot .cta { flex: 1; }

    .story { height: 100%; padding: 14px; box-sizing: border-box; display: flex; flex-direction: column; }
    .bars { display: flex; gap: 3px; margin-bottom: 10px; }
    .bars span { flex: 1; height: 3px; border-radius: 99px; background: rgba(255, 255, 255, 0.16); }
    .bars span.on { background: #ff6a1a; }
    .story-art { flex: 1; min-height: 200px; margin-top: 12px; border-radius: 22px; }
    .story-title { margin-top: 16px; font-family: Sora, var(--nx-font-display); font-weight: 800; font-size: 22px; letter-spacing: -0.03em; }
    .story-sum { margin-top: 6px; min-height: 17px; font-size: 12px; line-height: 1.45; color: rgba(247, 247, 248, 0.72); }
    .story-foot { margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end; }

    .note { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }
  `,
})
export class AppNewsPreviewComponent {
  readonly release = input.required<ReleaseDraft>();
  /** A funcionalidade aberta no editor; sem nenhuma, a primeira. */
  readonly featureKey = input<string | null>(null);
  readonly mode = model<AppNewsPreviewMode>('lista');

  protected readonly modes = MODES;

  protected readonly hero = computed(() => this.release().features[0] ?? null);
  protected readonly rest = computed(() => this.release().features.slice(1));
  protected readonly improvements = computed(() => this.release().improvements.filter((m) => m.trim().length > 0));
  protected readonly current = computed(() => {
    const list = this.release().features;
    return list.find((f) => f.key === this.featureKey()) ?? list[0] ?? null;
  });
  protected readonly dateText = computed(() => {
    const date = this.release().date;
    return date ? shortDate(date) : 'data ao publicar';
  });
  protected readonly storyItems = computed(() => this.release().features.filter((f) => f.stories));
  /** O story da funcionalidade aberta; se ela está fora dos stories, o primeiro. */
  protected readonly story = computed(() => {
    const items = this.storyItems();
    if (items.length === 0) {
      return null;
    }
    const index = Math.max(0, items.findIndex((f) => f.key === this.featureKey()));
    return { feature: items[index]!, index };
  });
  protected readonly note = computed(() => {
    switch (this.mode()) {
      case 'lista':
        return 'A tela de Novidades mostra a versão instalada em destaque e as anteriores embaixo.';
      case 'detalhe':
        return 'Abre ao tocar na funcionalidade. O botão leva ao destino e marca “Já usou” no aparelho.';
      default:
        return 'Uma vez por versão, na primeira abertura depois de atualizar, só para contas criadas antes da data — sem o que o atleta já usou.';
    }
  });

  protected stepsOf(f: FeatureDraft): string[] {
    return f.steps.map((s) => s.trim()).filter((s) => s.length > 0);
  }
}
