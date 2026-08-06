import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RegistrationProgress } from './registration-progress';

/** Card "Continue sua inscrição" do painel — componente burro: recebe a trilha já montada por
 *  `buildRegistrationProgress` e só renderiza. Toda a regra (qual passo, qual rota) fica no
 *  módulo puro. O cancelamento também mora no pai: aqui só emite o item. */
@Component({
  selector: 'at-registration-tracker',
  imports: [RouterLink],
  templateUrl: './at-registration-tracker.component.html',
  styleUrl: './at-registration-tracker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtRegistrationTrackerComponent {
  readonly items = input.required<readonly RegistrationProgress[]>();
  readonly cancel = output<RegistrationProgress>();
}
