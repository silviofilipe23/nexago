import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AtPanelShellComponent } from '../../../painel/at-panel-shell.component';

/** Casca comum das telas do wizard: cabeçalho com voltar, corpo e barra de ações.
 *
 *  Porte de `RegistrationWizardScaffold` (app). Todas as telas do fluxo usam esta casca para o
 *  cabeçalho e o espaçamento não divergirem tela a tela — foi o que aconteceu com a tela única
 *  do portal, que acumulou 1210 linhas justamente por ser a dona de tudo. */
@Component({
  selector: 'app-registration-wizard-shell',
  imports: [AtPanelShellComponent],
  templateUrl: './registration-wizard-shell.component.html',
  styleUrl: './registration-wizard-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationWizardShellComponent {
  readonly userName = input('Atleta');
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);

  /** Posição do passo na trilha, 1-based. `null` esconde o contador — telas terminais e
   *  estados de erro não são "passo N de M". */
  readonly stepNumber = input<number | null>(null);
  readonly stepCount = input(6);

  /** `true` troca a seta de voltar por um "X" de fechar, para telas cujo voltar SAI do fluxo
   *  em vez de desfazer um passo (a espera é a única hoje — ver `registration-waiting`). */
  readonly closeIcon = input(false);

  readonly back = output<void>();
}
