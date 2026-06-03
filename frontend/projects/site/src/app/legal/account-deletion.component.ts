import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Página exigida pelo Google Play: exclusão de conta e dados. */
@Component({
  selector: 'app-account-deletion',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './account-deletion.component.html',
  styleUrls: ['./account-deletion.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDeletionComponent {
  readonly supportEmail = 'contato@nexago.com.br';
  readonly mailtoDelete = `mailto:${this.supportEmail}?subject=${encodeURIComponent('Exclusão de conta NexaGO')}&body=${encodeURIComponent(
    'Olá,\n\nSolicito a exclusão da minha conta e dos dados associados no app NexaGO.\n\nE-mail cadastrado no app:\n\nUID (se souber):\n\n',
  )}`;
}
