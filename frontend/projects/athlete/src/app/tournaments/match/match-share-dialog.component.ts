import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { matchBestOf, matchClosedSets, matchIsCompleted, matchIsLive, matchSetWins, type TournamentMatch } from '../../data/matches-repository';
import { NxToastService } from '../../shared/feedback';
import { courtLabelOf, dayLabelOf, liveScoreLineOf, timeLabelOf } from '../tournament-format';
import { groupLabelOf, knockoutLabelOf, roundDisplayNumberOf } from '../tournament-live.selectors';
import { TournamentLiveStore } from '../tournament-live.store';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, drawShareCard, type ShareCardData, type ShareStage, type ShareTeam } from './match-share-card';

/**
 * Compartilhar a partida como imagem (04i).
 *
 * Sem link público: por decisão de produto, o compartilhamento é só a imagem. No celular o botão
 * usa a Web Share API com o arquivo — a folha nativa é quem oferece Instagram Stories, WhatsApp e
 * o resto. No desktop, onde compartilhar arquivo raramente é suportado, sobra o download.
 */
@Component({
  selector: 'app-match-share-dialog',
  imports: [],
  templateUrl: './match-share-dialog.component.html',
  styleUrl: './match-share-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class MatchShareDialogComponent {
  private readonly store = inject(TournamentLiveStore);
  private readonly toast = inject(NxToastService);

  readonly match = input.required<TournamentMatch>();
  readonly closed = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly busy = signal(false);
  protected readonly canvasWidth = SHARE_CARD_WIDTH;
  protected readonly canvasHeight = SHARE_CARD_HEIGHT;

  /** `navigator.share` com arquivos não existe em boa parte dos desktops — o rótulo do botão
   *  precisa dizer a verdade sobre o que vai acontecer. */
  protected readonly canShareFiles = computed(() => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function');

  protected readonly cardData = computed<ShareCardData>(() => {
    const m = this.match();
    const [a, b] = matchSetWins(m);
    const live = matchIsLive(m);
    const finished = matchIsCompleted(m);
    const bestOf = matchBestOf(m);
    return {
      tournamentName: this.store.tournament()?.name ?? null,
      phaseLabel: this.phaseLabel(m),
      categoryName: this.store.tournament()?.categories.find((c) => c.id === m.categoryId)?.categoryName ?? null,
      stage: this.stageOf(m),
      live,
      finished,
      teamA: this.teamOf(m.teamAId, m.teamADescription),
      teamB: this.teamOf(m.teamBId, m.teamBDescription),
      winner: finished && m.winnerId ? (m.winnerId === m.teamAId ? 'A' : 'B') : null,
      sets: matchClosedSets(m),
      setWins: [a, b],
      liveLine: liveScoreLineOf(m),
      formatLine: bestOf <= 1 ? 'Set único' : `Melhor de ${bestOf}`,
      dateLine: this.dateLineOf(m),
    };
  });

  constructor() {
    // Redesenha a cada mudança de placar: com a partida ao vivo, o card do preview acompanha.
    // Encadeado numa fila porque o desenho é assíncrono (fontes + fotos) — dois redraws em
    // paralelo intercalariam traços de estados diferentes.
    effect(() => {
      const data = this.cardData();
      this.drawChain = this.drawChain.then(() => this.draw(data)).catch(() => undefined);
    });
  }

  private drawChain: Promise<void> = Promise.resolve();

  private async draw(data: ShareCardData): Promise<void> {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    await drawShareCard(ctx, data);
  }

  private teamOf(teamId: string, description: string | null): ShareTeam {
    return { name: this.store.duoNameOf(teamId, description), players: this.store.duoPlayersOf(teamId) };
  }

  private phaseLabel(m: TournamentMatch): string {
    return m.poolId
      ? `${groupLabelOf(m.poolId, this.store.matches())} · rodada ${roundDisplayNumberOf(this.store.matches(), m.poolId, m.round)}`
      : knockoutLabelOf(m);
  }

  /** Final e 3º lugar ganham a paleta ouro/bronze do pôster da Copa VH. */
  private stageOf(m: TournamentMatch): ShareStage {
    if (m.poolId) return 'game';
    const label = knockoutLabelOf(m);
    if (label === 'Final' || label === 'Grand final') return 'final';
    if (label === '3º lugar') return 'third';
    return 'game';
  }

  /** "Sáb 02/08 · 17:30 · Quadra 1" — rodapé do pôster. */
  private dateLineOf(m: TournamentMatch): string | null {
    const parts = [dayLabelOf(m.scheduleTime), m.scheduleTime ? timeLabelOf(m.scheduleTime) : null, courtLabelOf(m.courtName)].filter(
      (p): p is string => p != null,
    );
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  private async toBlob(): Promise<Blob | null> {
    const canvas = this.canvasRef().nativeElement;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  private fileName(): string {
    const data = this.cardData();
    const slug = `${data.teamA.name}-x-${data.teamB.name}`
      .toLowerCase()
      .normalize('NFD')
      // Remove os diacríticos decompostos pelo NFD (bloco combining diacritical marks).
      // Escrito com escapes: o range literal são caracteres combinantes e gruda no caractere
      // anterior do código-fonte.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `nexago-${slug || 'partida'}.png`;
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
      const data = this.cardData();
      const score = `${data.setWins[0]}–${data.setWins[1]}`;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${data.teamA.name} x ${data.teamB.name}`, text: `${data.teamA.name} ${score} ${data.teamB.name}` });
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
