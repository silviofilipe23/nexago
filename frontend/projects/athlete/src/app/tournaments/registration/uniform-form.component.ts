import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import {
  categoryRequiresShorts,
  UNIFORM_CHANGE_DEADLINE_DAYS,
  uniformSizeOptionsShortsForCategory,
  uniformSizeOptionsTopForCategory,
  type UniformSelection,
} from '../tournament-uniform';

/** Formulário de uniforme POR ATLETA — usado pelo titular (página de inscrição) e pelo
 *  convidado (aceite na Agenda), espelho do `TournamentRegistrationUniformStep` do app.
 *  Campos condicionais às flags da categoria; a validação fica no chamador
 *  (`validateUniformSelection`) pra cada tela mostrar o erro no seu padrão de notice. */
@Component({
  selector: 'app-uniform-form',
  templateUrl: './uniform-form.component.html',
  styleUrl: './uniform-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UniformFormComponent {
  readonly category = input.required<TournamentCategoryOffer>();
  readonly value = input.required<UniformSelection>();
  readonly disabled = input(false);
  readonly valueChange = output<UniformSelection>();

  protected readonly deadlineDays = UNIFORM_CHANGE_DEADLINE_DAYS;
  protected readonly topOptions = computed(() => uniformSizeOptionsTopForCategory(this.category()));
  protected readonly shortsOptions = computed(() => uniformSizeOptionsShortsForCategory(this.category()));
  protected readonly showShorts = computed(() => categoryRequiresShorts(this.category()));

  protected selectTop(size: string): void {
    this.emit({ ...this.value(), sizeTop: size });
  }

  protected selectShorts(size: string): void {
    this.emit({ ...this.value(), sizeShorts: size });
  }

  protected onNumberInput(raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    this.emit({ ...this.value(), jerseyNumber: digits ? Number(digits) : null });
  }

  protected onNameInput(raw: string): void {
    this.emit({ ...this.value(), jerseyName: raw });
  }

  private emit(next: UniformSelection): void {
    if (this.disabled()) return;
    this.valueChange.emit(next);
  }
}
