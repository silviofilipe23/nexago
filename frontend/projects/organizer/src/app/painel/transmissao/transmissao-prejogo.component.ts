import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { tournamentSportToLevelSportCode } from '@nexago/levels';
import { fetchAthleteRatings } from '../data/athlete-ratings-repository';
import { fetchMatchesOfTeam, resolveCourtNames, type TournamentMatch } from '../data/matches-repository';
import { getTournament } from '../data/tournaments-repository';
import { OgCardComponent } from '../ui/card.component';
import { rosterLabelOf } from './interview-card';
import { prejogoCandidatesOf, prejogoCardOf, prejogoPatch, swapPrejogoSides } from './prejogo-card';
import { TransmissaoDataService } from './transmissao-data.service';
import { spTimeLabel } from '../data/schedule-format';
import { courtMatchOf } from './transmissao-selectors';

/** Card "Pré-jogo" da tela Transmissão: escolhe uma partida agendada, monta o card das duas duplas
 *  (ranking, Elo, campanha na etapa e confrontos anteriores — o overlay público não lê nada disso)
 *  e grava em `broadcast/control.prejogo`. "No ar" liga e desliga o que já está gravado.
 *
 *  Grava sempre o card COMPLETO: `setDoc` com merge funde mapas, e campo omitido deixaria resto do
 *  card anterior no ar. */
