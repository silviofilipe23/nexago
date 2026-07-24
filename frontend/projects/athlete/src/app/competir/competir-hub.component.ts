import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

interface CompetirSection {
  link: string;
  title: string;
  desc: string;
  icon: 'trophy' | 'chart' | 'team' | 'people';
}

/** Hub do Competir — espelha o hub do app (Competir agrupa torneios, ranking,
 *  equipes e atletas como sub-seções). No desktop a sidebar tem links diretos;
 *  no mobile este hub é a porta de entrada dessas 4 áreas pela bottom-nav. */
@Component({
  selector: 'app-competir-hub',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <header class="ch-page-header">
        <div>
          <h1>Competir</h1>
          <div class="ch-page-header-sub">Torneios, ranking, equipes e atletas</div>
        </div>
      </header>

      <div class="ch-body">
        <div class="ch-grid">
          @for (s of sections; track s.link) {
            <a class="ch-card" [routerLink]="s.link">
              <span class="ch-card-icon" aria-hidden="true">
                @switch (s.icon) {
                  @case ('trophy') {
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>
                  }
                  @case ('chart') {
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18" /><path d="M6 21v-8M12 21V4M18 21v-11" /></svg>
                  }
                  @case ('team') {
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" /></svg>
                  }
                  @case ('people') {
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6" /><path d="M16 4.5c1.8.3 3.2 1.9 3.2 3.7 0 1.9-1.4 3.4-3.2 3.7" /><path d="M17.5 14.3c2.3.5 4 2.5 4 5" /></svg>
                  }
                }
              </span>
              <span class="ch-card-body">
                <span class="ch-card-title">{{ s.title }}</span>
                <span class="ch-card-desc">{{ s.desc }}</span>
              </span>
              <svg class="ch-card-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </a>
          }
        </div>
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .ch-page-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 24px;
      border-bottom: 1px solid var(--nx-line);
    }
    @media (max-width: 640px) {
      .ch-page-header {
        padding: 0;
      }
    }
    .ch-page-header h1 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    .ch-page-header-sub {
      margin-top: 3px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .ch-body {
      padding: 22px 24px 32px;
    }
    @media (max-width: 640px) {
      .ch-body {
        padding: 16px 0;
      }
    }
    .ch-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      max-width: 860px;
    }
    @media (max-width: 720px) {
      .ch-grid {
        grid-template-columns: 1fr;
      }
    }
    .ch-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px;
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      text-decoration: none;
      color: inherit;
      transition: border-color 140ms ease-out;
    }
    .ch-card:hover {
      border-color: var(--nx-line-strong);
    }
    .ch-card-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--nx-r-3);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }
    .ch-card-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ch-card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .ch-card-desc {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
      line-height: 1.4;
    }
    .ch-card-chevron {
      flex: none;
      color: var(--nx-text-dim);
    }
  `,
})
export class CompetirHubComponent {
  private readonly auth = inject(AuthService);

  protected readonly sections: CompetirSection[] = [
    { link: '/torneios', title: 'Torneios e ligas', desc: 'Descubra competições abertas e acompanhe suas inscrições', icon: 'trophy' },
    { link: '/ranking', title: 'Ranking', desc: 'Sua posição e a pontuação da temporada', icon: 'chart' },
    { link: '/equipes', title: 'Equipes', desc: 'Suas duplas e times, com histórico de jogos', icon: 'team' },
    { link: '/atletas', title: 'Atletas', desc: 'Encontre jogadores da comunidade', icon: 'people' },
  ];

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });
}
