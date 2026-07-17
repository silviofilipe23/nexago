import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { athleteFunctions } from '../../data/functions';
import { searchAthleteDirectory, type AthletePublicProfile } from '../../data/public-profiles-repository';
import {
  fetchMyRegistrationForCategory,
  registerSolo,
  sendPartnerInvite,
  TournamentRegistrationError,
  type AthleteTournamentRegistration,
} from '../../data/tournament-registrations-repository';
import { fetchTournament, type TournamentCategoryOffer, type TournamentSummary } from '../../data/tournaments-repository';

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function genderLabelOf(cat: TournamentCategoryOffer['genderType']): string {
  return cat === 'F' ? 'Feminino' : cat === 'Mix' ? 'Misto' : 'Masculino';
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Inscrição real: **solo primeiro** (`registerSoloTournament`), depois convite de parceiro
 *  (`sendTournamentPartnerInvite` — o parceiro aceita pelo convite, é aí que o doc `teams` é
 *  criado). Isso é bem diferente do fluxo antigo do mock ("escolher entre duplas fixas") — não
 *  existe "duo pré-existente" pra escolher, times só nascem de um convite aceito. Pagamento
 *  fica pra próxima tela (`tournament-payment`). */
@Component({
  selector: 'app-tournament-registration-shell',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './tournament-registration-shell.component.html',
  styleUrl: './tournament-registration-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentRegistrationShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;
  private searchDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly tournamentId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  protected readonly loading = signal(true);
  protected readonly listing = signal<TournamentSummary | null>(null);
  protected readonly categories = computed<TournamentCategoryOffer[]>(() => this.listing()?.categories ?? []);

  protected readonly selectedCategoryId = signal<string | null>(this.route.snapshot.queryParamMap.get('categoria'));
  protected readonly selectedCategory = computed<TournamentCategoryOffer | null>(() => {
    const cats = this.categories();
    if (cats.length === 0) return null;
    const id = this.selectedCategoryId();
    return cats.find((c) => c.id === id) ?? cats[0] ?? null;
  });
  protected readonly otherCategories = computed(() => {
    const current = this.selectedCategory();
    return this.categories().filter((c) => c.id !== current?.id);
  });
  protected readonly showCategoryPicker = signal(false);

  protected readonly registration = signal<AthleteTournamentRegistration | null>(null);
  protected readonly registering = signal(false);

  protected readonly partnerQuery = signal('');
  protected readonly partnerResults = signal<AthletePublicProfile[]>([]);
  protected readonly searchingPartner = signal(false);
  protected readonly invitingId = signal<string | null>(null);

  protected readonly notice = signal<string | null>(null);
  protected readonly genderLabel = genderLabelOf;
  protected readonly priceLabel = (c: TournamentCategoryOffer) => formatBRL(c.entryFee);
  protected readonly initialsOf = initialsOf;

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.noticeTimeout);
      clearTimeout(this.searchDebounceHandle);
    });

    effect(() => {
      const id = this.tournamentId();
      void this.loadTournament(id);
    });

    effect(() => {
      const category = this.selectedCategory();
      void this.loadRegistration(category);
    });
  }

  private async loadTournament(id: string): Promise<void> {
    const db = this.firestore;
    if (!db || !id) {
      this.listing.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      this.listing.set(await fetchTournament(db, id));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRegistration(category: TournamentCategoryOffer | null): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    const uid = this.auth.user()?.uid;
    const tournamentId = this.tournamentId();
    if (!db || !projectId || !uid || !category || !tournamentId) {
      this.registration.set(null);
      return;
    }
    this.registration.set(await fetchMyRegistrationForCategory(db, projectId, uid, tournamentId, category.id));
  }

  protected selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
    this.showCategoryPicker.set(false);
  }

  protected toggleCategoryPicker(): void {
    this.showCategoryPicker.update((v) => !v);
  }

  protected async registerSoloForCategory(): Promise<void> {
    const category = this.selectedCategory();
    const tournamentId = this.tournamentId();
    if (!category || !tournamentId || this.registering()) return;
    this.registering.set(true);
    try {
      const result = await registerSolo(athleteFunctions(), tournamentId, category.id);
      this.registration.set({ id: result.registrationId, tournamentId, categoryId: category.id, teamId: null, partnerPending: true, isPaid: false, waitlist: false });
      this.showNotice('Inscrição criada! Agora convide seu parceiro.');
    } catch (err) {
      this.showNotice(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível concluir a inscrição.');
    } finally {
      this.registering.set(false);
    }
  }

  protected onPartnerQueryInput(value: string): void {
    this.partnerQuery.set(value);
    clearTimeout(this.searchDebounceHandle);
    this.searchDebounceHandle = setTimeout(() => void this.searchPartners(value), 300);
  }

  private async searchPartners(term: string): Promise<void> {
    const db = this.firestore;
    if (!db || term.trim().length < 2) {
      this.partnerResults.set([]);
      return;
    }
    this.searchingPartner.set(true);
    try {
      const uid = this.auth.user()?.uid;
      const results = await searchAthleteDirectory(db, term);
      this.partnerResults.set(results.filter((p) => p.id !== uid));
    } finally {
      this.searchingPartner.set(false);
    }
  }

  protected async invitePartner(candidate: AthletePublicProfile): Promise<void> {
    const category = this.selectedCategory();
    const tournamentId = this.tournamentId();
    if (!category || !tournamentId || this.invitingId()) return;
    this.invitingId.set(candidate.id);
    try {
      await sendPartnerInvite(athleteFunctions(), {
        tournamentId,
        categoryId: category.id,
        inviteeUid: candidate.id,
        inviteeName: candidate.displayName,
        inviterName: this.accountLabel(),
      });
      this.showNotice(`Convite enviado para ${candidate.displayName}.`);
      this.partnerResults.set([]);
      this.partnerQuery.set('');
    } catch (err) {
      // 409 / already-exists = convite ainda válido — trata como ok (já foi enviado).
      if (err instanceof TournamentRegistrationError && err.isPendingInviteConflict) {
        this.showNotice(`Convite já enviado para ${candidate.displayName}.`);
        this.partnerResults.set([]);
        this.partnerQuery.set('');
      } else {
        this.showNotice(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível enviar o convite.');
      }
    } finally {
      this.invitingId.set(null);
    }
  }

  protected goToPayment(): void {
    const reg = this.registration();
    const category = this.selectedCategory();
    if (!reg || !category) return;
    void this.router.navigate(['/torneios', this.tournamentId(), 'inscricao', 'pagamento'], {
      queryParams: { registro: reg.id, categoria: category.id },
    });
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}
