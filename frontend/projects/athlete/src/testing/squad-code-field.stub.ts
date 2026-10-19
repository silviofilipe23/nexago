import { Component, input, model } from '@angular/core';

/**
 * Stand-in de `SquadCodeFieldComponent` nos specs de checkout. O campo de verdade consulta
 * `checkSquadCode` assim que sabe o que vai ser cobrado (link/QR guardado na conta) — com a chave
 * do Firebase zerada pelos specs, essa chamada inicia um FirebaseApp em branco que derruba o
 * `App should create the app` noutra ordem da suíte. Os specs de tela mexem no desconto pelos
 * signals da própria tela.
 */
@Component({ selector: 'app-squad-code-field', template: '' })
export class SquadCodeFieldStubComponent {
  readonly code = model('');
  readonly discountPct = model(0);
  readonly feePercent = model<number | null>(null);
  readonly feeFloorReais = model(1.5);
  readonly purpose = input<string>('registration');
  readonly arenaId = input<string | null>(null);
  readonly athleteUids = input<string[]>([]);
  readonly registrationId = input<string | null>(null);
  readonly disabled = input(false);
  readonly discountReais = input(0);
  readonly serverError = input<string | null>(null);
}
