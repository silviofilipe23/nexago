import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, input, output, signal } from '@angular/core';
import { shareQrPngDataUrl, shareQrSvgDataUrl } from '../data/share-qr';
import {
  tournamentQrFileName,
  tournamentShareLink,
  tournamentShareMessage,
  whatsAppShareUrl,
  type TournamentShareBaseUrls,
} from '../data/tournament-share';
import type { OrganizerTournament } from '../data/tournament.model';
import { OgIconComponent } from '../ui/icon.component';

type CopyKind = 'link' | 'texto';

/** Modal "Compartilhar torneio" — o link de inscrição que o organizador manda pros atletas.
 *  O destino (site público x inscrição direta) sai de `tournamentShareLink`; aqui só entram a
 *  apresentação e as três formas de levar o link pra fora: copiar, WhatsApp e QR. */
@Component({
  selector: 'og-compartilhar-torneio-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: {
    '(click)': 'closed.emit()',
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <div class="og-dialog" role="dialog" aria-modal="true" aria-label="Compartilhar torneio" (click)="$event.stopPropagation()">
      <div class="og-dialog-title">Compartilhar torneio</div>
      <p class="og-dialog-text">{{ hint() }}</p>

      <div class="og-share-body">
        <div class="og-share-qr">
          @if (qrSvg(); as src) {
            <img [src]="src" [alt]="'QR code do link de inscrição de ' + tournament().name" />
          } @else {
            <div class="og-share-qr-empty" aria-hidden="true"></div>
          }
          <button type="button" class="og-ghost-btn og-share-qr-btn" [disabled]="downloading()" (click)="downloadQr()">
            <og-icon name="download" [size]="13" />
            {{ downloading() ? 'Gerando…' : 'Baixar QR' }}
          </button>
        </div>

        <div class="og-share-main">
          <label class="og-share-label" for="og-share-url">Link</label>
          <div class="og-share-url-row">
            <input id="og-share-url" class="og-share-url" type="text" readonly [value]="link().url" (focus)="selectAll($event)" />
            <button type="button" class="og-mini-btn" (click)="copy('link', link().url)">
              <og-icon [name]="copied() === 'link' ? 'check' : 'share'" [size]="13" />
              {{ copied() === 'link' ? 'Copiado' : 'Copiar' }}
            </button>
          </div>

          <div class="og-share-actions">
            <a class="og-mini-btn og-mini-btn-primary" [href]="whatsAppUrl()" target="_blank" rel="noopener">
              <og-icon name="share" [size]="13" />
              Enviar no WhatsApp
            </a>
            <button type="button" class="og-mini-btn" (click)="copy('texto', message())">
              <og-icon [name]="copied() === 'texto' ? 'check' : 'edit'" [size]="13" />
              {{ copied() === 'texto' ? 'Texto copiado' : 'Copiar texto do anúncio' }}
            </button>
          </div>

          <pre class="og-share-preview">{{ message() }}</pre>
        </div>
      </div>

      @if (error(); as msg) {
        <p class="og-dialog-error">{{ msg }}</p>
      }

      <div class="og-dialog-actions">
        <button type="button" class="og-mini-btn" (click)="closed.emit()">Fechar</button>
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
    .og-dialog {
      width: min(560px, 100%);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 22px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    .og-dialog-title {
      font-family: var(--nx-font-display);
      font-size: 17px;
      font-weight: 800;
      color: var(--nx-text);
    }
    .og-dialog-text {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 8px 0 0;
    }
    .og-dialog-error {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 12px 0 0;
    }
    .og-dialog-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 18px;
    }
    .og-share-body {
      display: flex;
      gap: 18px;
      margin-top: 18px;
    }
    /* Tile claro atrás do QR: o painel é dark e QR invertido não é lido pela câmera. */
    .og-share-qr {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .og-share-qr img,
    .og-share-qr-empty {
      width: 148px;
      height: 148px;
      border-radius: var(--nx-r-2);
      background: #fff;
      display: block;
    }
    .og-share-qr-empty {
      background: var(--nx-surface-2);
    }
    .og-share-qr-btn {
      height: 28px;
      padding: 0 8px;
      font-size: 11.5px;
    }
    .og-share-main {
      flex: 1;
      min-width: 0;
    }
    .og-share-label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-share-url-row {
      display: flex;
      gap: 8px;
      margin-top: 6px;
    }
    .og-share-url {
      flex: 1;
      min-width: 0;
      height: 32px;
      padding: 0 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      text-overflow: ellipsis;
    }
    .og-share-url:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
    .og-share-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .og-share-preview {
      margin: 14px 0 0;
      padding: 11px 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      white-space: pre-wrap;
      word-break: break-word;
    }
    @media (max-width: 560px) {
      .og-share-body {
        flex-direction: column;
        align-items: center;
      }
      .og-share-main {
        width: 100%;
      }
    }
  `,
})
export class OgCompartilharTorneioDialogComponent implements OnDestroy {
  readonly tournament = input.required<OrganizerTournament>();
  readonly bases = input.required<TournamentShareBaseUrls>();
  /** Local já resolvido pela tela (`location ?? city`). */
  readonly place = input<string | null>(null);
  /** Período já formatado pela tela (ex.: "12 – 14 set"). */
  readonly dateLabel = input<string | null>(null);

  readonly closed = output<void>();

  protected readonly link = computed(() => tournamentShareLink(this.tournament(), this.bases()));

  protected readonly message = computed(() =>
    tournamentShareMessage({
      name: this.tournament().name,
      place: this.place(),
      dateLabel: this.dateLabel(),
      url: this.link().url,
    }),
  );

  protected readonly whatsAppUrl = computed(() => whatsAppShareUrl(this.message()));

  /** Diz ao organizador POR QUE o link é aquele — sem isso, "somente link" vira mistério. */
  protected readonly hint = computed(() =>
    this.link().target === 'site'
      ? 'O link abre a página pública do torneio, com preview de imagem no WhatsApp e o botão de inscrição.'
      : 'Este torneio não aparece na listagem pública do site, então o link vai direto para a tela de inscrição. Quem ainda não tem conta cria na hora e volta para a inscrição.',
  );

  protected readonly qrSvg = signal<string | null>(null);
  protected readonly copied = signal<CopyKind | null>(null);
  protected readonly downloading = signal(false);
  protected readonly error = signal<string | null>(null);

  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const url = this.link().url;
      this.qrSvg.set(null);
      void shareQrSvgDataUrl(url).then((src) => this.qrSvg.set(src));
    });
  }

  ngOnDestroy(): void {
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
  }

  protected selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  protected async copy(kind: CopyKind, text: string): Promise<void> {
    this.error.set(null);
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(kind);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(null), 2000);
    } catch {
      // Sem permissão de área de transferência (http, Safari sem gesto): o campo de link fica
      // visível e selecionável, então o organizador ainda copia na mão.
      this.error.set('Não foi possível copiar automaticamente. Selecione o link e copie.');
    }
  }

  protected async downloadQr(): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.error.set(null);
    try {
      const t = this.tournament();
      const png = await shareQrPngDataUrl(this.link().url);
      if (!png) {
        this.error.set('Não foi possível gerar o QR code.');
        return;
      }
      const a = document.createElement('a');
      a.href = png;
      a.download = tournamentQrFileName(t.name, t.id);
      a.click();
    } finally {
      this.downloading.set(false);
    }
  }
}
