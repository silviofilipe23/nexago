import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CategoryBracketComponent } from '../../category/category-bracket.component';
import { TournamentLiveStore } from '../../tournament-live.store';

/** A chave da categoria em foco. Existe só para alimentar o `categoryIdInput` do componente de
 *  chave, que fora do Focus lê a categoria da rota — esta rota não tem `:categoriaId`. Não chama
 *  `acquireLive()` nem adiciona chrome próprio: a casca do Focus já cuida dos dois. */
@Component({
  selector: 'app-focus-bracket',
  imports: [CategoryBracketComponent],
  template: '<app-category-bracket [categoryIdInput]="store.focusCategoryId()" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusBracketComponent {
  protected readonly store = inject(TournamentLiveStore);
}
