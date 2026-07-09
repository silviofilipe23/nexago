import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  arenaSlotIsAvailable,
  fetchArenaById,
  fetchArenaDaySlotsMerged,
  fetchCourts,
  type ArenaCourtDoc,
  type ArenaListItem,
  type ArenaSlot,
} from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';

const WEEKDAY_FULL = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
] as const;
const MONTH_FULL = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
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

/** Lê o esporte de um doc de quadra (`sport` ou `courtType`, mesmo schema usado pelo site público). */
function courtSportLabel(data: Record<string, unknown>): string {
  const raw = data['sport'] ?? data['courtType'];
  return typeof raw === 'string' && raw.trim().length > 0 ? titleCase(raw.trim()) : 'Esporte não informado';
}

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reconstructChain(slots: ArenaSlot[], startTime: string, count: number): ArenaSlot[] | null {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const startIdx = sorted.findIndex((s) => s.startTime === startTime);
  if (startIdx === -1) return null;
  const chain: ArenaSlot[] = [sorted[startIdx]!];
  let cursor = chain[0]!;
  for (let i = 1; i < count; i++) {
    const next = sorted[startIdx + i];
    if (!next || next.startTime !== cursor.endTime || !arenaSlotIsAvailable(next)) {
      return null;
    }
    chain.push(next);
    cursor = next;
  }
  return chain;
}

function formatDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

@Component({
  selector: 'app-arena-booking-confirmed',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './arena-booking-confirmed.component.html',
  styleUrl: './arena-booking-confirmed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArenaBookingConfirmedComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly arenaId = computed(() => this.route.snapshot.paramMap.get('arenaId') ?? '');

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly arena = signal<ArenaListItem | null>(null);
  protected readonly court = signal<ArenaCourtDoc | null>(null);
  protected readonly chain = signal<ArenaSlot[]>([]);
  protected readonly selectedDate = signal<Date>(new Date());
  protected readonly durationSlots = signal(1);
  protected readonly notice = signal<string | null>(null);

  protected readonly courtSportLabel = computed(() => {
    const c = this.court();
    return c ? courtSportLabel(c.data) : '';
  });

  protected readonly timeRangeLabel = computed(() => {
    const chain = this.chain();
    if (chain.length === 0) return '—';
    return `${chain[0]!.startTime} - ${chain[chain.length - 1]!.endTime}`;
  });

  protected readonly durationLabel = computed(() => {
    const chain = this.chain();
    if (chain.length === 0) return '—';
    const start = chain[0]!.startTime;
    const end = chain[chain.length - 1]!.endTime;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const minutes = (eh! * 60 + em!) - (sh! * 60 + sm!);
    return formatDurationLabel(minutes);
  });

  protected readonly dateLabel = computed(() => {
    const d = this.selectedDate();
    return `${WEEKDAY_FULL[d.getDay()]}, ${d.getDate()} de ${MONTH_FULL[d.getMonth()]} de ${d.getFullYear()}`;
  });

  protected readonly totalPrice = computed(() => {
    const chain = this.chain();
    const arenaFallback = this.arena()?.pricePerHourReais ?? 0;
    return chain.reduce((sum, s) => sum + (s.priceReais ?? arenaFallback), 0);
  });

  protected readonly mapsUrl = computed(() => {
    const a = this.arena();
    if (!a) return '';
    const q = a.lat != null && a.lng != null ? `${a.lat},${a.lng}` : `${a.name}, ${a.locationLabel}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  constructor() {
    void this.load();
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
  }

  private async load(): Promise<void> {
    const id = this.arenaId();
    const qp = this.route.snapshot.queryParamMap;
    const courtId = qp.get('courtId');
    const date = parseDateParam(qp.get('date'));
    const time = qp.get('time');
    const duration = Number.parseInt(qp.get('duration') ?? '1', 10) || 1;

    if (!id || !this.firestore || !courtId || !date || !time) {
      this.error.set('Dados da reserva incompletos.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.selectedDate.set(date);
    this.durationSlots.set(duration);

    try {
      const arena = await fetchArenaById(this.firestore, id);
      if (!arena) {
        this.error.set('Arena não encontrada.');
        this.loading.set(false);
        return;
      }
      this.arena.set(arena);

      const courts = await fetchCourts(this.firestore, id);
      const court = courts.find((c) => c.id === courtId) ?? null;
      if (!court) {
        this.error.set('Quadra não encontrada.');
        this.loading.set(false);
        return;
      }
      this.court.set(court);

      const daySlots = await fetchArenaDaySlotsMerged(this.firestore, id, date);
      const courtSlots = daySlots.filter((s) => s.courtId === court.id);
      const chain = reconstructChain(courtSlots, time, duration);
      this.chain.set(chain ?? []);
    } catch (err) {
      if (!environment.production) {
        console.error('[arena-booking-confirmed] load error', err);
      }
      this.error.set('Não foi possível carregar os dados da reserva agora.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async inviteToPlay(): Promise<void> {
    const a = this.arena();
    if (!a) return;
    const text = `Bora jogar comigo na ${a.name}, ${this.dateLabel()} às ${this.chain()[0]?.startTime ?? ''}?`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ text });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        this.showNotice('Convite copiado — cole numa conversa para chamar parceiros.');
        return;
      }
      this.showNotice('Copie o convite manualmente: ' + text);
    } catch {
      // usuário cancelou o compartilhamento nativo — nada a fazer
    }
  }

  protected addToAgenda(): void {
    this.showNotice('A agenda automática chega em breve por aqui — por enquanto, anote você mesmo o horário.');
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}
