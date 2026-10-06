import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';

/** Card "Grade do dia" da tela Transmissão: liga a programação das quadras e destaca uma
 *  categoria. O overlay lê as partidas do torneio sozinho. */
@Component({
  selector: 'og-tx-grade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgCardComponent],
  template: `
    @let g = svc.control().grade;
    <og-card kicker="Apresentação" title="Grade do dia">
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">Programação das quadras</div>
          <div class="og-toggle-row-desc">Horários × quadras do dia, com o jogo atual e o próximo de cada quadra</div>
        </div>
        <button type="button" class="og-toggle" role="switch" [class.on]="g.on" [attr.aria-checked]="g.on" aria-label="Grade do dia no ar" (click)="toggle()"></button>
      </div>

      <div class="og-gd-label">Destacar categoria</div>
      <div class="og-gd-chips" role="radiogroup" aria-label="Categoria em destaque">
        <button type="button" class="og-chip" role="radio" [class.active]="g.categoryId === null" [attr.aria-checked]="g.categoryId === null" (click)="setCategory(null)">Todas</button>
        @for (c of svc.tournament()?.categories ?? []; track c.id) {
          <button type="button" class="og-chip" role="radio" [class.active]="g.categoryId === c.id" [attr.aria-checked]="g.categoryId === c.id" (click)="setCategory(c.id)">
            {{ c.name }}
          </button>
        }
      </div>
      <p class="og-gd-dica">Com uma categoria escolhida, os outros jogos ficam esmaecidos.</p>
    </og-card>
  `,
  styles: `
    .og-gd-label {
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-gd-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-gd-dica {
      margin: 12px 0 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoGradeComponent {
  protected readonly svc = inject(TransmissaoDataService);

  protected toggle(): void {
    const g = this.svc.control().grade;
    void this.svc.save({ grade: { ...g, on: !g.on } });
  }

  protected setCategory(categoryId: string | null): void {
    void this.svc.save({ grade: { ...this.svc.control().grade, categoryId } });
  }
}
