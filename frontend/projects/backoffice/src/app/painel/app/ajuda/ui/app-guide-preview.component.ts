import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { MAX_STEPS, type CategoryDraft, type TopicDraft } from '../data/app-guide';

export type AppGuidePreviewMode = 'central' | 'guia';

const MODES: ReadonlyArray<{ id: AppGuidePreviewMode; label: string }> = [
  { id: 'central', label: 'Central' },
  { id: 'guia', label: 'Guia' },
];

/**
 * Prévia no app: a Central de ajuda e o guia aberto. Segue o que o app faz (`app_guide_page.dart`,
 * `app_guide_topic_page.dart`): só os guias publicados entram na lista, categoria sem nenhum some,
 * o guia mostra a categoria como selo, passos vazios somem e explicação vazia cai no resumo.
 */
@Component({
  selector: 'bo-app-guide-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="wrap">
      <div class="head">
        <span>Prévia no app</span>
        <span class="head-title">{{ mode() === 'guia' && current() ? current()!.topic.title : '' }}</span>
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
          @case ('central') {
            <div class="screen">
              <span class="back"><bo-icon name="chevron-left" [size]="15" [strokeWidth]="2.4" /></span>
              <div class="kick top">Central de ajuda</div>
              <div class="h1">Como usar o NexaGO</div>
              <div class="sub">Guias rápidos de cada função do app.</div>
              @if (visible().length > 0) {
                <div class="search"><bo-icon name="search" [size]="14" />Buscar: reserva, Pix, dupla…</div>
                @for (c of visible(); track c.key) {
                  <div class="kick sec">{{ c.title }}</div>
                  <div class="rows">
                    @for (t of c.topics; track t.key) {
                      <div class="row" [class.on]="t.key === topicKey()">
                        <span class="ic"></span>
                        <span class="row-text">
                          <span class="row-title">{{ t.title }}</span>
                          @if (t.summary.trim()) {
                            <span class="row-sum">{{ t.summary }}</span>
                          }
                        </span>
                      </div>
                    }
                  </div>
                }
              } @else {
                <p class="empty">Os guias de cada função chegam em breve.</p>
              }
            </div>
          }
          @case ('guia') {
            @if (current(); as cur) {
              <div class="detail">
                <div class="art detail-art">
                  @if (cur.topic.imageUrl) {
                    <img [src]="cur.topic.imageUrl" alt="" />
                  } @else {
                    <span>Imagem</span>
                  }
                  <span class="glass"><bo-icon name="chevron-left" [size]="13" [strokeWidth]="2.4" />Voltar</span>
                </div>
                <div class="detail-body">
                  <span class="badge">{{ cur.category.toUpperCase() || 'CATEGORIA' }}</span>
                  <div class="detail-title">{{ cur.topic.title || 'Título' }}</div>
                  <div class="detail-text">{{ cur.topic.description || cur.topic.summary || 'Explicação do guia.' }}</div>
                  @if (stepsOf(cur.topic).length > 0) {
                    <div class="kick sec">Como funciona</div>
                    <div class="steps">
                      @for (st of stepsOf(cur.topic); track $index; let i = $index) {
                        <div class="step"><span class="dot" [class.first]="i === 0">{{ i + 1 }}</span><span>{{ st }}</span></div>
                      }
                    </div>
                  }
                  @if (cur.topic.where) {
                    <div class="where"><span>Onde encontrar</span><strong>{{ cur.topic.where }}</strong></div>
                  }
                </div>
                @if (cur.topic.destination !== null) {
                  <div class="detail-foot">
                    <span class="cta">{{ cur.topic.ctaLabel || 'Botão' }} <bo-icon name="chevron-right" [size]="13" [strokeWidth]="2.4" /></span>
                  </div>
                }
              </div>
            } @else {
              <p class="empty pad">Adicione um guia nesta categoria</p>
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
    .segmented { display: grid; grid-template-columns: repeat(2, 1fr); padding: 3px; gap: 3px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .segmented button { height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .segmented button.on { background: var(--nx-surface-0); color: var(--nx-text); }

    /* Cores fixas do app (tema escuro), não do painel. */
    .phone { position: relative; height: 620px; border-radius: 30px; background: #050505; border: 6px solid #1a1a1c; overflow: hidden auto; scrollbar-width: none; color: #f7f7f8; font-family: Inter, var(--nx-font-ui); }
    .phone::-webkit-scrollbar { display: none; }
    .kick { font-family: var(--nx-font-mono); font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(247, 247, 248, 0.52); }
    .kick.top { margin-top: 16px; }
    .kick.sec { margin: 20px 0 8px; }
    .empty { margin: 0; padding: 40px 0; text-align: center; font-size: 11.5px; line-height: 1.5; color: rgba(247, 247, 248, 0.52); }
    .empty.pad { padding: 60px 24px; }
    .art { position: relative; display: grid; place-items: center; overflow: hidden; background: repeating-linear-gradient(135deg, rgba(255, 106, 26, 0.1) 0 7px, rgba(255, 106, 26, 0.03) 7px 14px); border: 1px solid rgba(255, 106, 26, 0.18); font-family: var(--nx-font-mono); font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255, 255, 255, 0.4); }
    .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .badge { align-self: flex-start; padding: 4px 8px; border-radius: 99px; background: rgba(255, 106, 26, 0.14); color: #ff6a1a; font-weight: 700; font-size: 9.5px; letter-spacing: 0.04em; }
    .cta { height: 40px; padding: 0 16px; border-radius: 13px; background: #ff6a1a; color: #0a0a0a; font-family: Sora, var(--nx-font-display); font-weight: 700; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }

    .screen { padding: 14px 16px 24px; }
    .back { width: 32px; height: 32px; border-radius: 11px; background: #111113; display: grid; place-items: center; }
    .h1 { margin-top: 6px; font-family: Sora, var(--nx-font-display); font-weight: 800; font-size: 23px; line-height: 1.05; letter-spacing: -0.03em; }
    .sub { margin-top: 6px; font-size: 11px; color: rgba(247, 247, 248, 0.52); }
    .search { margin-top: 14px; height: 38px; padding: 0 12px; border-radius: 12px; background: #111113; display: flex; align-items: center; gap: 8px; font-size: 11px; color: rgba(247, 247, 248, 0.52); }
    .rows { display: flex; flex-direction: column; gap: 7px; }
    .row { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 16px; background: #111113; border: 1px solid transparent; }
    .row.on { border-color: rgba(255, 106, 26, 0.55); }
    .ic { flex: none; width: 34px; height: 34px; border-radius: 11px; background: rgba(255, 106, 26, 0.14); }
    .row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .row-title { font-family: Sora, var(--nx-font-display); font-weight: 700; font-size: 12.5px; }
    .row-sum { font-size: 10.5px; line-height: 1.35; color: rgba(247, 247, 248, 0.52); }

    .detail { min-height: 100%; display: flex; flex-direction: column; }
    .detail-art { height: 230px; flex: none; border: none; border-bottom: 1px solid rgba(255, 106, 26, 0.18); }
    .glass { position: absolute; top: 12px; left: 12px; height: 30px; padding: 0 10px 0 6px; border-radius: 99px; background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.14); display: inline-flex; align-items: center; gap: 4px; font-family: Sora, var(--nx-font-display); font-size: 11px; font-weight: 600; letter-spacing: 0; text-transform: none; color: #f7f7f8; }
    .detail-body { flex: 1; padding: 16px 16px 20px; display: flex; flex-direction: column; }
    .detail-title { margin-top: 10px; font-family: Sora, var(--nx-font-display); font-weight: 800; font-size: 22px; line-height: 1.05; letter-spacing: -0.03em; }
    .detail-text { margin-top: 8px; font-size: 12px; line-height: 1.5; color: rgba(247, 247, 248, 0.72); }
    .steps { display: flex; flex-direction: column; gap: 10px; font-size: 12px; line-height: 1.4; }
    .step { display: flex; align-items: flex-start; gap: 10px; }
    .dot { flex: none; width: 24px; height: 24px; border-radius: 99px; display: grid; place-items: center; background: #111113; font-family: Sora, var(--nx-font-display); font-weight: 800; font-size: 11px; }
    .dot.first { background: #ff6a1a; color: #0a0a0a; }
    .step span:last-child { padding-top: 4px; }
    .where { margin-top: 18px; padding: 10px 12px; border-radius: 13px; background: #111113; display: flex; flex-direction: column; gap: 2px; }
    .where span { font-size: 10px; color: rgba(247, 247, 248, 0.52); }
    .where strong { font-weight: 600; font-size: 12px; }
    .detail-foot { position: sticky; bottom: 0; display: flex; padding: 12px 16px 16px; background: linear-gradient(to top, #050505 70%, transparent); }
    .detail-foot .cta { flex: 1; }

    .note { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }
  `,
})
export class AppGuidePreviewComponent {
  readonly categories = input.required<CategoryDraft[]>();
  /** A categoria aberta na tela: o guia da prévia sai dela. */
  readonly categoryKey = input<string | null>(null);
  /** O guia aberto no editor; sem nenhum, o primeiro da categoria. */
  readonly topicKey = input<string | null>(null);
  readonly mode = model<AppGuidePreviewMode>('central');

  protected readonly modes = MODES;

  /** Como o app vai ler depois de salvar: só publicados com título, categoria só com algum. */
  protected readonly visible = computed(() =>
    this.categories()
      .map((c) => ({ ...c, topics: c.topics.filter((t) => t.published && t.title.trim()) }))
      .filter((c) => c.title.trim() && c.topics.length > 0),
  );
  private readonly drafts = computed(() => this.categories().reduce((n, c) => n + c.topics.filter((t) => !t.published).length, 0));
  protected readonly current = computed(() => {
    const category = this.categories().find((c) => c.key === this.categoryKey()) ?? this.categories()[0];
    if (!category) {
      return null;
    }
    const topic = category.topics.find((t) => t.key === this.topicKey()) ?? category.topics[0];
    return topic ? { topic, category: category.title.trim() } : null;
  });
  protected readonly note = computed(() => {
    if (this.mode() === 'guia') {
      const t = this.current()?.topic;
      const status = t && !t.published ? ' Este guia está em rascunho: o app ainda não mostra.' : '';
      return `Abre ao tocar no guia, na lista ou na busca. O botão leva à função; sem destino, o guia só explica.${status}`;
    }
    const n = this.drafts();
    const hidden = n === 0 ? '' : n === 1 ? ' 1 guia em rascunho fica de fora.' : ` ${n} guias em rascunho ficam de fora.`;
    return `Só os guias publicados aparecem, na ordem daqui; categoria sem guia publicado some.${hidden}`;
  });

  protected stepsOf(t: TopicDraft): string[] {
    return t.steps
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, MAX_STEPS);
  }
}
