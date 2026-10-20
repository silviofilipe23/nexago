import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { ArenaBookingDoc } from '../../data/arena-bookings-repository';
import { bookingInviteShareMessage, bookingInviteUrl } from '../../data/booking-invite-model';
import { getArenaBookingInviteLink, inviteArenaBookingPlayers } from '../../data/booking-invites-repository';
import { athleteFunctions } from '../../data/functions';
import { searchAthleteDirectory, type AthletePublicProfile } from '../../data/public-profiles-repository';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { initialsOf } from './booking-team';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Mínimo para buscar — o mesmo do app (`booking_invite_sheet.dart`). */
const MIN_SEARCH_CHARS = 2;

export type InviteRowState = 'playing' | 'invited' | 'sending' | 'idle';

/** "Convidar jogadores" do detalhe da reserva — espelha `booking_invite_sheet.dart`: o link do
 *  jogo (multiuso, para o grupo do WhatsApp) e a busca de atleta, que convida um por vez (push
 *  + inbox). Convite pendente não segura vaga, então dá pra chamar mais gente do que há vaga:
 *  quem aceitar primeiro entra. O diálogo fica aberto depois de convidar, como a folha do app. */
@Component({
  selector: 'app-booking-invite-dialog',
  imports: [NxSpinnerComponent],
  templateUrl: './booking-invite-dialog.component.html',
  styleUrl: './booking-invite-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'dismiss()',
    '(keydown.tab)': 'onTabKey($event, false)',
    '(keydown.shift.tab)': 'onTabKey($event, true)',
  },
})
export class BookingInviteDialogComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();
  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);

  readonly booking = input.required<ArenaBookingDoc>();
  readonly openSlots = input.required<number>();
  /** Convidados com convite ainda sem resposta (lista ao vivo do detalhe). */
  readonly pendingUids = input<readonly string[]>([]);
  /** Nome de quem acabou de ser convidado — o detalhe mostra o aviso. */
  readonly invited = output<string>();
  readonly dismissed = output<void>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private searchDebounce: ReturnType<typeof setTimeout> | undefined;
  private searchSeq = 0;

  protected readonly query = signal('');
  protected readonly searchedTerm = signal('');
  protected readonly searching = signal(false);
  protected readonly results = signal<AthletePublicProfile[]>([]);
  protected readonly searchError = signal<string | null>(null);
  protected readonly sending = signal<ReadonlySet<string>>(new Set());
  protected readonly sentNow = signal<ReadonlySet<string>>(new Set());
  protected readonly error = signal<string | null>(null);

  protected readonly linkInviteId = signal<string | null>(null);
  protected readonly linkLoading = signal(false);
  protected readonly linkCopied = signal(false);

  protected readonly initialsOf = initialsOf;

  protected readonly slotsLabel = computed(() => {
    const open = this.openSlots();
    return open === 1 ? '1 vaga aberta' : `${open} vagas abertas`;
  });

  private readonly playingUids = computed(() => {
    const b = this.booking();
    return new Set([...(b.ownerAthleteId ? [b.ownerAthleteId] : []), ...b.participantUids]);
  });

  protected readonly linkUrl = computed(() => {
    const id = this.linkInviteId();
    return id ? bookingInviteUrl(id) : null;
  });

  protected readonly shareMessage = computed(() => {
    const id = this.linkInviteId();
    const b = this.booking();
    if (!id) return null;
    return bookingInviteShareMessage({
      arenaName: b.arenaName,
      date: b.dateKey,
      startTime: b.startTime,
      inviteId: id,
      openSlots: this.openSlots(),
    });
  });

  protected readonly whatsappUrl = computed(() => {
    const message = this.shareMessage();
    return message ? `https://wa.me/?text=${encodeURIComponent(message)}` : null;
  });

  protected readonly searchHint = computed(() => {
    const term = this.query().trim();
    if (term.length > 0 && term.length < MIN_SEARCH_CHARS) return 'Digite pelo menos 2 letras do nome ou do apelido.';
    if (this.searchError()) return this.searchError();
    const searched = this.searchedTerm();
    if (searched && !this.searching() && this.results().length === 0) return `Nenhum atleta encontrado com "${searched}".`;
    return null;
  });

  constructor() {
    afterNextRender(() => this.searchInput()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.searchDebounce);
      this.triggerElement?.focus();
    });
  }

  protected rowState(profile: AthletePublicProfile): InviteRowState {
    if (this.playingUids().has(profile.id)) return 'playing';
    if (this.sending().has(profile.id)) return 'sending';
    if (this.sentNow().has(profile.id) || this.pendingUids().includes(profile.id)) return 'invited';
    return 'idle';
  }

  protected rowSubtitle(profile: AthletePublicProfile): string {
    const place = [profile.city, profile.state].filter(Boolean).join(' · ');
    return [profile.handle ? `@${profile.handle}` : null, place || null].filter(Boolean).join(' · ');
  }

  protected onQueryInput(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchDebounce);
    const term = value.trim();
    this.searchError.set(null);
    if (term.length < MIN_SEARCH_CHARS) {
      this.searchSeq++;
      this.results.set([]);
      this.searchedTerm.set('');
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchDebounce = setTimeout(() => void this.runSearch(term), 300);
  }

  private async runSearch(term: string): Promise<void> {
    const seq = ++this.searchSeq;
    const db = this.firestore;
    try {
      const found = db ? await searchAthleteDirectory(db, term) : [];
      if (seq !== this.searchSeq) return;
      const self = this.auth.user()?.uid;
      this.results.set(found.filter((p) => p.id !== self));
      this.searchedTerm.set(term);
    } catch {
      if (seq !== this.searchSeq) return;
      this.results.set([]);
      this.searchError.set('Não foi possível buscar agora. Tente novamente.');
    } finally {
      if (seq === this.searchSeq) this.searching.set(false);
    }
  }

  protected async invite(profile: AthletePublicProfile): Promise<void> {
    if (this.rowState(profile) !== 'idle') return;
    this.sending.update((s) => new Set(s).add(profile.id));
    this.error.set(null);
    try {
      await inviteArenaBookingPlayers(athleteFunctions(), {
        bookingId: this.booking().id,
        inviteeUids: [profile.id],
      });
      this.sentNow.update((s) => new Set(s).add(profile.id));
      this.invited.emit(profile.displayName);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar o convite.');
    } finally {
      this.sending.update((s) => {
        const next = new Set(s);
        next.delete(profile.id);
        return next;
      });
    }
  }

  /** Cria/reabre o link e tenta a folha nativa. Depois do `await` o navegador pode recusar o
   *  `share` (gesto expirado no Safari); por isso o link fica sempre visível, com copiar e
   *  WhatsApp — que funcionam no clique seguinte. */
  protected async shareLink(): Promise<void> {
    if (this.linkLoading()) return;
    this.linkLoading.set(true);
    this.error.set(null);
    try {
      const inviteId = this.linkInviteId() ?? (await getArenaBookingInviteLink(athleteFunctions(), this.booking().id));
      this.linkInviteId.set(inviteId);
      const text = this.shareMessage();
      if (text && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ text }).catch(() => undefined);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível gerar o link agora.');
    } finally {
      this.linkLoading.set(false);
    }
  }

  protected async copyLink(): Promise<void> {
    const text = this.shareMessage();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.linkCopied.set(true);
    } catch {
      this.error.set('Não deu para copiar. Selecione o link e copie manualmente.');
    }
  }

  protected dismiss(): void {
    this.dismissed.emit();
  }

  /** Tab preso no diálogo — mesmo padrão do `ArenaReviewDialogComponent`. */
  protected onTabKey(event: Event, backward: boolean): void {
    const root = this.hostElement.nativeElement;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>('button, input, a[href]')).filter(
      (el) => !el.hasAttribute('disabled'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (backward && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!backward && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
