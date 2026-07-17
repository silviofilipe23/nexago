import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { athleteFunctions } from '../../data/functions';
import { fetchMyAthleteProfile, type MyAthleteProfile } from '../../data/my-athlete-profile-repository';
import { searchAthleteDirectory, type AthletePublicProfile } from '../../data/public-profiles-repository';
import {
  fetchMyRegistrations,
  registerSolo,
  sendPartnerInvite,
  setRegistrationUniform,
  TournamentRegistrationError,
  type AthleteTournamentRegistration,
  type UniformInput,
} from '../../data/tournament-registrations-repository';
import { fetchCategoryEnrolledCounts, fetchTournament, type TournamentCategoryOffer, type TournamentSummary } from '../../data/tournaments-repository';
import { evaluateCategoryEligibility } from '../tournament-eligibility';
import {
  categoryRequiresUniform,
  defaultJerseyNameForAthlete,
  defaultUniformSelectionForCategory,
  isUniformSelectionComplete,
  toUniformInput,
  validateUniformSelection,
  type UniformSelection,
} from '../tournament-uniform';
import { UniformFormComponent } from './uniform-form.component';

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

interface CategoryStatus {
  badge: string | null;
  blocked: boolean;
  message: string | null;
}

/** Inscrição real: **solo primeiro** (`registerSoloTournament`), depois convite de parceiro
 *  (`sendTournamentPartnerInvite` — o parceiro aceita pelo convite, é aí que o doc `teams` é
 *  criado). Isso é bem diferente do fluxo antigo do mock ("escolher entre duplas fixas") — não
 *  existe "duo pré-existente" pra escolher, times só nascem de um convite aceito. Pagamento
 *  fica pra próxima tela (`tournament-payment`).
 *
 *  Uniforme (paridade com o app): categoria que exige uniforme ganha um cartão próprio; a vaga
 *  solo é criada SEM uniforme (`uniform: null`, como o app) e a seleção é persistida logo em
 *  seguida via `setRegistrationUniform`. O convite só sai com o uniforme do titular válido
 *  (`inviterUniform` no payload). Elegibilidade (nível/gênero/idade/vagas) é pré-validação de
 *  UI — o backend continua autoritativo. */
