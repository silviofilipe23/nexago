import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { NxToastService } from '../../shared/feedback';
import { REGISTRATION_CARD_HEIGHT, REGISTRATION_CARD_WIDTH, drawRegistrationShareCard } from './registration-share-card';
import { registrationShareFileName, registrationShareText, type RegistrationShareData } from './registration-share';

/**
 * Compartilhar a inscrição confirmada como imagem.
 *
 * Mesmo diálogo dos outros dois compartilhamentos do portal (`../match/match-share-dialog` e
 * `../predictions/predictions-share-dialog`): prévia do card à esquerda, ações à direita, e o
 * botão principal muda de rótulo conforme o navegador suporte compartilhar arquivo.
 *
 * Sem "copiar link", que os outros dois têm: uma inscrição não tem página pública para onde
 * apontar — o que se compartilha aqui é só a imagem.
 */
@Component({
  selector: 'app-registration-share-dialog',
  imports: [],
  templateUrl: './registration-share-dialog.component.html',
  styleUrl: './registration-share-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class RegistrationShareDialogComponent {
  private readonly toast = inject(NxToastService);

  readonly data = input.required<RegistrationShareData>();
  readonly closed = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly busy = signal(false);
  protected readonly canvasWidth = REGISTRATION_CARD_WIDTH;
  protected readonly canvasHeight = REGISTRATION_CARD_HEIGHT;

  /** `navigator.share` com arquivos não existe em boa parte dos desktops — o rótulo do botão
   *  precisa dizer a verdade sobre o que vai acontecer. */
  protected readonly canShareFiles = computed(() => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function');

  constructor() {
    // Encadeado numa fila porque o desenho é assíncrono (espera fontes e fotos): dois redraws em
    // paralelo intercalariam traços de estados diferentes.
    effect(() => {
      const data = this.data();
      this.drawChain = this.drawChain.then(() => this.draw(data)).catch(() => undefined);
    });
  }

  private drawChain: Promise<void> = Promise.resolve();

  private async draw(data: RegistrationShareData): Promise<void> {
    const ctx = this.canvasRef().nativeElement.getContext('2d');
    if (!ctx) return;
    await drawRegistrationShareCard(ctx, data);
  }

  private fileName(): string {
    return registrationShareFileName(this.data().tournamentName);
  }

  private async toBlob(): Promise<Blob | null> {
    const canvas = this.canvasRef().nativeElement;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  protected async share(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const blob = await this.toBlob();
      if (!blob) {
        this.toast.error('Não foi possível gerar a imagem.');
        return;
      }
      const file = new File([blob], this.fileName(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Inscrição confirmada',
          text: registrationShareText(this.data()),
        });
        this.close();
        return;
      }
      // Sem suporte a compartilhar arquivo, baixar é o caminho equivalente.
      this.saveBlob(blob);
      this.toast.success('Imagem baixada', 'Compartilhe direto do seu app de fotos.');
      this.close();
    } catch (error) {
      // Cancelar a folha nativa dispara AbortError — não é falha, não vira toast de erro.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.toast.error('Não foi possível compartilhar agora.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async download(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const blob = await this.toBlob();
      if (!blob) {
        this.toast.error('Não foi possível gerar a imagem.');
        return;
      }
      this.saveBlob(blob);
      this.toast.success('Imagem baixada', 'Pronta para postar nos stories.');
      this.close();
    } finally {
      this.busy.set(false);
    }
  }

  private saveBlob(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.fileName();
    a.click();
    URL.revokeObjectURL(url);
  }

  protected close(): void {
    this.closed.emit();
  }
}
