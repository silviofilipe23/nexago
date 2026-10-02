import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { OrganizerHeaderVm } from './organizer-profile.vm';

/** Cabeçalho do perfil: capa, logo, nome + selo, meta, ações, números e esportes. Só exibe —
 *  quem decide seguir/compartilhar é a página. */
@Component({
  selector: 'app-organizer-profile-header',
  templateUrl: './organizer-profile-header.component.html',
  styleUrl: './organizer-profile-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerProfileHeaderComponent {
  readonly vm = input.required<OrganizerHeaderVm>();
  readonly following = input(false);
  readonly followBusy = input(false);
  /** Falso no próprio perfil e sem sessão: o botão some. */
  readonly canFollow = input(false);

  readonly follow = output<void>();
  readonly share = output<void>();

  protected readonly coverFailed = signal(false);
  protected readonly logoFailed = signal(false);
}
