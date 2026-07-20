import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { fetchArenaBooking, type ArenaBookingDoc } from '../data/arena-bookings-repository';
import { fetchLeague } from '../data/leagues-repository';
import { fetchMyBookings, bookingIsActive, type MyBooking } from '../data/my-bookings-repository';
import { fetchMatchesForTeam, fetchTeamsForAthlete, matchIsCompleted, type ArenaMatch } from '../data/teams-repository';
import { fetchTournamentSummariesByIds, type TournamentSummary } from '../data/tournaments-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';

export type HistoryRowKind = 'aluguel' | 'torneio' | 'liga' | 'pagamento';
export type HistoryRowTone = 'neutral' | 'paid' | 'win' | 'loss' | 'pending' | 'canceled';
export type HistoryTab = 'tudo' | 'jogos' | 'reservas' | 'pagamentos';

export interface HistoryRow {
  id: string;
  date: Date;
  kind: HistoryRowKind;
  kindLabel: string | null;
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeTone: HistoryRowTone;
  amountReais: number | null;
  amountLabel: string | null;
  link: readonly string[] | null;
}

export interface HistoryMonthGroup {
  key: string;
  title: string;
  summaryLabel: string;
  rows: HistoryRow[];
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function resolveAmount(doc: ArenaBookingDoc | undefined, booking: MyBooking): number | null {
  if (doc) return doc.amountReais;
  return booking.amountReais;
}

interface RentalPaymentStatus {
  label: string;
  tone: HistoryRowTone;
  methodLabel: string;
}

/** Status de pagamento real da reserva — usado tanto no badge da linha "Aluguel" quanto na
 *  linha dedicada de "Pagamentos" (a mesma reserva, duas leituras diferentes, não duplicadas
 *  na aba "Tudo": lá só a linha de aluguel aparece). */
function resolveRentalPaymentStatus(booking: MyBooking, doc: ArenaBookingDoc | undefined): RentalPaymentStatus {
  if (!bookingIsActive(booking)) {
    return { label: 'Cancelada', tone: 'canceled', methodLabel: 'No local' };
  }
  if (doc?.status === 'pending_payment') {
    return { label: 'Pendente', tone: 'pending', methodLabel: 'Pix' };
  }
  if (doc?.paymentChannel === 'pix') {
    if (doc.paymentStatus === 'paid') return { label: 'Pago', tone: 'paid', methodLabel: 'Pix' };
    if (doc.paymentStatus === 'partial') return { label: '50% pago', tone: 'pending', methodLabel: 'Pix' };
    return { label: 'Pendente', tone: 'pending', methodLabel: 'Pix' };
  }
  return { label: 'A pagar na arena', tone: 'pending', methodLabel: 'No local' };
}

function dateFromKeyAndTime(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, h || 0, min || 0);
}

/** `Final` / `Semifinal` / `Quartas de final` etc — mesmas pistas de `roundShortLabel`
 *  (teams-repository), mas por extenso pro histórico. */
function roundFullLabel(matchType: string): string {
  const t = matchType.trim().toLowerCase();
  if (t.includes('final') && !t.includes('semi') && !t.includes('quarter') && !t.includes('third')) return 'Final';
  if (t.includes('third') || t.includes('bronze')) return 'Disputa de 3º lugar';
  if (t.includes('semi')) return 'Semifinal';
  if (t.includes('quarter')) return 'Quartas de final';
  if (t.includes('16')) return 'Oitavas de final';
  if (t.includes('32')) return 'Rodada de 32';
  if (t.includes('group') || t.includes('pool')) return 'Fase de grupos';
  return 'Partida';
}

