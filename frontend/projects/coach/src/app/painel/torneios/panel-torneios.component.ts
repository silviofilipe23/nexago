import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { getApps } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AthletesService } from '../atletas/athletes.service';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';

interface AthleteTournamentEntry {
  athleteUid: string;
  registrationId: string;
  categoryId: string;
  isPaid: boolean;
  partnerPending: boolean;
}

interface CoachTournamentOverviewItem {
  tournamentId: string;
  tournamentName: string;
  entries: AthleteTournamentEntry[];
}

@Component({
  selector: 'co-panel-torneios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Torneios" [subtitle]="subtitle()" />

      <div class="body">
        @if (loading()) {
          <p class="empty">Carregando…</p>
        } @else if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        } @else if (tournaments().length === 0) {
          <p class="empty">Nenhum atleta da equipe está inscrito em torneios no momento.</p>
        } @else {
          @for (t of tournaments(); track t.tournamentId) {
            <co-panel-card [title]="t.tournamentName" [kicker]="t.entries.length + ' inscrições'">
              @for (e of t.entries; track e.registrationId; let last = $last) {
                <co-row [title]="athleteName(e.athleteUid)" [sub]="e.categoryId" [last]="last">
                  <co-pill row-trailing [tone]="statusTone(e)">{{ statusLabel(e) }}</co-pill>
                </co-row>
              }
            </co-panel-card>
          }
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
  `,
})
export class PanelTorneiosComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly tournaments = signal<CoachTournamentOverviewItem[]>([]);

  protected readonly subtitle = computed(() => {
    const n = this.tournaments().length;
    return `${n} torneio${n === 1 ? '' : 's'} com atletas inscritos`;
  });

  constructor() {
    effect(() => {
      const squadId = this.squadContext.activeSquadId();
      void this.load(squadId);
    });
  }

  private async load(squadId: string | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const fn = httpsCallable<{ squadId?: string }, { tournaments: CoachTournamentOverviewItem[] }>(
        getFunctions(getApps()[0]!),
        'getCoachTournamentOverview',
      );
      const res = await fn(squadId ? { squadId } : {});
      this.tournaments.set(res.data.tournaments);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível carregar os torneios.');
    } finally {
      this.loading.set(false);
    }
  }

  protected athleteName(uid: string): string {
    return this.athletesService.roster().find((a) => a.athleteUid === uid)?.displayName ?? 'Atleta';
  }

  protected statusLabel(e: AthleteTournamentEntry): string {
    if (e.partnerPending) {
      return 'Aguardando parceiro';
    }
    return e.isPaid ? 'Inscrito e pago' : 'Inscrito';
  }

  protected statusTone(e: AthleteTournamentEntry): PillTone {
    return e.partnerPending ? 'yellow' : 'green';
  }
}
