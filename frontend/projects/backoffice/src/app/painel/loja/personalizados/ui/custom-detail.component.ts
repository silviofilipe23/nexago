import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import type { PhotoSides } from '../../produtos/data/photo-sides';
import { FONT_LABELS, type CustomizationConfig, type FontId } from '../../produtos/personalizacao/data/customization';
import {
  PLACEMENT_SHORT,
  REASON_LABELS,
  STATUS_INFO,
  checklist,
  type CustomItem,
} from '../data/custom-item';

const COLOR_NAMES: Record<string, string> = { '#ffffff': 'branco', '#111111': 'preto', '#ff6a1a': 'laranja', '#e3b85c': 'dourado' };

/** Painel de detalhe da fila de arte. Só desenha e emite: quem chama o servidor é a tela. */
@Component({
  selector: 'bo-custom-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menuOpen.set(false)' },
  imports: [IconComponent, PillComponent],
  template: `
    @let it = item();
    <section class="panel" aria-labelledby="custom-detail-title">
      <header class="head">
        <div class="titles">
          <div class="kicker">{{ it.productName }} · {{ it.variantLabel }}</div>
          <h2 id="custom-detail-title">#{{ it.orderCode }} · {{ it.customerName }}</h2>
        </div>
        <bo-pill [tone]="info().tone">{{ info().label }}</bo-pill>
      </header>

      <div class="previews">
        <figure>
          <div class="mock" [class.has-photo]="sides().frente">
            @if (sides().frente; as url) { <img class="photo" [src]="url" [alt]="it.productName" /> }
            @if (it.image && frontArea()) {
              <span class="area" [class]="'area at-' + it.imageArea">
                @if (it.image.url) { <img [src]="it.image.url" alt="Imagem enviada" /> }
              </span>
            }
            @if (nameOn() === 'frente') { <span class="name" [class]="'name font-' + it.font" [style.color]="it.nameColor">{{ displayName() }}</span> }
            <span class="mock-label">{{ sides().frente ? 'Foto do produto' : 'Mockup' }} · Frente</span>
          </div>
          <figcaption>{{ frontCaption() }}</figcaption>
        </figure>
        <figure>
          <div class="mock" [class.has-photo]="sides().costas">
            @if (sides().costas; as url) { <img class="photo" [src]="url" [alt]="it.productName" /> }
            @if (nameOn() === 'costas') { <span class="name" [class]="'name font-' + it.font" [style.color]="it.nameColor">{{ displayName() }}</span> }
            <span class="mock-label">{{ sides().costas ? 'Foto do produto' : 'Mockup' }} · Costas</span>
          </div>
          <figcaption>{{ backCaption() }}</figcaption>
        </figure>
      </div>

      @if (it.units.length > 1) {
        <div class="units">
          <div class="label">{{ it.units.length }} unidades</div>
          <ol>
            @for (u of it.units; track $index) { <li>{{ u.toUpperCase() }}</li> }
          </ol>
        </div>
      }

      @if (checks().length > 0) {
        <ul class="checks">
          @for (c of checks(); track c.id) {
            <li>
              <span class="mark" [class]="'mark ' + c.level" aria-hidden="true">{{ c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕' }}</span>
              <div>
                <div class="check-label">{{ c.label }}<span class="sr-only"> — {{ levelText[c.level] }}</span></div>
                <div class="check-detail">{{ c.detail }}</div>
              </div>
            </li>
          }
        </ul>
      }

      @if (it.request && it.status === 'nova_imagem') {
        <div class="note">
          <bo-icon name="alert" [size]="14" />
          <span>Nova imagem pedida: {{ reasonLabel() }}{{ it.request.note ? ' — ' + it.request.note : '' }}</span>
        </div>
      }
      @if (it.refund) {
        <div class="note">
          <bo-icon name="cash" [size]="14" />
          <span>Reembolso {{ it.refund.scope === 'item' ? 'do item inteiro' : 'da personalização' }} · {{ it.refund.status }}</span>
        </div>
      }
      @if (it.status === 'producao') {
        <div class="note dim">
          <bo-icon name="clock" [size]="14" />
          <span>{{ it.batchId ? 'Já foi no lote para a estamparia.' : 'Entra no próximo lote para a estamparia.' }}</span>
        </div>
      }

      @if (it.finalFiles.length > 0) {
        <div class="files">
          <bo-icon name="download" [size]="13" />
          <span class="file-names">{{ fileNames() }}</span>
          <button type="button" class="link" [disabled]="!hasFileUrls()" [title]="hasFileUrls() ? '' : 'Arquivos ainda não gerados'" (click)="download.emit()">
            Baixar
          </button>
        </div>
      }

      @if (it.status === 'aprovar') {
        <footer class="actions">
          <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="requestImage.emit()">Pedir nova imagem</button>
          <div class="menu-wrap">
            <button type="button" class="bo-mini-btn more" aria-label="Mais ações" aria-haspopup="menu" [attr.aria-expanded]="menuOpen()" [disabled]="busy()" (click)="toggleMenu($event)">⋯</button>
            @if (menuOpen()) {
              <div class="menu" role="menu">
                <button type="button" role="menuitem" class="danger" (click)="menuOpen.set(false); reject.emit()">Reprovar e reembolsar</button>
              </div>
            }
          </div>
          <span class="spacer"></span>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="approve.emit()">
            <bo-icon name="check" [size]="13" /> Aprovar e produzir
          </button>
        </footer>
      } @else if (it.status === 'nova_imagem') {
        <footer class="actions">
          <span class="hint">Esperando o cliente reenviar a imagem.</span>
          <span class="spacer"></span>
          <button type="button" class="bo-ghost-btn danger" [disabled]="busy()" (click)="reject.emit()">Reprovar e reembolsar</button>
        </footer>
      } @else if (it.status === 'producao') {
        <footer class="actions">
          <span class="spacer"></span>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="ready.emit()">
            <bo-icon name="check" [size]="13" /> Marcar como pronto
          </button>
        </footer>
      }
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .panel { position: sticky; top: 20px; display: flex; flex-direction: column; gap: 16px; padding: 18px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    h2 { margin: 3px 0 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .previews { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    figure { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    figcaption { font-size: 11px; color: var(--nx-text-dim); }
    .mock { position: relative; aspect-ratio: 1; border-radius: var(--nx-r-2); overflow: hidden; background: repeating-linear-gradient(135deg, var(--nx-surface-1) 0 10px, var(--nx-surface-2) 10px 20px); }
    .mock-label { position: absolute; bottom: 8px; left: 0; right: 0; text-align: center; font-family: var(--nx-font-mono); font-size: 8.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    /* Foto inteira à vista (contain): a área marcada cai sobre a peça, sem corte. */
    .mock.has-photo { background: #0d0d0f; }
    .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    .mock.has-photo .mock-label { color: var(--nx-text-mute); text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8); }
    .area { position: absolute; border: 1px dashed var(--nx-orange-500); background: rgba(255, 106, 26, 0.18); overflow: hidden; }
    .area img { width: 100%; height: 100%; object-fit: contain; }
    .area.at-peito_esquerdo { top: 28%; right: 24%; width: 16%; height: 16%; }
    .area.at-centro_frente { top: 30%; left: 28%; width: 44%; height: 50%; }
    .area.at-manga { top: 30%; left: 6%; width: 12%; height: 12%; }
    .name { position: absolute; top: 22%; left: 50%; transform: translateX(-50%); padding: 3px 10px; border: 1px dashed rgba(244, 244, 245, 0.35); border-radius: 4px; font-size: 16px; white-space: nowrap; color: #fff; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); }
    .font-bloco { font-family: var(--nx-font-display); font-weight: 800; }
    .font-classica { font-family: Georgia, serif; font-style: italic; font-weight: 700; }
    .font-mono { font-family: var(--nx-font-mono); font-weight: 700; }
    .units .label { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); margin-bottom: 6px; }
    .units ol { margin: 0; padding-left: 20px; columns: 2; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .checks { list-style: none; margin: 0; padding: 14px 0 0; border-top: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 12px; }
    .checks li { display: flex; gap: 10px; }
    .mark { flex: none; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; }
    .mark.ok { background: rgba(43, 209, 126, 0.15); color: var(--nx-win); }
    .mark.warn { background: rgba(244, 197, 67, 0.15); color: var(--nx-pending); }
    .mark.erro { background: rgba(255, 59, 48, 0.15); color: var(--nx-live); }
    .check-label { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .check-detail { font-size: 11.5px; color: var(--nx-text-dim); }
    .note { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 12px; color: var(--nx-text-mute); }
    .note.dim { color: var(--nx-text-dim); }
    .files { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); color: var(--nx-text-dim); font-size: 12px; }
    .file-names { flex: 1; min-width: 0; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .link { border: none; background: transparent; color: var(--nx-orange-500); font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; cursor: pointer; }
    .link:disabled { color: var(--nx-text-dim); cursor: default; }
    .actions { display: flex; align-items: center; gap: 8px; }
    .spacer { flex: 1; }
    .hint { font-size: 12px; color: var(--nx-text-dim); }
    .menu-wrap { position: relative; }
    .more { padding: 0 10px; }
    .menu { position: absolute; left: 0; bottom: 38px; z-index: 5; min-width: 200px; padding: 4px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); }
    .menu button { width: 100%; text-align: left; padding: 8px 10px; border: none; border-radius: var(--nx-r-2); background: transparent; font-family: var(--nx-font-display); font-size: 12.5px; cursor: pointer; }
    .menu button.danger, .bo-ghost-btn.danger { color: var(--nx-live); }
    .menu button:hover { background: var(--nx-surface-2); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `,
})
export class CustomDetailComponent {
  readonly item = input.required<CustomItem>();
  readonly config = input.required<CustomizationConfig>();
  readonly blocklist = input.required<string[]>();
  /** Foto de cada lado do produto; lado sem foto mostra o mockup hachurado. */
  readonly sides = input<PhotoSides>({ frente: null, costas: null });
  readonly busy = input(false);

