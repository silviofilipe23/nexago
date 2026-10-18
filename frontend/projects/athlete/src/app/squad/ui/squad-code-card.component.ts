import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { NxToastService } from '../../shared/feedback';
import { TIER_LABELS, followerOffer, shareLinks } from '../data/squad-model';
import { squadQrPngDataUrl, squadQrSvgDataUrl } from '../data/squad-qr';
import { drawSquadStoryCard, squadStoryFileName } from '../data/squad-story-card';
import type { AmbassadorView } from '../data/squad-view';
import { copyText, dataUrlToBlob, downloadBlob, shareLink, shareOrDownloadFile } from './squad-share';

/** "Seu código" do painel: QR, código e link com copiar, compartilhar e o card pro story. */
@Component({
  selector: 'app-squad-code-card',
  template: `
    <section class="sq-box sqc" aria-labelledby="sqc-title">
      <h2 class="sq-h" id="sqc-title">
        <span>Seu código</span>
        <button type="button" class="sq-h-action" (click)="downloadQr()" [disabled]="!qrSvg()">Baixar QR</button>
      </h2>
      <div class="sqc-main">
        <div class="sqc-qr">
          @if (qrSvg(); as src) {
            <img [src]="src" width="136" height="136" alt="QR code do seu link de embaixador" />
          }
        </div>
        <div class="sqc-fields">
          <div class="sq-copy">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.4" /></svg>
            <div class="sq-copy-text">
              <div class="sq-copy-k">Código</div>
              <div class="sq-copy-v sqc-code">{{ code() }}</div>
            </div>
            <button type="button" class="sq-copy-btn" (click)="copy(code(), 'Código copiado')" aria-label="Copiar código">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></svg>
              Copiar
            </button>
          </div>
          <div class="sq-copy">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>
            <div class="sq-copy-text">
              <div class="sq-copy-k">Link</div>
              <div class="sq-copy-v sqc-link">{{ links().label }}</div>
            </div>
            <button type="button" class="sq-copy-btn" (click)="copy(links().link, 'Link copiado')" aria-label="Copiar link">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></svg>
              Copiar
            </button>
          </div>
        </div>
      </div>
      <p class="sq-callout sqc-offer">
        @if (offer().discount; as discount) {
          <span>Quem usa o seu código ganha <b>{{ discount }}</b>. {{ offer().rest }}</span>
        } @else {
          <span>{{ offer().rest }}</span>
        }
      </p>
      <div class="sqc-actions">
        <button type="button" class="sq-btn sqc-share" (click)="share()" [disabled]="!live()">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12" /></svg>
          Compartilhar
        </button>
        <button type="button" class="sq-btn sq-btn--soft" (click)="story()" [disabled]="busy() || !live()">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11.5M7.5 11 12 15.5 16.5 11M5 20h14" /></svg>
          {{ busy() ? 'Gerando…' : 'Card pro story' }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .sqc-main {
      display: flex;
      gap: 18px;
      min-width: 0;
    }
    .sqc-qr {
      width: 136px;
      height: 136px;
      flex-shrink: 0;
      border-radius: 14px;
      background: #f4f4f5;
      overflow: hidden;
    }
    .sqc-qr img {
      display: block;
      width: 100%;
      height: 100%;
    }
    .sqc-fields {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
    }
    .sqc-offer {
      margin: 16px 0 0;
    }
    .sqc-actions {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }
    .sqc-share {
      flex: 1;
    }
    @media (max-width: 480px) {
      .sqc-main {
        flex-direction: column;
        align-items: center;
      }
      .sqc-fields {
        width: 100%;
      }
      .sqc-actions {
        flex-direction: column;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadCodeCardComponent {
  private readonly toast = inject(NxToastService);

  readonly view = input.required<AmbassadorView>();

  protected readonly code = computed(() => this.view().contract.code);
  protected readonly links = computed(() => shareLinks(this.code()));
  protected readonly offer = computed(() => followerOffer(this.view().contract));
  /** Código pausado ou encerrado não dá desconto: não faz sentido divulgar. */
  protected readonly live = computed(() => this.view().contract.status === 'active');
  protected readonly qrSvg = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const url = this.links().qr;
      void squadQrSvgDataUrl(url).then((src) => this.qrSvg.set(src));
    });
  }

  protected async copy(text: string, done: string): Promise<void> {
    if (await copyText(text)) this.toast.success(done);
    else this.toast.error('Não foi possível copiar agora.');
  }

  protected async share(): Promise<void> {
    const out = await shareLink({
      title: 'Meu código NexaGO',
      text: this.offer().discount
        ? `Use meu código ${this.code()} e ganhe ${this.offer().discount} no NexaGO.`
        : `Use meu código ${this.code()} na sua inscrição no NexaGO.`,
      url: this.links().link,
    });
    if (out === 'copied') this.toast.success('Link copiado', 'Cole onde quiser divulgar.');
    if (out === 'failed') this.toast.error('Não foi possível compartilhar agora.');
  }

  protected async downloadQr(): Promise<void> {
    const png = await squadQrPngDataUrl(this.links().qr);
    if (!png) {
      this.toast.error('Não foi possível gerar o QR.');
      return;
    }
    downloadBlob(await dataUrlToBlob(png), `nexago-squad-qr-${this.code().toLowerCase()}.png`);
  }

  protected async story(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const v = this.view();
      const canvas = document.createElement('canvas');
      await drawSquadStoryCard(canvas, {
        code: this.code(),
        offer: this.offer().discount ?? 'na sua inscrição no NexaGO',
        name: v.name,
        tierLabel: TIER_LABELS[v.contract.tier],
        qrPng: await squadQrPngDataUrl(this.links().qr, 1040),
        linkLabel: this.links().label,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        this.toast.error('Não foi possível gerar a imagem.');
        return;
      }
      const out = await shareOrDownloadFile(blob, squadStoryFileName(this.code()), 'Meu código NexaGO');
      if (out === 'downloaded') this.toast.success('Imagem baixada', 'Pronta para postar nos stories.');
    } catch {
      this.toast.error('Não foi possível gerar a imagem.');
    } finally {
      this.busy.set(false);
    }
  }
}
