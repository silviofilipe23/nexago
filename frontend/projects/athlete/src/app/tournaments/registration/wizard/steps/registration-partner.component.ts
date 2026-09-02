import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { searchAnchorToken, searchQueryTokens } from '@nexago/search-keywords';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../../../../environments/environment';
import { athleteFunctions } from '../../../../data/functions';
import { searchAthleteDirectory, type AthletePublicProfile } from '../../../../data/public-profiles-repository';
import {
  createTeamRegistration,
  EMPTY_UNIFORM_SLOT,
  registerSolo,
  sendPartnerInvite,
  TournamentRegistrationError,
} from '../../../../data/tournament-registrations-repository';
import { NxPageLoadingComponent } from '../../../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../../../shared/loading/nx-spinner.component';
import { NxToastService } from '../../../../shared/feedback';
import {
  formatMissingStepsList,
  readPartnerLinkInviteMarker,
  savePartnerLinkInviteMarker,
  type PartnerLinkInviteMarker,
} from '../../../../shared/partner-invite/partner-invite';
import { partnerMatchesRequiredGender } from '../../../tournament-eligibility';
import { categoryRequiresUniform } from '../../../tournament-uniform';
import { InvitePartnerDialogComponent } from '../../invite-partner-dialog.component';
import { RegistrationWizardShellComponent } from '../registration-wizard-shell.component';
import { RegistrationWizardStore, type RosterMember } from '../registration-wizard.store';
import { bindWizardParams, wizardQueryParams } from '../wizard-params';

/** Mínimo de letras para a busca de parceiro LISTAR alguém.
 *
 *  É regra LOCAL desta tela, e de propósito maior que `DEFAULT_MIN_PREFIX` (2) do
 *  `@nexago/search-keywords`: a constante global vale para arena, ligas, equipes e torneios, e
 *  é o mesmo número que o GERADOR de `keywords` usa para montar os prefixos gravados nos
 *  perfis. Subi-la quebraria o índice, cujo backfill em `users` nunca rodou.
 *
 *  Se você chegou aqui achando a diferença entre 2 e 3 uma inconsistência: não é. É deliberada. */
const PARTNER_SEARCH_MIN_LETTERS = 3;

/** A busca traz mais do que a tela mostra de propósito: o filtro de gênero da categoria roda no
 *  cliente, DEPOIS da busca. Pedir mais para exibir 10 é o que impede a lista murchar para
 *  quatro ou cinco numa categoria de gênero fixo. */
const PARTNER_RESULTS_SHOWN = 10;

const SEARCH_DEBOUNCE_MS = 350;

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function firstNameOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'seu parceiro';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

/** Passo 4 do wizard: parceiro (dupla) ou elenco (equipe trio+).
 *
 *  Três variantes:
 *  - **Dupla**: busca e convite. `sendPartnerInvite` aqui quase sempre nasce "no vácuo": sem
 *    reserva prévia, o backend só CRIA a inscrição quando o convidado aceita. Por isso o
 *    sucesso sem `registro` conhecido volta ao PORTEIRO, que resolve sozinho o que mostrar
 *    quando a inscrição nascer, em vez de inventar um id.
 *  - **Equipe sem inscrição**: campo de nome + `createTeamRegistration` — só ela cria a equipe
 *    NOMEADA que os convites exigem para existir. `sendPartnerInvite` convida para uma equipe
 *    que já existe, não cria uma.
 *  - **Equipe com inscrição**: elenco atual + busca, só para o capitão (o servidor recusa
 *    qualquer outro integrante). O convite anexa à inscrição do capitão.
 *
 *  Em QUALQUER variante o aceite LGPD chegou pela URL (`?lgpd=1`, desde as condições) e é
 *  carimbado na callable que esta tela dispara — não há checkbox aqui.
 *
 *  **Custo de abrir a tela: zero leitura.** Não há listagem de navegação abaixo do mínimo nem
 *  seção "suas últimas duplas" — esta última varria a coleção `inscriptions` inteira. */