const MONTH_TITLE_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function monthTitle(d: Date): string {
  const raw = MONTH_TITLE_FMT.format(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Tela "Histórico": jogos (partidas de torneio/liga), reservas de quadra e pagamentos do
 *  atleta, agrupados por mês. "Jogos" e "Reservas" ficam em abas separadas de propósito —
 *  aluguel de quadra não tem vencedor/perdedor, então não entra na contagem de vitórias nem
 *  no "total de jogos". Sem "Desafio" (1v1 de ranking) — não existe backend real pra essa
 *  feature ainda; padrão do projeto é remover, não fingir. */
@Component({
  selector: 'app-athlete-history',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent],
  templateUrl: './athlete-history.component.html',
  styleUrl: './athlete-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteHistoryComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly loading = signal(true);
  /** Jogos + reservas — SEM as linhas de pagamento, pra não duplicar a mesma reserva na
   *  aba "Tudo" (o status de pagamento já aparece no badge da própria linha de aluguel). */
  protected readonly rows = signal<HistoryRow[]>([]);
  /** Lista à parte, só pra aba "Pagamentos" — mesma reserva da linha de aluguel, outra leitura. */
  protected readonly allPaymentRows = signal<HistoryRow[]>([]);
  protected readonly tab = signal<HistoryTab>('tudo');

  /** "Jogos": só partidas com vencedor real (torneio/liga) — aluguel de quadra não conta. */
  protected readonly matchRows = computed(() => this.rows().filter((r) => r.kind === 'torneio' || r.kind === 'liga'));
  protected readonly rentalRows = computed(() => this.rows().filter((r) => r.kind === 'aluguel'));
  protected readonly paymentRows = computed(() => this.allPaymentRows());

  protected readonly totalGames = computed(() => this.matchRows().length);
  protected readonly wins = computed(() => this.matchRows().filter((r) => r.badgeTone === 'win').length);
  protected readonly winRatePercent = computed(() => {
    const total = this.matchRows().length;
    return total === 0 ? 0 : Math.round((this.wins() / total) * 100);
  });
  protected readonly totalSpentLabel = computed(() => {
    const sum = this.paymentRows().reduce((acc, r) => (r.badgeTone === 'canceled' ? acc : acc + (r.amountReais ?? 0)), 0);
    return formatBRL(sum);
  });

  protected readonly visibleRows = computed(() => {
    switch (this.tab()) {
      case 'jogos':
        return this.matchRows();
      case 'reservas':
        return this.rentalRows();
      case 'pagamentos':
        return this.paymentRows();
      default:
        return this.rows();
    }
  });

  protected readonly monthGroups = computed<HistoryMonthGroup[]>(() => {
    const byKey = new Map<string, HistoryRow[]>();
    for (const row of [...this.visibleRows()].sort((a, b) => b.date.getTime() - a.date.getTime())) {
      const key = monthKey(row.date);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(row);
      else byKey.set(key, [row]);
    }
    return [...byKey.entries()].map(([key, rowsInMonth]) => {
      const games = rowsInMonth.filter((r) => r.kind === 'torneio' || r.kind === 'liga');
      const wins = rowsInMonth.filter((r) => r.badgeTone === 'win').length;
      // Funciona em qualquer aba: aluguel e pagamento nunca aparecem juntos na mesma lista
      // (ver `rows`/`allPaymentRows`), então somar por "tem valor" não duplica o gasto.
      const spent = rowsInMonth
        .filter((r) => r.amountReais != null && r.badgeTone !== 'canceled')
        .reduce((acc, r) => acc + (r.amountReais ?? 0), 0);
      return {
        key,
        title: monthTitle(rowsInMonth[0]!.date),
        summaryLabel: `${games.length} jogo${games.length === 1 ? '' : 's'} · ${wins} vitória${wins === 1 ? '' : 's'} · ${formatBRL(spent)} gastos`,
        rows: rowsInMonth,
      };
    });
  });

  constructor() {
    void this.load();
  }

  protected setTab(tab: HistoryTab): void {
    this.tab.set(tab);
  }

  private async load(): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    const uid = this.auth.user()?.uid ?? null;
    if (!db || !projectId || !uid) {
      this.rows.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const [bookings, teams] = await Promise.all([fetchMyBookings(db, uid), fetchTeamsForAthlete(db, projectId, uid)]);

      const bookingDocs = await Promise.all(bookings.map((b) => fetchArenaBooking(db, b.id)));
      const bookingDocById = new Map<string, ArenaBookingDoc>();
      bookingDocs.forEach((doc, i) => {
        if (doc) bookingDocById.set(bookings[i]!.id, doc);
      });

      const matchesByTeam = await Promise.all(teams.map((t) => fetchMatchesForTeam(db, projectId, t.id)));
      const teamIds = new Set(teams.map((t) => t.id));
      const matchById = new Map<string, ArenaMatch>();
      for (const match of matchesByTeam.flat()) {
        if (matchIsCompleted(match) && match.winnerId != null) matchById.set(match.id, match);
      }
      const matches = [...matchById.values()];

      const tournamentIds = [...new Set(matches.map((m) => m.tournamentId).filter((id) => id))];
      const tournaments = await fetchTournamentSummariesByIds(db, tournamentIds);

      const leagueIds = [...new Set([...tournaments.values()].map((t) => t.leagueId).filter((id): id is string => id != null))];
      const leagueEntries = await Promise.all(leagueIds.map(async (id) => [id, await fetchLeague(db, id)] as const));
      const leagueNameById = new Map(leagueEntries.filter(([, league]) => league != null).map(([id, league]) => [id, league!.name]));

      const rentalRows = this.buildRentalRows(bookings, bookingDocById);
      const paymentRows = this.buildPaymentRows(bookings, bookingDocById);
      const matchRows = this.buildMatchRows(matches, teamIds, tournaments, leagueNameById);

      this.rows.set([...rentalRows, ...matchRows]);
      this.allPaymentRows.set(paymentRows);
    } catch (err) {
      if (!environment.production) {
        console.error('[history] load error', err);
      }
      this.rows.set([]);
      this.allPaymentRows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  /** Uma linha por reserva ativa — o badge já mostra o status de pagamento real, então essa
   *  mesma reserva NÃO aparece de novo como linha de pagamento na aba "Tudo" (só na aba
   *  "Pagamentos" dedicada, via `buildPaymentRows`). */
  private buildRentalRows(bookings: readonly MyBooking[], docs: Map<string, ArenaBookingDoc>): HistoryRow[] {
    return bookings
      .filter((b) => bookingIsActive(b))
      .map((b) => {
        const date = dateFromKeyAndTime(b.dateKey, b.startTime);
        const doc = docs.get(b.id);
        const amount = resolveAmount(doc, b);
        const status = resolveRentalPaymentStatus(b, doc);
        return {
          id: `aluguel-${b.id}`,
          date,
          kind: 'aluguel' as const,
          kindLabel: 'ALUGUEL',
          title: `${b.arenaName} · ${b.courtName}`,
          subtitle: 'Reserva de quadra',
          badgeLabel: status.label.toUpperCase(),
          badgeTone: status.tone,
          amountReais: amount,
          amountLabel: amount != null ? formatBRL(amount) : null,
          link: ['/agenda/reserva', b.id],
        };
      });
  }

  private buildPaymentRows(bookings: readonly MyBooking[], docs: Map<string, ArenaBookingDoc>): HistoryRow[] {
    return bookings.map((b) => {
      const doc = docs.get(b.id);
      const date = dateFromKeyAndTime(b.dateKey, b.startTime);
      const status = resolveRentalPaymentStatus(b, doc);
      const amount = resolveAmount(doc, b);
      return {
        id: `pagamento-${b.id}`,
        date,
        kind: 'pagamento' as const,
        kindLabel: null,
        title: `Reserva ${b.arenaName} · ${b.courtName}`,
        subtitle: status.methodLabel,
        badgeLabel: status.label.toUpperCase(),
        badgeTone: status.tone,
        amountReais: amount,
        amountLabel: amount != null ? formatBRL(amount) : null,
        link: ['/agenda/reserva', b.id],
      };
    });
  }

  private buildMatchRows(
    matches: readonly ArenaMatch[],
    teamIds: ReadonlySet<string>,
    tournaments: ReadonlyMap<string, TournamentSummary>,
    leagueNameById: ReadonlyMap<string, string>,
  ): HistoryRow[] {
    const rows: HistoryRow[] = [];
    for (const m of matches) {
      const athleteTeamId = teamIds.has(m.teamAId) ? m.teamAId : teamIds.has(m.teamBId) ? m.teamBId : null;
      if (!athleteTeamId) continue;
      const date = m.matchEndedAt ?? m.scheduleTime;
      if (!date) continue;
      const tournament = tournaments.get(m.tournamentId);
      const isLeague = tournament?.leagueId != null;
      const leagueName = tournament?.leagueId ? leagueNameById.get(tournament.leagueId) : null;
      const categoryName = tournament?.categories.find((c) => c.id === m.categoryId)?.categoryName ?? '';
      const venue = tournament?.location || tournament?.city || 'Arena';
      const win = m.winnerId === athleteTeamId;

      rows.push({
        id: `match-${m.id}`,
        date,
        kind: isLeague ? 'liga' : 'torneio',
        kindLabel: isLeague ? 'LIGA' : 'TORNEIO',
        title: isLeague
          ? `${leagueName ?? tournament?.name ?? 'Liga'} · ${tournament?.leagueStageName ?? tournament?.name ?? ''}`
          : `${tournament?.name ?? 'Torneio'} · ${roundFullLabel(m.matchType)}`,
        subtitle: [venue, categoryName].filter((v) => v).join(' · '),
        badgeLabel: win ? 'VITÓRIA' : 'DERROTA',
        badgeTone: win ? 'win' : 'loss',
        amountReais: null,
        amountLabel: null,
        link: tournament ? ['/torneios', tournament.id] : null,
      });
    }
    return rows;
  }

  protected exportCsv(): void {
    const rows = this.visibleRows();
    if (rows.length === 0) return;
    const header = ['Data', 'Tipo', 'Título', 'Detalhe', 'Status', 'Valor'];
    const lines = [header, ...rows.map((r) => [
      r.date.toLocaleDateString('pt-BR'),
      r.kindLabel ?? 'PAGAMENTO',
      r.title,
      r.subtitle,
      r.badgeLabel,
      r.amountLabel ?? '',
    ])];
    const csv = lines.map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'historico-nexago.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
