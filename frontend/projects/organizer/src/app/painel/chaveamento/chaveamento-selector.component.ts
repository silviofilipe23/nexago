import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ChaveamentoContextService } from './chaveamento-context.service';

/** Seletor de torneio + categoria — contexto real (`ChaveamentoContextService`) que grupos,
 *  jogos e agendamento passam a exibir. O protótipo mockava o torneio/categoria no subtítulo
 *  do cabeçalho ("Liga Municipal de Beach Tennis · categoria Open Misto"); aqui vira controle
 *  de verdade porque o organizador pode ter vários torneios/categorias reais. Não aparece na
 *  tela "chave" (mata-mata) nem em "placar" — ver comentários nesses componentes. */
@Component({
  selector: 'og-chaveamento-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-chav-selector' },
  template: `
    @if (ctx.loadingTournaments()) {
      <div class="og-chav-selector-loading">Carregando torneios…</div>
    } @else if (ctx.tournaments().length === 0) {
      <div class="og-chav-selector-empty">Nenhum torneio ainda — crie pelo app nexaGO</div>
    } @else {
      <select class="og-chav-select" [value]="ctx.selectedTournamentId()" (change)="onTournamentChange($event)">
        @for (t of ctx.tournaments(); track t.id) {
          <option [value]="t.id">{{ t.name }}</option>
        }
      </select>

      @if (ctx.categories().length > 0) {
        <div class="og-filter-bar">
          <button type="button" class="og-chip" [class.active]="ctx.selectedCategoryId() === null" (click)="ctx.selectCategory(null)">Todas</button>
          @for (c of ctx.categories(); track c.id) {
            <button type="button" class="og-chip" [class.active]="ctx.selectedCategoryId() === c.id" (click)="ctx.selectCategory(c.id)">{{ c.name }}</button>
          }
        </div>
      }
    }
  `,
  styles: `
    :host.og-chav-selector {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .og-chav-select {
      height: 32px;
      padding: 0 10px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
    }
    .og-chav-selector-loading,
    .og-chav-selector-empty {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class ChaveamentoSelectorComponent {
  protected readonly ctx = inject(ChaveamentoContextService);

  constructor() {
    this.ctx.ensureLoaded();
  }

  protected onTournamentChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.ctx.selectTournament(id);
  }
}
