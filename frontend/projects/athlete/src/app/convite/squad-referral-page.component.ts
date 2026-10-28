import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AuthShellComponent } from '../auth/ui/auth-shell.component';
import { SQUAD_PARAM, normalizeSquadCode } from '../shared/squad/squad-link';
import { SquadTierComponent } from '../squad/ui/squad-tier.component';
import {
  SQUAD_REFERRAL_LOOKUP,
  referralCopy,
  type ReferralViewer,
  type SquadReferralLookup,
} from './squad-referral';

/**
 * `/indicacao?squad=CODIGO` — onde o link/QR do embaixador (`/?squad=`) deixa o visitante. Antes
 * ele caía no login seco, sem saber do convite nem do desconto.
 *
 * O clique já foi guardado pelo `app.ts` (localStorage) e vai para a conta assim que houver
 * sessão, então os botões só levam ao cadastro ou ao login: nada aqui grava.
 */
@Component({
  selector: 'app-squad-referral-page',
  imports: [RouterLink, AuthShellComponent, SquadTierComponent],
  templateUrl: './squad-referral-page.component.html',
  styleUrl: './squad-referral-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadReferralPageComponent {
  private readonly auth = inject(AuthService);
  private readonly lookupReferral = inject(SQUAD_REFERRAL_LOOKUP);

  /** O guard da rota só deixa entrar com código no formato. */
  protected readonly code =
    normalizeSquadCode(inject(ActivatedRoute).snapshot.queryParamMap.get(SQUAD_PARAM)) ?? '';

  protected readonly lookup = signal<SquadReferralLookup | null>(null);

  protected readonly referral = computed(() => {
    const l = this.lookup();
    return l?.kind === 'found' ? l.referral : null;
  });

  protected readonly viewer = computed<ReferralViewer | null>(() => {
    if (!this.auth.authReady()) return null;
    const uid = this.auth.user()?.uid;
    if (!uid) return 'guest';
    return this.referral()?.ambassador.uid === uid ? 'self' : 'member';
  });

  protected readonly copy = computed(() => {
    const lookup = this.lookup();
    const viewer = this.viewer();
    return lookup && viewer ? referralCopy(lookup, viewer) : null;
  });

  protected readonly initials = computed(() =>
    (this.referral()?.ambassador.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join(''),
  );

  constructor() {
    if (this.code) {
      void this.lookupReferral(this.code).then((l) => this.lookup.set(l));
    }
  }
}
