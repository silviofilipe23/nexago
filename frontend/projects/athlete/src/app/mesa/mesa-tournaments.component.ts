import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { athleteFirestore } from '../data/firestore';
import { staffRoleLabel, watchMyStaffTournaments, type MyStaffTournament } from '../data/tournament-staff-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

/** Entrada da operação no portal do atleta: os torneios em que ele é equipe (mesário ou
 *  gestor), lidos do espelho `users/{uid}/tournamentStaff`. Espelha a seção "Torneios que eu
 *  opero" do app (`my_staff_tournaments_section.dart`). */
@Component({
  selector: 'app-mesa-tournaments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <div class="mt-body">
        <header class="mt-head">
          <h1 class="mt-title">Mesa</h1>
          <p class="mt-sub">Torneios que você opera. Abra um para lançar os placares das partidas.</p>
        </header>

        @if (loading()) {
          <app-nx-page-loading title="Carregando seus torneios…" subtitle="Buscando onde você está na equipe" />
        } @else if (entries().length === 0) {
          <div class="mt-card mt-empty">
            <p class="mt-empty-title">Você ainda não é equipe de nenhum torneio.</p>
            <p class="mt-empty-sub">
              Quando um organizador te adicionar como mesário, o torneio aparece aqui e a mesa abre direto.
            </p>
          </div>
        } @else {
          <div class="mt-list">
            @for (entry of entries(); track entry.tournamentId) {
              <a class="mt-card mt-row" [routerLink]="['/mesa', entry.tournamentId]">
                <span class="mt-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M12 5v14M7 10h1M16 10h1" />
                  </svg>
                </span>
                <span class="mt-info">
                  <span class="mt-name">{{ entry.tournamentName || 'Torneio' }}</span>
                  <span class="mt-meta">{{ roleLabel(entry) }}{{ dateLabel(entry) }}</span>
                </span>
                <span class="mt-chev" aria-hidden="true">›</span>
              </a>
            }
          </div>
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .mt-body {
      padding: 24px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .mt-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0 0 4px;
    }
    .mt-sub {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .mt-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mt-card {
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      padding: 14px 16px;
    }
    .mt-row {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out);
    }
    .mt-row:hover {
      border-color: var(--nx-orange-500);
    }
    .mt-icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      flex: none;
      border-radius: var(--nx-r-2);
      background: rgba(255, 106, 26, 0.12);
      color: var(--nx-orange-500);
    }
    .mt-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .mt-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mt-meta {
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .mt-chev {
      color: var(--nx-text-dim);
      font-size: 22px;
      line-height: 1;
    }
    .mt-empty-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin: 0 0 6px;
    }
    .mt-empty-sub {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    @media (max-width: 720px) {
      .mt-body {
        padding: 20px 16px 32px;
      }
    }
  `,
})
export class MesaTournamentsComponent {
  private readonly auth = inject(AuthService);
  private readonly db = athleteFirestore();

  protected readonly entries = signal<MyStaffTournament[]>([]);
  protected readonly loading = signal(true);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid;
      const db = this.db;
      if (!uid || !db) {
        this.entries.set([]);
        this.loading.set(false);
        return;
      }
      const unsub = watchMyStaffTournaments(
        db,
        uid,
        (entries) => {
          this.entries.set(entries);
          this.loading.set(false);
        },
        () => this.loading.set(false),
      );
      onCleanup(() => unsub());
    });
  }

  protected roleLabel(entry: MyStaffTournament): string {
    return staffRoleLabel(entry.role);
  }

  protected dateLabel(entry: MyStaffTournament): string {
    return entry.startAt ? ` · ${DATE.format(entry.startAt)}` : '';
  }
}
