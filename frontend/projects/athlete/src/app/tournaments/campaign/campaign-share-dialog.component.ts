import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { NxToastService } from '../../shared/feedback';
import type { CampaignShareData } from './campaign-share';
import { CAMPAIGN_CARD_HEIGHT, CAMPAIGN_CARD_WIDTH, drawCampaignShareCard } from './campaign-share-card';

/**
 * Compartilhar a campanha do atleta como imagem.
 *
 * Sem link público: como nos outros cards do portal, o compartilhamento é só a imagem. No celular
 * a Web Share API entrega o arquivo e a folha nativa é quem oferece Instagram Stories, WhatsApp e
 * o resto. No desktop, onde compartilhar arquivo raramente é suportado, sobra o download.
 *
 * Recebe `CampaignShareData` PRONTA — quem monta é a tela (`campaignShareDataOf`). As duas
 * entradas (Trajetória do Focus e aba Minha inscrição) usam este mesmo diálogo sem diferença.
 */
@Component({
  selector: 'app-campaign-share-dialog',
  imports: [],
  templateUrl: './campaign-share-dialog.component.html',
  styleUrl: './campaign-share-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class CampaignShareDialogComponent {
  private readonly toast = inject(NxToastService);

  readonly data = input.required<CampaignShareData>();
  readonly closed = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly busy = signal(false);
  protected readonly canvasWidth = CAMPAIGN_CARD_WIDTH;
  protected readonly canvasHeight = CAMPAIGN_CARD_HEIGHT;

  /** `navigator.share` com arquivos não existe em boa parte dos desktops — o rótulo do botão
   *  precisa dizer a verdade sobre o que vai acontecer. */
  protected readonly canShareFiles = computed(() => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function');

  constructor() {
    // Encadeado numa fila porque o desenho é assíncrono (fontes + fotos): dois redraws em paralelo
    // intercalariam traços de estados diferentes. Mesmo padrão do diálogo de partida.
    effect(() => {
      const data = this.data();
      this.drawChain = this.drawChain.then(() => this.draw(data)).catch(() => undefined);
    });
  }

  private drawChain: Promise<void> = Promise.resolve();

  private async draw(data: CampaignShareData): Promise<void> {
    const ctx = this.canvasRef().nativeElement.getContext('2d');
    if (!ctx) return;
    await drawCampaignShareCard(ctx, data);
  }

  private async toBlob(): Promise<Blob | null> {
    const canvas = this.canvasRef().nativeElement;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  private fileName(): string {
    const slug = this.data()
      .teamName.toLowerCase()
      .normalize('NFD')
      // Remove os diacríticos decompostos pelo NFD (bloco combining diacritical marks).
      // Escrito com escapes: o range literal são caracteres combinantes e gruda no caractere
      // anterior do código-fonte.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `nexago-campanha-${slug || 'atleta'}.png`;
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
      const data = this.data();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: data.teamName, text: `${data.teamName} — ${data.tournamentName}` });
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
