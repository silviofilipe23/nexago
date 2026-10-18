import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { AmbassadorAvatarComponent } from '../../comissoes/ui/ambassador-avatar.component';
import { shareLinks } from '../data/profile';

/** Cabeçalho do perfil: quem é, código/link/QR para divulgar e o NexaGO Score (interno). */
@Component({
  selector: 'bo-profile-identity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AmbassadorAvatarComponent, IconComponent],
  template: `
    <div class="top">
      <span class="ring"><bo-ambassador-avatar [id]="uid()" [name]="name()" [size]="64" /></span>
      <div class="who">
        <strong>{{ name() }}</strong>
        @if (line()) {
          <span class="line">{{ line() }}</span>
        }
        @if (code()) {
          <div class="chips">
            <button type="button" class="chip" title="Copiar código" (click)="copied.emit(code())">
              {{ code() }} <bo-icon name="copy" [size]="12" />
            </button>
            <button type="button" class="chip" title="Copiar link de indicação" (click)="copied.emit(links().link)">
              {{ links().label }} <bo-icon name="copy" [size]="12" />
            </button>
            <button type="button" class="chip" [attr.aria-expanded]="qrOpen()" (click)="toggleQr()">
              QR · {{ code() }}
            </button>
          </div>
        }
      </div>
      <div class="score">
        <span class="k">NexaGO Score</span>
        <b [class.none]="score() === null" [attr.title]="score() === null ? 'Score diário ainda não calculado' : null">
          {{ score() ?? '—' }}
        </b>
        <span class="rank">{{ rankLabel() }}</span>
      </div>
    </div>
    @if (qrOpen()) {
      <div class="qr">
        @if (qrImage(); as q) {
          <img [src]="q.svg" width="148" height="148" [alt]="'QR do código ' + code()" />
          <div class="qr-text">
            <span>Aponta para <b>{{ links().label }}&amp;via=qr</b>. Quem escanear chega ao portal com a indicação guardada.</span>
            <a class="bo-mini-btn" [href]="q.png" [attr.download]="'qr-' + code().toLowerCase() + '.png'">
              <bo-icon name="download" [size]="14" /> Baixar PNG
            </a>
          </div>
        } @else if (qrFailed()) {
          <span class="qr-text">Não deu para gerar o QR agora.</span>
        } @else {
          <span class="qr-text">Gerando o QR…</span>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; padding: 20px 22px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .top { display: flex; align-items: center; gap: 16px; }
    .ring { padding: 2px; border-radius: 50%; border: 2px solid var(--nx-orange-500); display: inline-flex; }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .who strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 17px; }
    .line { font-size: 12.5px; color: var(--nx-text-dim); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px; border-radius: 7px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font-family: var(--nx-font-mono); font-size: 11px; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chip:hover { border-color: var(--nx-line-strong); }
    .chip bo-icon { color: var(--nx-text-dim); flex: none; }
    .score { flex: none; display: flex; flex-direction: column; align-items: flex-end; }
    .k { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .score b { font-family: var(--nx-font-display); font-weight: 800; font-size: 40px; letter-spacing: -0.04em; line-height: 1.1; color: var(--nx-orange-500); }
    .score b.none { color: var(--nx-text-dim); }
    .rank { font-size: 11.5px; color: var(--nx-text-dim); }
    .qr { display: flex; align-items: center; gap: 16px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--nx-line); }
    .qr img { border-radius: 10px; background: #fff; }
    .qr-text { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute); }
    .qr-text b { font-family: var(--nx-font-mono); font-weight: 500; color: var(--nx-text); word-break: break-all; }
    @media (max-width: 760px) {
      .top { flex-wrap: wrap; }
      .who { flex: 1 1 calc(100% - 96px); }
      .score { width: 100%; flex-direction: row; align-items: baseline; gap: 10px; padding-top: 12px; border-top: 1px solid var(--nx-line); }
      .score b { font-size: 30px; }
    }
  `,
})
export class ProfileIdentityComponent {
  readonly uid = input.required<string>();
  readonly name = input.required<string>();
  readonly line = input('');
  readonly code = input('');
  readonly score = input<number | null>(null);
  readonly rank = input<{ position: number; of: number } | null>(null);
  /** Texto copiado (código ou link): o pai copia e avisa. */
  readonly copied = output<string>();

  protected readonly links = computed(() => shareLinks(this.code()));
  protected readonly rankLabel = computed(() => {
    const r = this.rank();
    return r ? `${r.position}º de ${r.of}` : 'sem cálculo ainda';
  });
  protected readonly qrOpen = signal(false);
  private readonly qr = signal<{ code: string; svg: string; png: string } | null>(null);
  /** Só vale o QR do código atual (o componente é reaproveitado ao trocar de perfil). */
  protected readonly qrImage = computed(() => (this.qr()?.code === this.code() ? this.qr() : null));
  protected readonly qrFailed = signal(false);

  /**
   * SVG na tela (PNG reamostrado borra os módulos e a câmera não lê, como no QR do organizador) e
   * PNG grande no download, que vira cartaz. Escuro sobre claro, com a margem de 4 módulos da spec.
   */
  protected async toggleQr(): Promise<void> {
    this.qrOpen.update((v) => !v);
    if (!this.qrOpen() || this.qrImage()) return;
    this.qrFailed.set(false);
    const code = this.code();
    const target = this.links().qr;
    try {
      const QRCode = (await import('qrcode')).default;
      const colors = { dark: '#000000', light: '#ffffff' };
      const [svg, png] = await Promise.all([
        QRCode.toString(target, { type: 'svg', margin: 4, color: colors }),
        QRCode.toDataURL(target, { width: 1024, margin: 4, color: colors }),
      ]);
      this.qr.set({ code, svg: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, png });
    } catch {
      this.qrFailed.set(true);
    }
  }
}
