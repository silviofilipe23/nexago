import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { NxToastService } from '../../shared/feedback';
import { PREDICTIONS_CARD_HEIGHT, PREDICTIONS_CARD_WIDTH, drawPredictionsShareCard } from './predictions-share-card';
import { predictionShareFileName, predictionShareText, type PredictionShareData } from './predictions-share';

/**
 * Compartilhar o ranking de palpites como imagem.
 *
 * Mesmo diálogo do compartilhamento de partida (`../match/match-share-dialog.component.ts`):
 * prévia do card à esquerda, ações à direita, e o botão principal muda de rótulo conforme o
 * navegador suporte compartilhar arquivo. A diferença é que aqui existe um link — o ranking mora
 * numa página —, então há também "Copiar link", que o card da partida não tem.
 */
@Component({
  selector: 'app-predictions-share-dialog',
  imports: [],
  templateUrl: './predictions-share-dialog.component.html',
  styleUrl: './predictions-share-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class PredictionsShareDialogComponent {
  private readonly toast = inject(NxToastService);

  readonly data = input.required<PredictionShareData>();
  readonly url = input.required<string>();
  readonly closed = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly busy = signal(false);
  protected readonly canvasWidth = PREDICTIONS_CARD_WIDTH;
  protected readonly canvasHeight = PREDICTIONS_CARD_HEIGHT;

  /** `navigator.share` com arquivos não existe em boa parte dos desktops — o rótulo do botão
   *  precisa dizer a verdade sobre o que vai acontecer. */
  protected readonly canShareFiles = computed(() => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function');

  constructor() {
    // Encadeado numa fila porque o desenho é assíncrono (espera as fontes): dois redraws em
    // paralelo intercalariam traços de estados diferentes.
    effect(() => {
      const data = this.data();
      this.drawChain = this.drawChain.then(() => this.draw(data)).catch(() => undefined);
    });
  }

  private drawChain: Promise<void> = Promise.resolve();

  private async draw(data: PredictionShareData): Promise<void> {
    const ctx = this.canvasRef().nativeElement.getContext('2d');
    if (!ctx) return;
    await drawPredictionsShareCard(ctx, data);
  }

  private fileName(): string {
    return predictionShareFileName(this.data().tournamentName);
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
          title: 'Ranking de palpites',
          text: predictionShareText(this.data(), this.url()),
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

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.toast.success('Link copiado', 'Quem abrir vê o ranking e pode palpitar.');
    } catch {
      this.toast.error('Não foi possível copiar', 'Selecione o link e copie manualmente.');
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