@Component({
  selector: 'og-tx-prejogo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    @let pj = svc.control().prejogo;
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Pré-jogo'">
      <label class="og-pj-label" for="og-pj-partida">Partida</label>
      <select id="og-pj-partida" class="og-input-el" (change)="select($any($event.target).value)">
        <option value="" [selected]="selectedId() === ''">Escolha a partida…</option>
        @for (o of options(); track o.id) {
          <option [value]="o.id" [selected]="o.id === selectedId()">{{ o.label }}</option>
        } @empty {
          <option value="" disabled>Nenhuma partida agendada com as duas duplas</option>
        }
      </select>
      <div class="og-pj-acoes">
        <button type="button" class="og-ghost-btn" (click)="pullFromScoreboard()">Puxar do placar</button>
        <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="!selectedId() || busy()" (click)="build()">
          {{ busy() ? 'Montando…' : 'Montar card' }}
        </button>
      </div>
      @if (hint(); as h) {
        <p class="og-pj-dica">{{ h }}</p>
      }
      @if (error()) {
        <p class="og-pj-erro" role="alert">Não deu pra montar o card — confira a conexão e tente de novo.</p>
      }

      @if (pj.card; as card) {
        <div class="og-pj-card">
          <div class="og-pj-card-titulo">{{ card.a.names.join(' / ') }} × {{ card.b.names.join(' / ') }}</div>
          <div class="og-pj-card-sub">{{ cardContext(card.category, card.phase, card.startTime) }}</div>
        </div>
        <div class="og-pj-acoes">
          <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="reanimate()">Reanimar</button>
          <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="swap()">Inverter lados</button>
        </div>
      }
      @if (!bare()) {
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">No ar</div>
          <div class="og-toggle-row-desc">{{ pj.card ? 'Mostra a apresentação das duplas na live' : 'Monte um card pra poder pôr no ar' }}</div>
        </div>
        <button
          type="button"
          class="og-toggle"
          role="switch"
          aria-label="Pré-jogo no ar"
          [class.on]="pj.on"
          [attr.aria-checked]="pj.on"
          [disabled]="!pj.card && !pj.on"
          (click)="toggleOnAir()"
        ></button>
      </div>
      }
    </og-card>
  `,
  styles: `
    .og-pj-label {
      display: block;
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-pj-acoes {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      margin: 12px 0;
    }
    .og-pj-dica {
      margin: 6px 0;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-pj-erro {
      margin: 6px 0;
      font-size: 13px;
      color: var(--nx-live, #ff3b30);
    }
    .og-pj-card {
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
    }
    .og-pj-card-titulo {
      font-size: 14px;
      font-weight: 600;
    }
    .og-pj-card-sub {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoPrejogoComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura, título nem chave "No ar" próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly selectedId = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  protected readonly hint = signal<string | null>(null);

  /** Nome do torneio por id — confrontos anteriores citam outros torneios; cada um é lido uma vez. */
  private readonly tournamentNames = new Map<string, string>();

  /** Jogo do auto-agendamento antigo só gravou `courtId` — o nome sai das quadras do torneio. */
  private readonly matches = computed(() => resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []));
  private readonly candidates = computed(() => prejogoCandidatesOf(this.matches()));

  protected readonly options = computed(() =>
    this.candidates().map((m) => ({ id: m.id, label: this.labelOf(m) })),
  );

  constructor() {
    // O ranking é a coleção inteira do esporte: só se lê quando alguém escolhe uma partida.
    effect(() => {
      if (this.selectedId()) this.svc.ensureRanking();
    });
  }

  private nameOf(teamId: string, fallback: string): string {
    return rosterLabelOf(this.svc.rosters().get(teamId)) ?? fallback;
  }

  private labelOf(m: TournamentMatch): string {
    const when = m.scheduledAt ? spTimeLabel(m.scheduledAt) : 'sem horário';
    return `${m.court ?? 'Sem quadra'} · ${when} · ${this.nameOf(m.teamAId, m.team1Label)} × ${this.nameOf(m.teamBId, m.team2Label)}`;
  }

  protected cardContext(category: string | null, phase: string | null, time: string | null): string {
    return [category, phase, time].filter((p): p is string => !!p).join(' · ');
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.hint.set(null);
  }

  /** Pré-seleciona a partida da quadra acompanhada, quando ela é uma das agendadas. */
  protected pullFromScoreboard(): void {
    const m = courtMatchOf(this.matches(), this.svc.control().courtId, Date.now());
    if (m && this.candidates().some((c) => c.id === m.id)) {
      this.select(m.id);
      return;
    }
    this.hint.set('A quadra acompanhada não tem partida agendada com as duas duplas.');
  }

  private selectedMatch(): TournamentMatch | null {
    return this.candidates().find((m) => m.id === this.selectedId()) ?? null;
  }

  private newKey(matchId: string): string {
    return `${matchId}:${Date.now()}`;
  }

  /** Busca ratings e confrontos, monta o card e grava (mantendo o "No ar" como está). */
  protected async build(): Promise<void> {
    const match = this.selectedMatch();
    if (!match || this.busy()) return;
    this.busy.set(true);
    this.error.set(false);
    this.hint.set(null);
    try {
      this.svc.ensureRanking();
      const t = this.svc.tournament();
      const rosters = this.svc.rosters();
      const uids = [match.teamAId, match.teamBId].flatMap((id) => (rosters.get(id)?.members ?? []).map((m) => m.uid));
      const [ratings, previous] = await Promise.all([
        fetchAthleteRatings(uids, tournamentSportToLevelSportCode(t?.sportId)),
        fetchMatchesOfTeam(match.teamAId),
      ]);
      await this.loadTournamentNames(previous, match);
      const card = prejogoCardOf(
        {
          matches: this.matches(),
          rosters,
          teamRanking: this.svc.teamRanking(),
          ratings,
          previous,
          tournamentNames: this.tournamentNames,
          categoryName: t?.categories.find((c) => c.id === match.categoryId)?.name ?? null,
          courtName: match.court,
        },
        match,
        this.newKey(match.id),
      );
      if (!card) {
        this.hint.set('Essa partida ainda não tem as duas duplas definidas.');
        return;
      }
      await this.svc.save({ prejogo: prejogoPatch(this.svc.control().prejogo.on, card) });
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  /** Só os torneios dos confrontos que vão pro card (3 mais recentes entre as duas duplas). */
  private async loadTournamentNames(previous: readonly TournamentMatch[], match: TournamentMatch): Promise<void> {
    const ids = new Set(
      previous
        .filter((m) => m.id !== match.id && m.status === 'completed')
        .filter((m) => (m.teamAId === match.teamBId || m.teamBId === match.teamBId))
        .map((m) => m.tournamentId),
    );
    await Promise.all(
      [...ids]
        .filter((id) => id && !this.tournamentNames.has(id))
        .map(async (id) => {
          const name = (await getTournament(id).catch(() => null))?.name;
          if (name) this.tournamentNames.set(id, name);
        }),
    );
  }

  protected toggleOnAir(): void {
    const { on, card } = this.svc.control().prejogo;
    void this.svc.save({ prejogo: prejogoPatch(!on, card) });
  }

  protected reanimate(): void {
    const { on, card } = this.svc.control().prejogo;
    if (!card) return;
    void this.svc.save({ prejogo: prejogoPatch(on, { ...card, key: this.newKey(card.matchId) }) });
  }

  protected swap(): void {
    const { on, card } = this.svc.control().prejogo;
    if (!card) return;
    void this.svc.save({ prejogo: prejogoPatch(on, swapPrejogoSides(card, this.newKey(card.matchId))) });
  }
}
