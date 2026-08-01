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
  acceptPartnerInvite,
  cancelSentPartnerInvite,
  declinePartnerInvite,
  EMPTY_UNIFORM_SLOT,
  fetchMyPendingPartnerInvites,
  fetchMyRegistrations,
  fetchMySentPendingInvites,
  registerSolo,
  sendPartnerInvite,
  setRegistrationUniform,
  TournamentRegistrationError,
  type AthleteTournamentRegistration,
  type SentPartnerInvite,
  type TournamentPartnerInvite,
  type UniformInput,
} from '../../data/tournament-registrations-repository';
import { fetchCategoryEnrolledCounts, fetchTournament, type TournamentCategoryOffer, type TournamentSummary } from '../../data/tournaments-repository';
import { evaluateCategoryEligibility, normalizeAthleteGender } from '../tournament-eligibility';
import {
  categoryRequiresUniform,
  defaultJerseyNameForAthlete,
  defaultUniformSelectionForCategory,
  isUniformSelectionComplete,
  toUniformInput,
  validateUniformSelection,
  type UniformSelection,
} from '../tournament-uniform';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { NxInlineMessageComponent, NxToastService } from '../../shared/feedback';
import {
  readPartnerLinkInviteMarker,
  savePartnerLinkInviteMarker,
  type PartnerLinkInviteMarker,
} from '../../shared/partner-invite/partner-invite';
import { InvitePartnerDialogComponent } from './invite-partner-dialog.component';
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
  imports: [
    RouterLink,
    AtPanelShellComponent,
    UniformFormComponent,
    NxPageLoadingComponent,
    NxSpinnerComponent,
    InvitePartnerDialogComponent,
    NxInlineMessageComponent,
  ],
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
  private readonly toasts = inject(NxToastService);
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
  protected readonly sentPendingInvites = signal<SentPartnerInvite[]>([]);
  protected readonly cancelingInviteId = signal<string | null>(null);

  // ── Convite externo (parceiro ainda sem conta) ──────────────────────────
  protected readonly showInviteDialog = signal(false);
  /** Último termo efetivamente buscado — evita mostrar "não achei" antes do debounce. */
  private readonly lastSearchedTerm = signal('');
  /** Busca concluída sem resultado → oferta de convite vira o caminho principal. */
  protected readonly partnerSearchCameUpEmpty = computed(() => {
    const term = this.partnerQuery().trim();
    return (
      term.length >= 2 &&
      !this.searchingPartner() &&
      this.lastSearchedTerm() === term &&
      this.partnerResults().length === 0
    );
  });
  /** Marcador local "convite por link enviado" da categoria selecionada. */
  protected readonly linkInviteMarker = signal<PartnerLinkInviteMarker | null>(null);
  protected readonly referralCode = computed(() => this.auth.user()?.uid ?? '');

  /** Convite QUE EU RECEBI pra essa categoria — aceitar/recusar direto aqui, sem depender
   *  de o atleta achar a Agenda (é onde a aceitação sempre viveu até então). */
  protected readonly receivedInvite = signal<TournamentPartnerInvite | null>(null);
  protected readonly acceptingInvite = signal(false);
  protected readonly decliningInvite = signal(false);

  /** Uniforme incompleto trava convite, aceite e salvamento. É erro de
   *  formulário, então mora dentro do card do uniforme — junto do que precisa
   *  ser corrigido — em vez de virar um toast que some antes do conserto. */
  protected readonly uniformError = signal<string | null>(null);

  protected readonly genderLabel = genderLabelOf;
  protected readonly priceLabel = (c: TournamentCategoryOffer) => formatBRL(c.entryFee);
  protected readonly initialsOf = initialsOf;

  constructor() {
    this.destroyRef.onDestroy(() => {
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

    // Convite que ALGUÉM me enviou pra essa categoria — mostrado direto na tela, em vez de
    // só na Agenda.
    effect(() => {
      const uid = this.auth.user()?.uid;
      const tournamentId = this.tournamentId();
      const category = this.selectedCategory();
      if (!uid || !tournamentId || !category) {
        this.receivedInvite.set(null);
        return;
      }
      void this.loadReceivedInvite(uid, tournamentId, category.id);
    });

    effect(() => {
      const uid = this.auth.user()?.uid;
      if (uid) void this.loadProfile(uid);
    });

    // Convites que eu enviei e ainda tão pendentes — mostra "aguardando resposta" em vez de
    // deixar a busca vazia (recarregar a página não deve esconder que já convidei alguém).
    // Pode ter mais de um: o atleta pode convidar várias pessoas, o primeiro aceite cancela
    // os demais (markStaleInvitesAfterAccept no backend).
    effect(() => {
      const reg = this.registration();
      const uid = this.auth.user()?.uid;
      const tournamentId = this.tournamentId();
      if (!reg?.partnerPending || !uid || !tournamentId) {
        this.sentPendingInvites.set([]);
        return;
      }
      void this.loadSentPendingInvites(uid, tournamentId, reg.categoryId);
    });

    // Marcador local "convite por link enviado" acompanha a categoria selecionada.
    effect(() => {
      const tournamentId = this.tournamentId();
      const category = this.selectedCategory();
      this.linkInviteMarker.set(
        tournamentId && category ? readPartnerLinkInviteMarker(tournamentId, category.id) : null,
      );
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

  private async loadReceivedInvite(uid: string, tournamentId: string, categoryId: string): Promise<void> {
    const db = this.firestore;
    if (!db) return;
    try {
      const invites = await fetchMyPendingPartnerInvites(db, uid);
      this.receivedInvite.set(invites.find((i) => i.tournamentId === tournamentId && i.categoryId === categoryId) ?? null);
    } catch {
      this.receivedInvite.set(null);
    }
  }

  private async loadSentPendingInvites(uid: string, tournamentId: string, categoryId: string): Promise<void> {
    const db = this.firestore;
    if (!db) return;
    try {
      this.sentPendingInvites.set(await fetchMySentPendingInvites(db, uid, tournamentId, categoryId));
    } catch {
      this.sentPendingInvites.set([]);
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
      this.uniformError.set(error);
      return;
    }
    this.uniformError.set(null);
    this.savingUniform.set(true);
    try {
      await setRegistrationUniform(athleteFunctions(), reg.id, toUniformInput(selection));
      this.uniformSaved.set(true);
      this.toasts.success('Uniforme salvo', 'Sua escolha já está registrada na inscrição.');
    } catch (err) {
      this.toasts.error(
        'Não foi possível salvar o uniforme',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu. Sua escolha continua aqui.',
        { label: 'Tentar novamente', run: () => void this.saveUniform() },
      );
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
      this.toasts.warning(
        'Categoria indisponível',
        status.message ?? 'Você não pode se inscrever nesta categoria. Escolha outra na lista.',
      );
      return;
    }
    this.registering.set(true);
    try {
      const result = await registerSolo(athleteFunctions(), tournamentId, category.id);
      this.myRegistrations.update((list) => [
        ...list,
        {
          id: result.registrationId,
          tournamentId,
          categoryId: category.id,
          teamId: null,
          partnerPending: true,
          isPaid: false,
          waitlist: false,
          sharePaidUids: [],
          player1Id: this.auth.user()?.uid ?? null,
          participantUids: [this.auth.user()?.uid ?? ''].filter(Boolean),
          uniformPlayer1: EMPTY_UNIFORM_SLOT,
          uniformPlayer2: EMPTY_UNIFORM_SLOT,
        },
      ]);
      this.toasts.success('Inscrição criada', 'Falta só formar a dupla — convide seu parceiro para garantir a vaga.');
      await this.persistUniformAfterRegistration(category, result.registrationId);
    } catch (err) {
      this.toasts.error(
        'Não foi possível concluir a inscrição',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu e nenhuma vaga foi criada.',
        { label: 'Tentar novamente', run: () => void this.registerSoloForCategory() },
      );
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
      this.lastSearchedTerm.set('');
      return;
    }
    this.searchingPartner.set(true);
    try {
      const uid = this.auth.user()?.uid;
      const alreadyInvited = new Set(this.sentPendingInvites().map((i) => i.inviteeUid));
      // Categoria Masculino/Feminino só aceita parceiro do mesmo gênero (Misto não filtra).
      const categoryGender = this.selectedCategory()?.genderType ?? null;
      const results = await searchAthleteDirectory(db, term);
      this.partnerResults.set(
        results.filter(
          (p) =>
            p.id !== uid &&
            !alreadyInvited.has(p.id) &&
            (categoryGender == null || categoryGender === 'Mix' || normalizeAthleteGender(p.gender) === categoryGender),
        ),
      );
      this.lastSearchedTerm.set(term.trim());
    } finally {
      this.searchingPartner.set(false);
    }
  }

  protected openInviteDialog(): void {
    this.showInviteDialog.set(true);
  }

  protected closeInviteDialog(): void {
    this.showInviteDialog.set(false);
  }

  /** Convite por link saiu (WhatsApp/cópia) — lembra localmente pra orientar o retorno. */
  protected onExternalInviteShared(partnerName: string | null): void {
    const tournamentId = this.tournamentId();
    const category = this.selectedCategory();
    if (!tournamentId || !category) return;
    savePartnerLinkInviteMarker(tournamentId, category.id, partnerName);
    this.linkInviteMarker.set(readPartnerLinkInviteMarker(tournamentId, category.id));
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
        this.uniformError.set(error);
        this.scrollToUniformCard();
        return;
      }
      this.uniformError.set(null);
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
      this.toasts.success('Convite enviado', `${candidate.displayName} precisa aceitar para a dupla ficar de pé.`);
      this.partnerResults.set([]);
      this.partnerQuery.set('');
      await this.loadSentPendingInvites(this.auth.user()!.uid, tournamentId, category.id);
    } catch (err) {
      // 409 / already-exists = convite ainda válido — trata como ok (já foi enviado).
      if (err instanceof TournamentRegistrationError && err.isPendingInviteConflict) {
        this.toasts.info('Convite já enviado', `${candidate.displayName} ainda não respondeu. Aguarde ou convide outra pessoa.`);
        this.partnerResults.set([]);
        this.partnerQuery.set('');
        await this.loadSentPendingInvites(this.auth.user()!.uid, tournamentId, category.id);
      } else {
        this.toasts.error(
          'Não foi possível enviar o convite',
          err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
        );
      }
    } finally {
      this.invitingId.set(null);
    }
  }

  protected async cancelInvite(invite: SentPartnerInvite): Promise<void> {
    if (this.cancelingInviteId()) return;
    this.cancelingInviteId.set(invite.id);
    try {
      await cancelSentPartnerInvite(athleteFunctions(), invite.id);
      this.sentPendingInvites.update((list) => list.filter((i) => i.id !== invite.id));
      this.toasts.success('Convite cancelado', `${invite.inviteeName} não vai mais receber o pedido de dupla.`);
    } catch (err) {
      this.toasts.error(
        'Não foi possível cancelar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O convite continua valendo — tente de novo.',
      );
    } finally {
      this.cancelingInviteId.set(null);
    }
  }

  protected async acceptReceivedInvite(): Promise<void> {
    const invite = this.receivedInvite();
    const category = this.selectedCategory();
    if (!invite || this.acceptingInvite()) return;

    let inviteeUniform: UniformInput | undefined;
    if (category && categoryRequiresUniform(category)) {
      const selection = this.uniform();
      const error = selection ? validateUniformSelection(category, selection) : 'Complete a escolha do uniforme antes de aceitar.';
      if (error) {
        this.uniformError.set(error);
        this.scrollToUniformCard();
        return;
      }
      this.uniformError.set(null);
      inviteeUniform = toUniformInput(selection!);
    }

    this.acceptingInvite.set(true);
    try {
      await acceptPartnerInvite(athleteFunctions(), invite.id, inviteeUniform);
      this.toasts.success('Dupla formada', `Você e ${invite.inviterName} estão inscritos. Falta o pagamento para confirmar a vaga.`);
      this.receivedInvite.set(null);
      const uid = this.auth.user()?.uid;
      const tournamentId = this.tournamentId();
      if (uid && tournamentId) await this.loadMyRegistrations(tournamentId, uid);
    } catch (err) {
      this.toasts.error(
        'Não foi possível aceitar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
        { label: 'Tentar novamente', run: () => void this.acceptReceivedInvite() },
      );
    } finally {
      this.acceptingInvite.set(false);
    }
  }

  protected async declineReceivedInvite(): Promise<void> {
    const invite = this.receivedInvite();
    if (!invite || this.decliningInvite()) return;
    this.decliningInvite.set(true);
    try {
      await declinePartnerInvite(athleteFunctions(), invite.id);
      this.toasts.success('Convite recusado', `${invite.inviterName} foi avisado e pode convidar outra pessoa.`);
      this.receivedInvite.set(null);
    } catch (err) {
      this.toasts.error(
        'Não foi possível recusar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O convite continua na sua lista — tente de novo.',
      );
    } finally {
      this.decliningInvite.set(false);
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

}
