import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { PointByPointSet } from './match-point-by-point';

/** Nomes das duas colunas da timeline, já na ordem em que ela desenha. */
export interface PointByPointColumn {
  name: string;
  isMe: boolean;
}

export interface PointByPointColumns {
  left: PointByPointColumn;
  right: PointByPointColumn;
}

/**
 * Card "Ponto a ponto" do detalhe da partida: abas por set e a timeline espelhada dos pontos que a
 * mesa marcou — cada bloco de pontos seguidos na coluna de quem pontuou.
 *
 * Puramente de apresentação: quem manda no set aberto é o pai (é ele que sabe de que partida se
 * trata e quando a escolha do atleta precisa ser esquecida). Aqui só entra o que já está pronto
 * para desenhar, o que também mantém o `match-detail` no seu orçamento de CSS.
 */
@Component({
  selector: 'app-match-point-by-point',
  templateUrl: './match-point-by-point.component.html',
  styleUrl: './match-point-by-point.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchPointByPointComponent {
  readonly sets = input.required<readonly PointByPointSet[]>();
  readonly selectedSetIndex = input.required<number | null>();
  readonly columns = input.required<PointByPointColumns | null>();
  /** "maior sequência 4 · 6 empates · 2 viradas · 18 min" — já montada por `summaryLineOf`. */
  readonly summary = input.required<string | null>();

  readonly setSelected = output<number>();

  protected readonly selectedSet = computed<PointByPointSet | null>(() => {
    const index = this.selectedSetIndex();
    return this.sets().find((s) => s.setIndex === index) ?? null;
  });
}
