import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { TournamentRegistrationService } from '../tournament-registration.service';

@Component({
  selector: 'app-step-success',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './step-success.component.html',
  styleUrl: './step-success.component.scss',
})
export class StepSuccessComponent {
  private readonly reg = inject(TournamentRegistrationService);

  protected readonly tournament = toSignal(this.reg.tournament$, { initialValue: null });

  protected share(): void {
    const t = this.tournament();
    const title = t ? `${t.name} — NexaGO` : 'NexaGO';
    const text = t
      ? `Acabei de garantir minha vaga no ${t.name}. Bora pra areia?`
      : 'Acabei de me inscrever na NexaGO.';

    const url = typeof globalThis.location !== 'undefined' ? globalThis.location.href : '';

    const nav = globalThis.navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof nav.share === 'function') {
      void nav.share({ title, text, url }).catch(() => this.copyUrl(url));
    } else {
      void this.copyUrl(url);
    }
  }

  private async copyUrl(url: string): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }

  protected inviteFriends(): void {
    void this.share();
  }
}