  readonly approve = output<void>();
  readonly requestImage = output<void>();
  readonly reject = output<void>();
  readonly ready = output<void>();
  readonly download = output<void>();

  protected readonly menuOpen = signal(false);
  protected readonly levelText = { ok: 'ok', warn: 'conferir', erro: 'erro' };

  protected readonly info = computed(() => STATUS_INFO[this.item().status]);
  protected readonly checks = computed(() => checklist(this.item(), this.config(), this.blocklist()));
  protected readonly reasonLabel = computed(() => {
    const r = this.item().request?.reason;
    return r ? REASON_LABELS[r] : '';
  });

  protected readonly area = computed(() => this.config().image.areas.find((a) => a.id === this.item().imageArea) ?? null);
  /** Manga entra na prévia da frente: é onde o mockup mostra o braço. */
  protected readonly frontArea = computed(() => this.item().image !== null);

  protected readonly nameOn = computed<'frente' | 'costas' | null>(() => {
    const it = this.item();
    if (!it.name && it.units.length === 0) {
      return null;
    }
    return it.namePlacement === 'frente' || it.namePlacement === 'manga' ? 'frente' : 'costas';
  });

  protected readonly displayName = computed(() => {
    const it = this.item();
    return (it.units[0] ?? it.name ?? '').toUpperCase();
  });

  protected readonly frontCaption = computed(() => {
    const a = this.area();
    if (this.item().image && a) {
      return `Frente · ${a.name.toLowerCase()} ${a.widthCm}×${a.heightCm} cm`;
    }
    return this.nameOn() === 'frente' ? `Frente · ${this.nameLine()}` : 'Frente · sem personalização';
  });

  protected readonly backCaption = computed(() =>
    this.nameOn() === 'costas' ? `${PLACEMENT_SHORT[this.item().namePlacement ?? ''] ?? 'Costas'} · ${this.nameLine()}` : 'Costas · sem personalização',
  );

  protected readonly fileNames = computed(() => this.item().finalFiles.map((f) => f.name).join(' · '));
  protected readonly hasFileUrls = computed(() => this.item().finalFiles.some((f) => f.url));

  private nameLine(): string {
    const it = this.item();
    const font = it.font && it.font in FONT_LABELS ? FONT_LABELS[it.font as FontId] : (it.font ?? '');
    const color = it.nameColor ? (COLOR_NAMES[it.nameColor] ?? it.nameColor) : '';
    const name = it.units.length > 1 ? `${it.units.length} nomes` : this.displayName();
    return [name, font, color].filter(Boolean).join(' · ');
  }

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }
}