@Component({
  selector: 'app-registration-partner',
  imports: [
    RouterLink,
    RegistrationWizardShellComponent,
    NxPageLoadingComponent,
    NxSpinnerComponent,
    InvitePartnerDialogComponent,
  ],
  templateUrl: './registration-partner.component.html',
  styleUrls: ['../wizard-step.scss', './registration-partner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationPartnerComponent {
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  protected readonly store = inject(RegistrationWizardStore);
  protected readonly params = bindWizardParams(this.store);

  private searchHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly submitting = signal(false);
  protected readonly query = signal('');
  protected readonly results = signal<AthletePublicProfile[]>([]);
  protected readonly searching = signal(false);
  protected readonly selected = signal<AthletePublicProfile | null>(null);
  protected readonly teamName = signal('');
  protected readonly showInviteDialog = signal(false);
  protected readonly linkInviteMarker = signal<PartnerLinkInviteMarker | null>(null);
  protected readonly roster = signal<RosterMember[]>([]);

  /** Último termo efetivamente buscado — evita mostrar "não achei" antes do debounce. */
  private readonly lastSearchedTerm = signal('');

  protected readonly loading = computed(() => !this.store.tournamentLoaded());
  protected readonly tournament = computed(() => this.store.tournament());
  protected readonly category = computed(() => this.store.categoryById(this.params().categoryId));

  /** A inscrição pode chegar pela rota ou pelo listener — o que vier primeiro. */
  protected readonly registration = computed(
    () =>
      this.store.registrationById(this.params().registrationId) ??
      this.store.registrationFor(this.params().categoryId),
  );

  protected readonly isTeam = computed(() => {
    const teamSize = this.category()?.teamSize ?? null;
    return teamSize != null && teamSize > 2;
  });

  protected readonly teamSize = computed(() => this.category()?.teamSize ?? 2);
  protected readonly rosterCount = computed(() => this.registration()?.participantUids.length ?? 0);

  protected readonly pendingInvites = computed(() => this.store.pendingSentInvitesFor(this.params().categoryId));

  /** Sou o capitão desta equipe?
   *
   *  Doc antigo pode não trazer `captainUid` — aí quem criou é o `player1Id`. Sem capitão
   *  identificável, manter o convite disponível deixa o servidor decidir; o contrário
   *  esconderia a ação do capitão de verdade. */
  protected readonly isCaptain = computed(() => {
    const reg = this.registration();
    const uid = this.store.myUid();
    if (!reg) return true;
    const captain = reg.captainUid ?? reg.player1Id;
    if (!captain) return true;
    return captain === uid;
  });

  /** Vagas ainda convidáveis.
   *
   *  Na DUPLA o convite pendente fecha a busca: depois de convidar, a lista some e o caminho
   *  para chamar outra pessoa é cancelar o convite. Em EQUIPE a vaga é finita de verdade:
   *  elenco + convites pendentes ocupam, senão o capitão convida gente demais. */
  protected readonly remainingInviteSlots = computed(() => {
    if (!this.isTeam()) return this.pendingInvites().length > 0 ? 0 : 1;
    return Math.max(0, this.teamSize() - this.rosterCount() - this.pendingInvites().length);
  });

  /** Sem vaga de convite: em dupla é o convite pendente que fecha a busca; em equipe é o
   *  elenco cheio. Nos dois casos a tela troca a busca por uma saída — não por um campo aberto
   *  que só entregaria erro. */
  protected readonly noInviteSlotsLeft = computed(() => this.remainingInviteSlots() <= 0);

  /** Reserva solo em aberto e ainda não paga: pagar o valor INTEGRAL garante a vaga desde já, e
   *  o parceiro que aceitar depois entra sem taxa.
   *
   *  A ação precisa existir AQUI porque o porteiro nunca honra `step=pagamento` com parceiro
   *  pendente (pagamento vem depois de parceiro na ordem) — este botão é a única porta. */
  protected readonly canGuaranteeSpot = computed(() => {
    const reg = this.registration();
    const category = this.category();
    if (!reg || !category) return false;
    return category.entryFee > 0 && reg.partnerPending && !reg.isPaid && !this.isTeam();
  });

  /** Com inscrição já criada o servidor recusa `registerSolo` por definição ("Você já possui
   *  inscrição nesta categoria."). Oferecer a reserva ali é convidar o atleta a bater num erro. */
  protected readonly allowsSolo = computed(
    () => !(this.tournament()?.requireFormedPair ?? false) && this.registration() == null && !this.isTeam(),
  );

  /** Gênero exigido do parceiro pela categoria: Dupla Masculino/Feminino só aceita o mesmo
   *  gênero (Misto não filtra). Equipe: livre e misto não filtram (a composição exata é conta do
   *  backend); só composição de gênero único filtra. */
  protected readonly requiredPartnerGender = computed<'M' | 'F' | null>(() => {
    const category = this.category();
    if (category == null) return null;
    if (category.teamSize != null) {
      const comp = category.genderComposition;
      if (comp?.women === 0) return 'M';
      if (comp?.men === 0) return 'F';
      return null;
    }
    return category.genderType !== 'Mix' ? category.genderType : null;
  });

  /** Busca concluída sem resultado → a oferta de convite por link vira o caminho principal. */
  protected readonly searchCameUpEmpty = computed(() => {
    const term = this.query().trim();
    return (
      this.termIsSearchable(term) && !this.searching() && this.lastSearchedTerm() === term && this.results().length === 0
    );
  });

  protected readonly teamNameNormalized = computed(() => this.teamName().replace(/\s+/g, ' ').trim());
  /** Mesmas regras do backend (3–30 chars) — erro só depois de começar a digitar. */
  protected readonly teamNameError = computed(() => {
    const name = this.teamNameNormalized();
    if (this.teamName().length === 0) return null;
    if (name.length < 3) return 'O nome da equipe precisa ter pelo menos 3 caracteres.';
    if (name.length > 30) return 'O nome da equipe pode ter no máximo 30 caracteres.';
    return null;
  });
  protected readonly teamNameValid = computed(() => {
    const name = this.teamNameNormalized();
    return name.length >= 3 && name.length <= 30;
  });

  protected readonly ctaLabel = computed(() => {
    if (this.isTeam() && this.registration() == null) return 'Criar equipe';
    if (this.isTeam() && !this.isCaptain()) return 'Continuar';
    const candidate = this.selected();
    if (this.isTeam()) return 'Convidar para a equipe';
    return candidate ? `Convidar ${firstNameOf(candidate.displayName)}` : 'Convidar parceiro';
  });

  protected readonly ctaEnabled = computed(() => {
    if (this.submitting()) return false;
    if (this.isTeam() && this.registration() == null) return this.teamNameValid();
    if (this.isTeam() && !this.isCaptain()) return true;
    return this.selected() != null;
  });

  protected readonly initialsOf = initialsOf;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchHandle));

    // Marcador local "convite por link enviado" acompanha a categoria da rota.
    effect(() => {
      const p = this.params();
      this.linkInviteMarker.set(
        p.tournamentId && p.categoryId ? readPartnerLinkInviteMarker(p.tournamentId, p.categoryId) : null,
      );
    });

    effect(() => {
      const reg = this.registration();
      if (!reg) {
        this.roster.set([]);
        return;
      }
      void this.store.loadRoster(reg).then((members) => this.roster.set(members));
    });
  }

  // ── busca ────────────────────────────────────────────────────────────────

  /** O mínimo conta sobre o termo NORMALIZADO: acento e pontuação não contam ("J.R" vira "jr",
   *  insuficiente). */
  private termIsSearchable(term: string): boolean {
    return searchAnchorToken(searchQueryTokens(term)).length >= PARTNER_SEARCH_MIN_LETTERS;
  }

  protected onQueryInput(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchHandle);
    this.searchHandle = setTimeout(() => void this.search(value), SEARCH_DEBOUNCE_MS);
  }

  private async search(term: string): Promise<void> {
    const db = this.firestore;
    // Abaixo do mínimo não há listagem de navegação: sem ela e sem "últimas duplas", abrir a
    // tela custa ZERO leitura.
    if (!db || !this.termIsSearchable(term)) {
      this.results.set([]);
      this.lastSearchedTerm.set('');
      return;
    }
    this.searching.set(true);
    try {
      const uid = this.store.myUid();
      const alreadyInvited = new Set(this.pendingInvites().map((i) => i.inviteeUid));
      const alreadyInRoster = new Set(this.registration()?.participantUids ?? []);
      const requiredGender = this.requiredPartnerGender();
      const found = await searchAthleteDirectory(db, term);
      this.results.set(
        found
          .filter(
            (p) =>
              p.id !== uid &&
              !alreadyInvited.has(p.id) &&
              !alreadyInRoster.has(p.id) &&
              // Atleta SEM gênero declarado continua aparecendo — regra existente: sumir em
              // silêncio deixava o convidante achando que o parceiro não existe, quando só está
              // com o cadastro incompleto. O card avisa e o servidor recusa o aceite.
              partnerMatchesRequiredGender(p.gender, requiredGender),
          )
          .slice(0, PARTNER_RESULTS_SHOWN),
      );
      this.lastSearchedTerm.set(term.trim());
    } finally {
      this.searching.set(false);
    }
  }

  protected select(candidate: AthletePublicProfile): void {
    this.selected.update((current) => (current?.id === candidate.id ? null : candidate));
  }

  /** Candidato sem gênero no perfil em categoria de gênero fixo — a linha avisa a pendência. */
  protected missingGender(p: AthletePublicProfile): boolean {
    return this.requiredPartnerGender() != null && !p.gender?.trim();
  }

  // ── navegação ────────────────────────────────────────────────────────────

  protected exit(): void {
    void this.router.navigate(['/torneios', this.params().tournamentId]);
  }

  protected goToPayment(): void {
    const reg = this.registration();
    const p = this.params();
    if (!reg) return;
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'pagamento'], {
      queryParams: wizardQueryParams({ categoryId: p.categoryId, registrationId: reg.id }),
    });
  }

  /** Sucesso de qualquer uma das três callables.
   *
   *  Com `registro` conhecido, segue para uniforme/pagamento. Sem ele (convite de dupla "no
   *  vácuo"), volta para o porteiro: não há o que configurar enquanto a inscrição não existir de
   *  verdade — e o aceite LGPD tem de ATRAVESSAR, senão a volta chegaria com
   *  `lgpdAccepted: false` e a CF gravaria a inscrição sem o consentimento. */
  private advanceAfterSuccess(registrationId: string | null): void {
    const p = this.params();
    const category = this.category();
    const regId = (registrationId ?? '').trim();
    if (!regId || !category) {
      void this.router.navigate(['/torneios', p.tournamentId, 'inscricao'], {
        queryParams: wizardQueryParams({ categoryId: p.categoryId, lgpdAccepted: p.lgpdAccepted }),
      });
      return;
    }
    const next = categoryRequiresUniform(category) ? 'uniforme' : 'pagamento';
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', next], {
      queryParams: wizardQueryParams({ categoryId: p.categoryId, registrationId: regId }),
    });
  }

  /** Cinto e suspensório do aceite LGPD.
   *
   *  As três ações desta tela CRIAM inscrição (o convite de dupla cria no aceite do convidado).
   *  A callable só carimba `lgpdAcceptedUids` quando o flag chega `true` — em silêncio, sem
   *  erro, quando chega `false`. E não há segunda chance: daí em diante o porteiro trata
   *  inscrição existente como consentida. Então, sem aceite e sem inscrição, o caminho é o passo
   *  do consentimento, não a callable. */
  private consentMissing(): boolean {
    const p = this.params();
    if (p.lgpdAccepted) return false;
    if (this.registration() != null) return false;
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'consentimento'], {
      queryParams: wizardQueryParams({ categoryId: p.categoryId }),
      replaceUrl: true,
    });
    return true;
  }

  // ── ações ────────────────────────────────────────────────────────────────

  protected primary(): void {
    if (!this.ctaEnabled()) return;
    if (this.isTeam() && this.registration() == null) {
      void this.createTeam();
      return;
    }
    if (this.isTeam() && !this.isCaptain()) {
      // Integrante comum não convida (o servidor recusa) — mas também não pode ficar preso: o
      // passo dele é seguir para uniforme/pagamento.
      this.advanceAfterSuccess(this.registration()?.id ?? null);
      return;
    }
    void this.sendInvite();
  }

  private async sendInvite(): Promise<void> {
    const candidate = this.selected();
    const category = this.category();
    const p = this.params();
    if (!candidate || !category || this.submitting()) return;
    if (this.consentMissing()) return;

    this.submitting.set(true);
    try {
      const sent = await sendPartnerInvite(athleteFunctions(), {
        tournamentId: p.tournamentId,
        categoryId: category.id,
        inviteeUid: candidate.id,
        inviteeName: candidate.displayName,
        inviterName: this.store.accountLabel(),
        ...(p.lgpdAccepted ? { lgpdAccepted: true } : {}),
      });
      // Parceiro com cadastro incompleto não consegue aceitar: sem o aviso o convite ficava
      // "aguardando resposta" até expirar sem ninguém saber por quê.
      if (sent.inviteeProfileReady === false) {
        this.toasts.warning(
          'Convite enviado — falta um passo do parceiro',
          `Avise ${candidate.displayName}: falta completar ${formatMissingStepsList(sent.inviteeMissingSteps)} no perfil para poder aceitar.`,
        );
      } else {
        this.toasts.success(
          'Convite enviado',
          this.isTeam()
            ? `${candidate.displayName} precisa aceitar para entrar na equipe.`
            : `${candidate.displayName} precisa aceitar para a dupla ficar de pé.`,
        );
      }
      this.results.set([]);
      this.query.set('');
      this.selected.set(null);
      this.goToWaiting();
    } catch (err) {
      // 409 / already-exists = convite ainda válido — trata como ok (já foi enviado).
      if (err instanceof TournamentRegistrationError && err.isPendingInviteConflict) {
        this.toasts.info('Convite já enviado', `${candidate.displayName} ainda não respondeu.`);
        this.goToWaiting();
        return;
      }
      this.toasts.error(
        'Não foi possível enviar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  /** Convidou: o lugar do atleta é a ESPERA, não a busca de novo.
   *
   *  Vale também para a equipe: o capitão que acabou de convidar alguém precisa ver o convite em
   *  voo antes de decidir o próximo. De lá ele volta para cá quando quiser convidar outro. */
  private goToWaiting(): void {
    const p = this.params();
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'aguardando'], {
      queryParams: wizardQueryParams({
        categoryId: p.categoryId,
        registrationId: this.registration()?.id ?? null,
        lgpdAccepted: p.lgpdAccepted,
      }),
    });
  }

  protected async reserveSolo(): Promise<void> {
    const category = this.category();
    const p = this.params();
    if (!category || this.submitting()) return;
    if (this.consentMissing()) return;
    this.submitting.set(true);
    try {
      const result = await registerSolo(athleteFunctions(), p.tournamentId, category.id, undefined, {
        lgpdAccepted: p.lgpdAccepted,
      });
      this.toasts.success('Vaga reservada', 'Falta formar a dupla — convide seu parceiro.');
      this.advanceAfterSuccess(result.registrationId);
    } catch (err) {
      this.toasts.error(
        'Não foi possível reservar a vaga',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu e nenhuma vaga foi criada.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  private async createTeam(): Promise<void> {
    const category = this.category();
    const p = this.params();
    if (!category || this.submitting() || !this.teamNameValid()) return;
    if (this.consentMissing()) return;
    const teamName = this.teamNameNormalized();
    this.submitting.set(true);
    try {
      const result = await createTeamRegistration(athleteFunctions(), {
        tournamentId: p.tournamentId,
        categoryId: category.id,
        teamName,
        lgpdAccepted: p.lgpdAccepted,
      });
      const uid = this.store.myUid() ?? '';
      // A inscrição recém-criada entra otimista: o listener entrega o cache primeiro, e sem isto
      // o passo seguinte voltaria ao consentimento.
      this.store.addOptimisticRegistration({
        id: result.registrationId,
        tournamentId: p.tournamentId,
        categoryId: category.id,
        teamId: result.teamId,
        partnerPending: true,
        isPaid: false,
        waitlist: false,
        cancellationRequest: null,
        sharePaidUids: [],
        declaredPaidAt: null,
        paymentVerifiedByOrganizer: false,
        player1Id: uid || null,
        participantUids: [uid].filter(Boolean),
        lgpdAcceptedUids: p.lgpdAccepted ? [uid].filter(Boolean) : [],
        uniformPlayer1: EMPTY_UNIFORM_SLOT,
        uniformPlayer2: EMPTY_UNIFORM_SLOT,
        teamName,
        teamSize: category.teamSize,
        captainUid: uid || null,
        uniformByUid: {},
        substitutionHistory: [],
        // O prazo é carimbado pelo servidor; o snapshot seguinte traz o valor real.
        holdExpiresAt: null,
      });
      this.toasts.success('Equipe criada', `${teamName} está com a vaga reservada — convide os atletas.`);
      // Fica NESTA tela: com a equipe criada, o passo seguinte do capitão é convidar o elenco.
      void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'parceiro'], {
        queryParams: wizardQueryParams({
          categoryId: category.id,
          registrationId: result.registrationId,
          lgpdAccepted: p.lgpdAccepted,
        }),
        replaceUrl: true,
      });
    } catch (err) {
      this.toasts.error(
        'Não foi possível criar a equipe',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu e nenhuma vaga foi criada.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  // ── convite por link (parceiro sem conta) ────────────────────────────────

  protected openInviteDialog(): void {
    this.showInviteDialog.set(true);
  }

  protected closeInviteDialog(): void {
    this.showInviteDialog.set(false);
  }

  protected onExternalInviteShared(partnerName: string | null): void {
    const p = this.params();
    if (!p.tournamentId || !p.categoryId) return;
    savePartnerLinkInviteMarker(p.tournamentId, p.categoryId, partnerName);
    this.linkInviteMarker.set(readPartnerLinkInviteMarker(p.tournamentId, p.categoryId));
  }
}
