import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { CenterContextService } from '../core/center-context.service';
import { CenterStore } from '../data/center-store.service';
import { awaitingTooLong, holdExpired } from '../domain/enrollment';
import { initialsOf } from '../domain/models';
import { canAccessArea, ROLE_LABELS } from '../domain/roles';
import { IconComponent } from '../ui/icon.component';
import { BannerComponent } from '../ui/kit';
import { CenterAvatarComponent } from './center-avatar.component';
import { NAV_GROUPS } from './nav';

/**
 * Layout de `/centro/:centerId/**`: fixa o centro ativo a partir da URL, monta a sidebar do
 * protótipo (CtSidebar) e, se o vínculo não existe ou foi revogado, mostra o bloqueio em vez do
 * painel. Centro suspenso ganha a faixa vermelha de somente leitura (W5) em todas as telas.
 */
@Component({
  selector: 'ct-center-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, BannerComponent, CenterAvatarComponent],
  host: { '(document:keydown.escape)': 'closeAll()' },
  templateUrl: './center-shell.component.html',
  styleUrl: './center-shell.component.scss',
})
export class CenterShellComponent {
  readonly centerId = input.required<string>();

  protected readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly switcherOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly me = this.ctx.me;
  protected readonly center = this.ctx.center;
  protected readonly displayName = computed(() => this.me()?.displayName || this.auth.displayName());
  protected readonly initials = computed(() => initialsOf(this.displayName()));
  protected readonly roleLabel = computed(() => {
    const m = this.me();
    return m ? ROLE_LABELS[m.role] : '';
  });

  protected readonly groups = computed(() => {
    const me = this.me();
    const badges: Record<string, number> = {
      enrollments: this.store.enrollments().filter((e) => e.status === 'waitlisted' || (e.status === 'pending' && holdExpired(e))).length,
      finance: this.store.invoices().filter((i) => awaitingTooLong(i)).length,
    };
    return NAV_GROUPS.map((g) => ({
      title: g.title,
      items: g.items.filter((i) => canAccessArea(me, i.area)).map((i) => ({ ...i, badge: badges[i.area] ?? 0 })),
    })).filter((g) => g.items.length > 0);
  });

  /** Fase do layout: carregando, sem vínculo, revogado ou painel. */
  protected readonly phase = computed(() => {
    if (!this.ctx.ready()) {
      return 'loading';
    }
    const m = this.me();
    if (!m) {
      return 'no-member';
    }
    if (m.status === 'revoked') {
      return 'revoked';
    }
    if (!this.ctx.centerReady()) {
      return 'loading';
    }
    return this.center() ? 'panel' : 'missing';
  });

  protected readonly otherCenters = computed(() => this.ctx.activeMemberships());

  constructor() {
    effect(() => this.ctx.activeCenterId.set(this.centerId()));
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeAll());
  }

  protected closeAll(): void {
    this.switcherOpen.set(false);
    this.menuOpen.set(false);
  }

  protected switchTo(centerId: string): void {
    this.closeAll();
    void this.router.navigate(['/centro', centerId, 'dashboard']);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