@Component({
  selector: 'app-tournament-registration-shell',
  imports: [RouterLink, AtPanelShellComponent, UniformFormComponent],
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

  protected readonly profile = signal<MyAthleteProfile | null>(null);
  protected readonly myRegistrations = signal<AthleteTournamentRegistration[]>([]);
  protected readonly enrolledCounts = signal<Map<string, number>>(new Map());

  /** Inscrição na categoria selecionada — deriva da lista (que ganha a recém-criada). */
  protected readonly registration = computed<AthleteTournamentRegistration | null>(() => {
    const category = this.selectedCategory();
    if (!category) return null;
    return this.myRegistrations().find((r) => r.categoryId === category.id) ?? null;
  });
  protected readonly registering = signal(false);

  protected readonly uniform = signal<UniformSelection | null>(null);
  protected readonly savingUniform = signal(false);
  protected readonly uniformSaved = signal(false);
  private uniformCategoryId: string | null = null;

  protected readonly uniformRequired = computed(() => {
    const category = this.selectedCategory();
    return category != null && categoryRequiresUniform(category);
  });
  protected readonly registrationStepNum = computed(() => (this.uniformRequired() ? 3 : 2));
  protected readonly uniformComplete = computed(() => {
    const category = this.selectedCategory();
    const selection = this.uniform();
    return category != null && selection != null && isUniformSelectionComplete(category, selection);
  });

  protected readonly registeredCategoryIds = computed(() => new Set(this.myRegistrations().map((r) => r.categoryId)));
  protected readonly selectedStatus = computed<CategoryStatus | null>(() => {
    const category = this.selectedCategory();
    return category ? this.categoryStatusOf(category) : null;
  });
  protected readonly pickerOptions = computed(() => this.otherCategories().map((offer) => ({ offer, status: this.categoryStatusOf(offer) })));

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
      const id = this.tournamentId();
      const uid = this.auth.user()?.uid;
      void this.loadMyRegistrations(id, uid);
    });

    effect(() => {
      const uid = this.auth.user()?.uid;
      if (uid) void this.loadProfile(uid);
    });

    // Defaults do uniforme ao trocar de categoria; quando o perfil chega depois do default,
    // só preenche o nome na camisa se o campo continua vazio (paridade com o app).
    effect(() => {
      const category = this.selectedCategory();
      const profile = this.profile();
      if (!category || !categoryRequiresUniform(category)) {
        this.uniformCategoryId = null;
        this.uniform.set(null);
        this.uniformSaved.set(false);
        return;
      }
      const fullName = profile?.fullName ?? this.accountLabel();
      const nickname = profile?.nickname ?? null;
      if (this.uniformCategoryId !== category.id) {
        this.uniformCategoryId = category.id;
        this.uniformSaved.set(false);
        this.uniform.set(defaultUniformSelectionForCategory(category, fullName, nickname));
        return;
      }
      const current = untracked(this.uniform);
      if (current && category.uniformNameOnShirt && !current.jerseyName?.trim()) {
        const name = defaultJerseyNameForAthlete(fullName, nickname);
        if (name) this.uniform.set({ ...current, jerseyName: name });
      }
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
      const projectId = environment.firebase.projectId;
      if (projectId) {
        try {
          this.enrolledCounts.set(await fetchCategoryEnrolledCounts(db, projectId, id));
        } catch {
          // Contagem fresca é opcional — o `spotsLeft` do doc segue de fallback.
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadMyRegistrations(tournamentId: string, uid: string | undefined): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId || !uid || !tournamentId) {
      this.myRegistrations.set([]);
      return;
    }
    try {
      const all = await fetchMyRegistrations(db, projectId, uid);
      this.myRegistrations.set(all.filter((r) => r.tournamentId === tournamentId));
    } catch {
      this.myRegistrations.set([]);
    }
  }

  private async loadProfile(uid: string): Promise<void> {
    const db = this.firestore;
    if (!db) return;
    try {
      this.profile.set(await fetchMyAthleteProfile(db, uid));
    } catch {
      // Sem perfil, a elegibilidade fica permissiva — o backend segue autoritativo.
    }
  }

  /** Estado da categoria pro seletor/CTA: já inscrito > encerrada > lotada > elegibilidade. */
  protected categoryStatusOf(category: TournamentCategoryOffer): CategoryStatus {
    if (this.registeredCategoryIds().has(category.id)) {
      return { badge: 'JÁ INSCRITO', blocked: false, message: null };
    }
    if (category.registrationClosed || category.isCompleted) {
      return { badge: 'ENCERRADA', blocked: true, message: 'As inscrições desta categoria estão encerradas.' };
    }
    if (this.spotsLeftOf(category) <= 0) {
      return { badge: 'LOTADO', blocked: true, message: 'Esta categoria está lotada.' };
    }
    const t = this.listing();
    const eligibility = evaluateCategoryEligibility(category, this.profile(), {
      tournamentSport: t?.sport ?? null,
      tournamentStart: t?.startAt ?? null,
    });
    return { badge: eligibility.badge, blocked: eligibility.status !== 'eligible', message: eligibility.message };
  }

  private spotsLeftOf(category: TournamentCategoryOffer): number {
    if (category.maxTeams <= 0) return Number.POSITIVE_INFINITY;
    const enrolled = this.enrolledCounts().get(category.id);
    if (enrolled != null) return category.maxTeams - enrolled;
    return category.spotsLeft;
  }

  protected selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
    this.showCategoryPicker.set(false);
  }

  protected toggleCategoryPicker(): void {
    this.showCategoryPicker.update((v) => !v);
  }

  protected onUniformChange(next: UniformSelection): void {
    this.uniform.set(next);
    this.uniformSaved.set(false);
  }

  protected async saveUniform(): Promise<void> {
    const category = this.selectedCategory();
    const reg = this.registration();
    const selection = this.uniform();
    if (!category || !reg || !selection || this.savingUniform()) return;
    const error = validateUniformSelection(category, selection);
    if (error) {
      this.showNotice(error);
      return;
    }
    this.savingUniform.set(true);
    try {
      await setRegistrationUniform(athleteFunctions(), reg.id, toUniformInput(selection));
      this.uniformSaved.set(true);
      this.showNotice('Uniforme salvo!');
    } catch (err) {
      this.showNotice(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível salvar o uniforme.');
    } finally {
      this.savingUniform.set(false);
    }
  }

  protected async registerSoloForCategory(): Promise<void> {
    const category = this.selectedCategory();
    const tournamentId = this.tournamentId();
    if (!category || !tournamentId || this.registering()) return;
    const status = this.categoryStatusOf(category);
    if (status.blocked) {
      this.showNotice(status.message ?? 'Esta categoria não está disponível para você.');
      return;
    }
    this.registering.set(true);
    try {
      const result = await registerSolo(athleteFunctions(), tournamentId, category.id);
      this.myRegistrations.update((list) => [
        ...list,
        { id: result.registrationId, tournamentId, categoryId: category.id, teamId: null, partnerPending: true, isPaid: false, waitlist: false, sharePaidUids: [] },
      ]);
      this.showNotice('Inscrição criada! Agora convide seu parceiro.');
      await this.persistUniformAfterRegistration(category, result.registrationId);
    } catch (err) {
      this.showNotice(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível concluir a inscrição.');
    } finally {
      this.registering.set(false);
    }
  }

  /** Mesmo par de chamadas do app (solo com `uniform: null` + `setRegistrationUniform`), sem
   *  clique extra quando a seleção já está completa. Falha aqui não desfaz a vaga — o cartão
   *  de uniforme continua oferecendo "Salvar uniforme". */
  private async persistUniformAfterRegistration(category: TournamentCategoryOffer, registrationId: string): Promise<void> {
    const selection = this.uniform();
    if (!categoryRequiresUniform(category) || !selection || !isUniformSelectionComplete(category, selection)) return;
    try {
      await setRegistrationUniform(athleteFunctions(), registrationId, toUniformInput(selection));
      this.uniformSaved.set(true);
    } catch {
      // Sem notice: a vaga já foi criada; o atleta salva pelo botão do cartão.
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

    // Paridade com o app: o convite só sai com o uniforme do titular completo — ele viaja
    // junto (`inviterUniform`) pro convidado ver a dupla montada.
    let inviterUniform: UniformInput | undefined;
    if (categoryRequiresUniform(category)) {
      const selection = this.uniform();
      const error = selection ? validateUniformSelection(category, selection) : 'Complete a escolha do uniforme antes de convidar.';
      if (error) {
        this.showNotice(error);
        this.scrollToUniformCard();
        return;
      }
      inviterUniform = toUniformInput(selection!);
    }

    this.invitingId.set(candidate.id);
    try {
      await sendPartnerInvite(athleteFunctions(), {
        tournamentId,
        categoryId: category.id,
        inviteeUid: candidate.id,
        inviteeName: candidate.displayName,
        inviterName: this.accountLabel(),
        ...(inviterUniform ? { inviterUniform } : {}),
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

  private scrollToUniformCard(): void {
    document.getElementById('rg-uniform-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}
