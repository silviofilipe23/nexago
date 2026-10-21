import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { courtQrFileName, courtQrPngDataUrl, courtQrSvgDataUrl, fetchCourtCheckinQr } from './court-checkin-qr';

/** QR de check-in de uma quadra: o aluno da turma lê no app para marcar presença (alternativa à
 *  localização). Imprimir/baixar e trocar o código — o QR antigo para de valer na hora. */
@Component({
  selector: 'ar-court-checkin-qr-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, IconComponent],
  template: `
    <ar-modal (close)="close.emit()">
      <h2 class="modal-title">QR de check-in · {{ courtName() }}</h2>
      <p class="modal-subtitle">
        Deixe impresso na quadra ou na recepção. O aluno da turma lê no app (Treinos → Check-in) e a presença
        cai na chamada do professor.
      </p>

      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }
      @if (notice(); as n) {
        <div class="notice">{{ n }}</div>
      }

      <div class="qr-tile">
        @if (svgUrl(); as url) {
          <img [src]="url" [alt]="'QR de check-in da ' + courtName()" width="240" height="240" />
        } @else {
          <span class="state-text">{{ loading() ? 'Gerando QR…' : '' }}</span>
        }
      </div>

      @if (confirmRotate()) {
        <div class="confirm-box">
          O QR impresso hoje deixa de valer na hora. Use se ele vazou (foto num grupo, por exemplo) e imprima o novo.
          <div class="actions">
            <button type="button" class="ar-ghost-btn" [disabled]="loading()" (click)="confirmRotate.set(false)">
              Manter o atual
            </button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="loading()" (click)="rotate()">
              {{ loading() ? 'Trocando…' : 'Trocar código' }}
            </button>
          </div>
        </div>
      } @else {
        <div class="actions">
          <button type="button" class="ar-ghost-btn" [disabled]="loading() || !payload()" (click)="confirmRotate.set(true)">
            Trocar código
          </button>
          <button type="button" class="ar-ghost-btn" [disabled]="!payload()" (click)="print()">Imprimir</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!payload()" (click)="download()">
            <ar-icon name="download" [size]="13" />
            Baixar PNG
          </button>
        </div>
      }
    </ar-modal>
  `,
  styles: `
    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 6px;
    }

    .modal-subtitle {
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-dim);
      margin: 0 0 18px;
    }

    .error-banner,
    .notice {
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-bottom: 14px;
    }

    .error-banner {
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }

    .notice {
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
    }

    .qr-tile {
      display: grid;
      place-items: center;
      min-height: 264px;
      border-radius: var(--nx-r-3, 12px);
      background: #ffffff;
      margin-bottom: 18px;
    }

    .qr-tile img {
      display: block;
      width: 240px;
      height: 240px;
    }

    .state-text {
      font-size: 13px;
      color: #555;
    }

    .confirm-box {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-pending);
      background: var(--nx-surface-1);
      padding: 12px 14px;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
  `,
})
export class CourtCheckinQrModalComponent {
  readonly arenaId = input.required<string>();
  readonly courtId = input.required<string>();
  readonly courtName = input.required<string>();
  readonly close = output<void>();

  protected readonly payload = signal<string | null>(null);
  protected readonly svgUrl = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly confirmRotate = signal(false);

  constructor() {
    effect(() => {
      void this.load(false);
    });
  }

  protected async rotate(): Promise<void> {
    await this.load(true);
    this.confirmRotate.set(false);
  }

  private async load(rotate: boolean): Promise<void> {
    const arenaId = this.arenaId();
    const courtId = this.courtId();
    this.loading.set(true);
    this.error.set(null);
    try {
      const qr = await fetchCourtCheckinQr(arenaFunctions(), { arenaId, courtId, rotate });
      this.payload.set(qr.payload);
      this.svgUrl.set(await courtQrSvgDataUrl(qr.payload));
      this.notice.set(qr.rotated ? 'Código trocado. Imprima o QR novo — o anterior não vale mais.' : null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível carregar o QR da quadra.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async download(): Promise<void> {
    const payload = this.payload();
    if (!payload) return;
    const link = document.createElement('a');
    link.href = await courtQrPngDataUrl(payload);
    link.download = courtQrFileName(this.courtName());
    link.click();
  }

  /** Folha simples pra imprimir: nome da quadra, QR grande e como usar. */
  protected async print(): Promise<void> {
    const payload = this.payload();
    if (!payload) return;
    const png = await courtQrPngDataUrl(payload);
    const win = window.open('', '_blank');
    if (!win) {
      this.error.set('O navegador bloqueou a janela de impressão. Use "Baixar PNG".');
      return;
    }
    const doc = win.document;
    doc.title = `QR de check-in · ${this.courtName()}`;
    const style = doc.createElement('style');
    style.textContent =
      'body{font-family:system-ui,sans-serif;text-align:center;padding:48px 24px;color:#111}' +
      'h1{font-size:32px;margin:0 0 8px}p{font-size:18px;margin:8px 0}img{width:360px;height:360px;margin:24px auto}';
    doc.head.appendChild(style);
    const title = doc.createElement('h1');
    title.textContent = this.courtName();
    const img = doc.createElement('img');
    img.src = png;
    img.alt = 'QR de check-in';
    const how = doc.createElement('p');
    how.textContent = 'Check-in da aula: abra o app nexaGO → Treinos → Check-in → Ler QR da quadra.';
    doc.body.append(title, img, how);
    img.onload = () => win.print();
  }
}
