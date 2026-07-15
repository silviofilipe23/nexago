import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OG_BRACKET, type OgBracketMatch } from '../data/mock-data';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { ChaveamentoSubnavComponent } from './chaveamento-subnav.component';

/** Chave de eliminação — rounds em colunas, com destaque para o lado vencedor de cada confronto. */
@Component({
  selector: 'og-chaveamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgIconComponent, ChaveamentoSubnavComponent],
  template: `
    <og-page-header title="Chaveamento" subtitle="Liga Municipal de Beach Tennis · categoria Open Misto">
      <button type="button" class="og-mini-btn"><og-icon name="whistle" [size]="14" />Sortear chave</button>
      <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="download" [size]="14" />Exportar</button>
    </og-page-header>

    <div class="og-content" style="overflow:auto">
      <og-chaveamento-subnav active="chave" />
      <div class="og-bracket">
        @for (r of bracket; track r.round) {
          <div class="og-bracket-col">
            <div class="og-bracket-round-label">{{ r.round }}</div>
            <div class="og-bracket-matches">
              @for (m of r.matches; track $index) {
                <div class="og-bracket-match">
                  <div class="og-bracket-side" [class.winner]="isWinner(m, 'a')">
                    <span class="og-bracket-side-name">{{ m.a }}</span>
                    <span class="og-bracket-side-score">{{ m.sa }}</span>
                  </div>
                  <div class="og-bracket-side" [class.winner]="isWinner(m, 'b')">
                    <span class="og-bracket-side-name">{{ m.b }}</span>
                    <span class="og-bracket-side-score">{{ m.sb }}</span>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class ChaveamentoComponent {
  protected readonly bracket = OG_BRACKET;

  protected isWinner(m: OgBracketMatch, side: 'a' | 'b'): boolean {
    if (!m.done) return false;
    return side === 'a' ? m.sa > m.sb : m.sb > m.sa;
  }
}
