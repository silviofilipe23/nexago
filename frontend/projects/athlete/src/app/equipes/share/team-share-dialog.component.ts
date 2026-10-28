import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { NxToastService } from '../../shared/feedback';
import { TEAM_SHARE_CARD_HEIGHT, TEAM_SHARE_CARD_WIDTH, drawTeamShareCard } from './team-share-card';
import { teamShareCardText, teamShareStyleLabel, teamShareStyles, teamShareUnit, type TeamShareCardData, type TeamShareCardStyle } from './team-share-data';

/**
 * Compartilhar o perfil da equipe/dupla como imagem — a tela `TeamShareCardPage` do app.
 *
 * Três estilos (Perfil · Elenco/Ficha · Ranking; o Ranking só existe com posição). No celular o
 * botão usa a Web Share API com o arquivo e a legenda com o link; no desktop, onde compartilhar
 * arquivo raramente é suportado, sobra o download.
 */
@Component({
  selector: 'app-team-share-dialog',
  templateUrl: './team-share-dialog.component.html',
  styleUrl: './team-share-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class TeamShareDialogComponent {
  private readonly toast = inject(NxToastService);

  readonly data = input.required<TeamShareCardData>();
  /** Ainda chegando o ranking individual da ficha: a imagem espera por ele. */
  readonly pending = input(false);
  readonly closed = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly canvasWidth = TEAM_SHARE_CARD_WIDTH;
  protected readonly canvasHeight = TEAM_SHARE_CARD_HEIGHT;
  protected readonly busy = signal(false);
  /** O desenho é assíncrono (fontes e fotos): exportar antes dele terminar sairia em branco. */
  protected readonly drawing = signal(true);

  protected readonly styles = computed(() => teamShareStyles(this.data()));
  protected readonly style = linkedSignal<TeamShareCardStyle[], TeamShareCardStyle>({
    source: this.styles,
    computation: (styles, previous) => (previous && styles.includes(previous.value) ? previous.value : 'profile'),
  });
  protected readonly title = computed(() => `Compartilhar ${teamShareUnit(this.data())}`);
  protected readonly locked = computed(() => this.busy() || this.drawing() || this.pending());

  /** `navigator.share` com arquivos não existe em boa parte dos desktops — o rótulo do botão
   *  precisa dizer a verdade sobre o que vai acontecer. */
  protected readonly canShareFiles = computed(() => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function');

  constructor() {
    // Encadeado numa fila: trocar de estilo no meio de um desenho intercalaria traços dos dois.
    effect(() => {
      const data = this.data();
      const style = this.style();
      this.drawing.set(true);
      this.drawChain = this.drawChain
        .then(() => this.draw(data, style))
        .catch(() => undefined)
        .finally(() => {
          if (this.data() === data && this.style() === style) this.drawing.set(false);
        });
    });
  }

  private drawChain: Promise<void> = Promise.resolve();

  private async draw(data: TeamShareCardData, style: TeamShareCardStyle): Promise<void> {
    const ctx = this.canvasRef().nativeElement.getContext('2d');
    if (!ctx) return;
    await drawTeamShareCard(ctx, data, style);
  }

  protected styleLabel(style: TeamShareCardStyle): string {
    return teamShareStyleLabel(this.data(), style);
  }

  protected selectStyle(style: TeamShareCardStyle): void {
    this.style.set(style);
  }

  private async toBlob(): Promise<Blob | null> {
    await this.drawChain;
    const canvas = this.canvasRef().nativeElement;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  private fileName(): string {
    const slug = this.data()
      .name.toLowerCase()
      .normalize('NFD')
      // Remove os diacríticos decompostos pelo NFD (bloco combining diacritical marks).
      // Escrito com escapes: o range literal são caracteres combinantes e gruda no caractere
      // anterior do código-fonte.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `nexago-${slug || teamShareUnit(this.data())}.png`;
  }

  protected async share(): Promise<void> {
    if (this.locked()) return;
    this.busy.set(true);
    try {
      const blob = await this.toBlob();
      if (!blob) {
        this.toast.error('Não foi possível gerar a imagem.');
        return;
      }
      const file = new File([blob], this.fileName(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: this.data().name, text: teamShareCardText(this.data(), this.style()) });
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
    if (this.locked()) return;
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
