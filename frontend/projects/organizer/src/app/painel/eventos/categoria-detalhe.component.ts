import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tournamentSportToLevelSportCode } from '@nexago/levels';
import { initialsOf, truncateName } from '../data/mock-data';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { listMatches, type TournamentMatch } from '../data/matches-repository';
import { fetchAthleteRatings } from '../data/athlete-ratings-repository';
import { teamLevelScore, teamLevelsSummary, teamScoreLabel, type AthleteRatingLite, type TeamLevelScore } from '../data/team-level-score';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

type Tone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/** Duplas da categoria — porta de entrada do nível 3 da cascata: roster com status de
 *  pagamento e KPIs. Chave, grupos, jogos e agendamento (as antigas abas) viraram itens
 *  da sidebar contextual da categoria. */
@Component({
  selector: 'og-categoria-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgIconComponent, OgPillComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Equipes" [subtitle]="headerSubtitle()">
      <!-- mock (fase 2): edição de categoria depois do torneio criado ainda não existe no app -->
      <button type="button" class="og-ghost-btn"><og-icon name="edit" [size]="13" />Editar</button>
      <!-- Some quando a chave já foi gerada (categoria com jogos) — regerar apagaria resultados. -->
      @if (!loading() && matches().length === 0) {
        <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'seeds']">
          <og-icon name="bracket" [size]="14" />Sortear chave
        </a>
      }
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando categoria…</div>
      } @else if (!tournament() || !category()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Categoria não encontrada.</div>
      } @else {
        <div class="og-kpi-row">
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Duplas</div>
            <div class="og-kpi-value sm">{{ inscriptions().length }}/{{ category()!.maxTeams ?? '—' }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Pagas</div>
            <div class="og-kpi-value sm" style="color:var(--nx-win)">{{ pagasCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Pendentes</div>
            <div class="og-kpi-value sm" style="color:var(--nx-pending)">{{ pendentesCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Formato</div>
            <div class="og-kpi-value sm" style="font-size:15px;margin-top:10px">{{ formatLabel() }}</div>
          </div>
        </div>

        <div class="og-card og-card-pad-0" style="flex:1;min-height:0">
          <div class="og-table-body" style="padding:4px 20px">
            @for (i of inscriptions(); track i.id; let idx = $index; let last = $last) {
              <div class="og-row" [class.last]="last">
                <span class="og-categoria-seed">{{ pad(idx + 1) }}</span>
                <span class="og-categoria-avatars" [style.width.px]="athletesOf(i).length > 1 ? 52 : 52">
                  @for (p of athletesOf(i); track $index; let ai = $index) {
                    <og-avatar
                      [initials]="initialsOf(p.name)"
                      [photoUrl]="p.photoUrl"
                      [size]="52"
                      [style.margin-left.px]="ai ? -16 : 0"
                      [style.z-index]="2 - ai"
                    />
                  }
                </span>
                <span style="flex:1;min-width:0">
                  <div class="og-categoria-name" [title]="i.teamName">{{ truncate(i.teamName, 100) }}</div>
                  <div class="og-categoria-meta">{{ levelsLine(i) }}</div>
                </span>
                <og-pill tone="dim" [title]="scoreHint(i)">{{ scoreLabel(i) }}</og-pill>
                <og-pill [tone]="payTone(i)">{{ payLabel(i) }}</og-pill>
              </div>
            } @empty {
              <p class="og-empty">Nenhuma inscrição ainda</p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .og-categoria-seed {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-categoria-avatars {
      display: flex;
      align-items: center;
      flex: none;
      height: 34px;
    }
    .og-categoria-avatars .og-avatar {
      box-shadow: 0 0 0 2px var(--nx-surface-0);
    }
    .og-categoria-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-categoria-meta {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
  `,
})
export class CategoriaDetalheComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly initialsOf = initialsOf;
  protected readonly truncate = truncateName;

  protected readonly loading = signal(true);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly inscriptions = signal<TournamentInscription[]>([]);
  protected readonly matches = signal<TournamentMatch[]>([]);
  /** Rating técnico por uid — vazio nos esportes sem engine de rating. */
  private readonly ratings = signal<Map<string, AthleteRatingLite>>(new Map());

  protected readonly category = computed<OrganizerTournamentCategory | null>(
    () => this.tournament()?.categories.find((c) => c.id === this.catId()) ?? null,
  );

  /** Esporte do torneio no vocabulário do perfil (`VOLEI_PRAIA`…) — `null` quando não há
   *  equivalente, aí a pontuação cai no nível global legado. */
  private readonly sportCode = computed(() => tournamentSportToLevelSportCode(this.tournament()?.sportId));

  /** Pontuação de nível por inscrição — a dupla mais forte no topo da leitura do organizador
   *  na hora de escolher os cabeças de chave. */
  private readonly scores = computed(() => {
    const sportCode = this.sportCode();
    const ratings = this.ratings();
    return new Map<string, TeamLevelScore>(
      this.inscriptions().map((i) => [
        i.id,
        teamLevelScore(i.participants, sportCode, i.participants.map((p) => ratings.get(p.uid))),
      ]),
    );
  });

  protected readonly pagasCount = computed(() => this.inscriptions().filter((i) => i.paid).length);
  protected readonly pendentesCount = computed(() => this.inscriptions().filter((i) => !i.paid).length);

  /** Rótulo do formato salvo na categoria (`bracketFormat`) — mesmo vocabulário curto do app. */
  protected readonly formatLabel = computed(() => {
    const raw = this.category()?.bracketFormat;
    if (!raw) return 'Grupos + SE';
    const map: Record<string, string> = {
      groups_knockout: 'Grupos + SE',
      single_elimination: 'Chave simples',
      double_elimination: 'Dupla elim.',
      round_robin: 'Pontos corridos',
      groups_repechage: 'Grupos + rep.',
    };
    return map[raw] ?? raw;
  });

  protected readonly headerSubtitle = computed(() => {
    const cat = this.category();
    if (!cat) return '';
    const taken = this.inscriptions().length;
    if (cat.maxTeams == null) return `${cat.name} · ${taken} duplas`;
    const hint = taken >= cat.maxTeams ? 'lotado' : 'aguardando inscrições';
    return `${cat.name} · ${taken}/${cat.maxTeams} · ${hint}`;
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      const cid = this.catId();
      this.tournament.set(null);
      this.inscriptions.set([]);
      this.matches.set([]);
      if (!tid || !cid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid, cid);
    });
  }

  private async load(tid: string, cid: string): Promise<void> {
    try {
      const [tournament, allInscriptions, allMatches] = await Promise.all([getTournament(tid), listInscriptions(tid), listMatches(tid)]);
      this.tournament.set(tournament);
      const categoryInscriptions = allInscriptions.filter((i) => i.categoryId === cid);
      this.inscriptions.set(categoryInscriptions);
      this.matches.set(allMatches.filter((m) => m.categoryId === cid));
      this.ratings.set(
        await fetchAthleteRatings(
          categoryInscriptions.flatMap((i) => i.participants.map((p) => p.uid)),
          tournamentSportToLevelSportCode(tournament?.sportId),
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** Até 2 atletas pra stack de avatares (solo = 1; sem participantes = fallback no nome da dupla). */
  protected athletesOf(i: TournamentInscription): { name: string; photoUrl: string | null }[] {
    if (i.participants.length > 0) {
      return i.participants.slice(0, 2).map((p) => ({ name: p.name, photoUrl: p.photoUrl }));
    }
    return [{ name: i.teamName, photoUrl: null }];
  }

  /** Selo de força da dupla: soma dos níveis (2–10) e, quando o esporte tem engine de rating
   *  e os dois atletas já saíram do provisional, o rating composto. */
  protected scoreLabel(i: TournamentInscription): string {
    const score = this.scores().get(i.id);
    return score ? teamScoreLabel(score) : '—';
  }

  protected scoreHint(i: TournamentInscription): string {
    const score = this.scores().get(i.id);
    if (!score || score.points == null) return 'Pontuação indisponível — atleta sem nível informado';
    const base = `Pontuação de nível: ${score.points} de 10`;
    return score.rating == null ? base : `${base} · rating técnico ${Math.round(score.rating)}`;
  }

  /** Composição de níveis + data de inscrição na mesma linha de apoio. */
  protected levelsLine(i: TournamentInscription): string {
    const score = this.scores().get(i.id);
    const levels = score ? teamLevelsSummary(score) : 'Nível não informado';
    return i.createdAt ? `${levels} · Inscrito em ${this.shortDate(i.createdAt)}` : levels;
  }

  protected payTone(i: TournamentInscription): Tone {
    if (i.paid) return 'green';
    if (i.paymentStatus === 'waitlist') return 'dim';
    return 'yellow';
  }

  protected payLabel(i: TournamentInscription): string {
    if (i.paid) return 'Pago';
    if (i.paymentStatus === 'waitlist') return 'Espera';
    return 'Pendente';
  }

  protected shortDate(d: Date): string {
    return SHORT_DATE.format(d);
  }
}
