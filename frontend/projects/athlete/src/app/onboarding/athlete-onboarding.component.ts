import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BrLocationsService } from '@nexago/br-locations';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getFirestore, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { sanitizeReturnUrl } from '../auth/redirect-url';
import { AuthShellComponent } from '../auth/ui/auth-shell.component';
import { isAllowedAvatarFile, prepareAvatarJpeg, uploadAthleteAvatar } from '../data/athlete-avatar-upload';
import { athleteFunctions } from '../data/functions';
import { SPORT_CATALOG } from '../data/sport-catalog';
import { athleteStorage } from '../data/storage';
import {
  MIN_NATIVE_BIRTH_DATE_ISO,
  birthDateBrToIso,
  birthDateIsoToBr,
  formatBirthDateMask,
  maxNativeBirthDateIso,
  validateBirthDate,
} from './onboarding-validators';
import { PhoneVerificationComponent } from '../shared/phone-verification/phone-verification.component';
import { peekPartnerInviteContext, takePartnerInviteContext } from '../shared/partner-invite/partner-invite';

type ObStep = 1 | 2 | 3 | 4 | 5;

export interface LevelOption {
  code: string;
  label: string;
  desc: string;
}

export interface GoalOption {
  code: string;
  label: string;
}

/** Escada única de 5 níveis (iniciante_1 < iniciante_2 < intermediario_1 < intermediario_2 < open),
 *  mesmos código e labels lidos por firestore.rules / category-level-eligibility.ts /
 *  athlete_profile_options.dart — aplicada a qualquer esporte escolhido. */
const LEVELS: LevelOption[] = [
  { code: 'iniciante_1', label: 'Iniciante 1', desc: 'Estou começando ou jogo pouco tempo.' },
  { code: 'iniciante_2', label: 'Iniciante 2', desc: 'Jogo com regularidade mas ainda não conheço as regras.' },
  { code: 'intermediario_1', label: 'Intermediário 1', desc: 'Jogo com regularidade e conheço as regras.' },
  { code: 'intermediario_2', label: 'Intermediário 2', desc: 'Boa técnica e bastante experiência de quadra.' },
  { code: 'open', label: 'Open', desc: 'Participo de torneios e busco performance.' },
];

const DEFAULT_LEVEL = 'intermediario_1';

/** Mesmos códigos de athlete_firestore_codes.dart. */
const GOALS: GoalOption[] = [
  { code: 'RESERVAR_ARENA', label: 'Reservar arena' },
  { code: 'JOGAR_DIVERSAO', label: 'Jogar por diversão' },
  { code: 'COMPETIR', label: 'Competir' },
  { code: 'MELHORAR_DESEMPENHO', label: 'Melhorar desempenho' },
  { code: 'CONHECER_PESSOAS', label: 'Conhecer pessoas' },
  { code: 'TREINAR_REGULARMENTE', label: 'Treinar regularmente' },
];

const GENDERS = ['Masculino', 'Feminino'] as const;

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

@Component({
  selector: 'app-athlete-onboarding',
  standalone: true,
  imports: [RouterLink, AuthShellComponent, PhoneVerificationComponent],
  templateUrl: './athlete-onboarding.component.html',
  styleUrl: './athlete-onboarding.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteOnboardingComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly brLocations = inject(BrLocationsService);
  private readonly firestore = createFirestore();
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly sports = SPORT_CATALOG;
  protected readonly levels = LEVELS;
  protected readonly goals = GOALS;
  protected readonly genders = GENDERS;

  protected readonly step = signal<ObStep>(1);

  protected readonly selectedSportCode = signal<string>(SPORT_CATALOG[0]!.code);
  protected readonly selectedLevelCode = signal<string>(DEFAULT_LEVEL);
  protected readonly selectedGoalCodes = signal<ReadonlySet<string>>(
    new Set(['JOGAR_DIVERSAO', 'COMPETIR']),
  );

  protected readonly selectedSport = computed(
    () => this.sports.find((s) => s.code === this.selectedSportCode()) ?? this.sports[0]!,
  );

  protected readonly name = signal(this.initialName());
  protected readonly nickname = signal('');
  protected readonly phoneVerified = signal(false);
  protected readonly verifiedPhoneNumber = signal<string | null>(null);
  protected readonly birthDateInput = signal('');
  protected readonly birthDateNativeMin = MIN_NATIVE_BIRTH_DATE_ISO;
  protected readonly birthDateNativeMax = maxNativeBirthDateIso();
  protected readonly gender = signal<string | null>(null);

  /** UF (sigla) e cidade do IBGE. Obrigatórias: o gate de torneios do servidor
   *  (`athlete-tournament-access.ts`) já exigia as duas depois do cadastro. */
  protected readonly state = signal('');
  protected readonly city = signal('');
  protected readonly cityOptions = computed(() => this.brLocations.citiesFor(this.state()));

  protected readonly touched = signal(false);

  protected readonly notice = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  /** Arquivo escolhido (ainda não enviado); preview local via object URL. */
  protected readonly photoFile = signal<File | null>(null);
  protected readonly photoPreviewUrl = signal<string | null>(null);
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');
  private readonly birthDateNativeInput = viewChild<ElementRef<HTMLInputElement>>('birthDateNative');
  private photoObjectUrl: string | null = null;

  protected readonly nameError = computed(() =>
    this.touched() && this.name().trim().length < 2 ? 'Obrigatório' : null,
  );
  protected readonly birthDateError = computed(() =>
    this.touched() ? validateBirthDate(this.birthDateInput()) : null,
  );
  protected readonly genderError = computed(() => (this.touched() && !this.gender() ? 'Obrigatório' : null));
  protected readonly stateError = computed(() => (this.touched() && !this.state() ? 'Obrigatório' : null));
  protected readonly cityError = computed(() => (this.touched() && !this.city() ? 'Obrigatório' : null));
  protected readonly photoError = computed(() =>
    this.touched() && !this.photoFile() ? 'Escolha uma foto pra concluir' : null,
  );

  /** Telefone verificado ficou de fora: o SMS não chega para parte dos
   *  atletas e travava o cadastro. Quem pula verifica depois no perfil — o
   *  gate de torneios do servidor (`athlete-tournament-access.ts`) continua
   *  exigindo `phoneVerified` na inscrição. */
  protected readonly profileFormValid = computed(
    () =>
      this.name().trim().length >= 2 &&
      validateBirthDate(this.birthDateInput()) == null &&
      this.gender() != null &&
      this.state() !== '' &&
      this.city() !== '' &&
      this.photoFile() != null,
  );

  private initialName(): string {
    const liveUser = this.auth.user();
    return liveUser?.displayName?.trim() ?? '';
  }

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.noticeTimeout);
      this.revokePhotoPreview();
    });
  }

  protected selectSport(code: string): void {
    this.selectedSportCode.set(code);
  }

  protected selectLevel(code: string): void {
    this.selectedLevelCode.set(code);
  }

  protected toggleGoal(code: string): void {
    this.selectedGoalCodes.update((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  protected isGoalSelected(code: string): boolean {
    return this.selectedGoalCodes().has(code);
  }

  /** Trocar a UF invalida a cidade escolhida — senão sobraria uma cidade de
   *  outro estado no cadastro. */
  protected selectState(uf: string): void {
    if (uf === this.state()) return;
    this.state.set(uf);
    this.city.set('');
  }

  /** `confirmPhoneVerification` já gravou phoneNumber/phoneVerified em
   *  users/{uid} via Admin SDK — aqui só refletimos o estado na UI. */
  protected onPhoneVerified(event: { phoneNumber: string }): void {
    this.verifiedPhoneNumber.set(event.phoneNumber);
    this.phoneVerified.set(true);
  }

  protected onBirthDateInputChanged(value: string): void {
    this.birthDateInput.set(formatBirthDateMask(value));
  }

  protected openBirthDatePicker(): void {
    const input = this.birthDateNativeInput()?.nativeElement;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Navegador recusou (ex.: fora de gesto do usuário) — cai no fallback abaixo.
      }
    }
    input.click();
  }

  protected onBirthDateNativeChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    this.birthDateInput.set(birthDateIsoToBr(value));
  }

  protected goToStep(step: ObStep): void {
    this.step.set(step);
  }

  protected back(): void {
    const current = this.step();
    if (current > 1) {
      this.step.set((current - 1) as ObStep);
    }
  }

  protected choosePhoto(): void {
    this.photoInput()?.nativeElement.click();
  }

  protected onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    const error = isAllowedAvatarFile(file);
    if (error) {
      this.showNotice(error);
      return;
    }

    this.revokePhotoPreview();
    this.photoObjectUrl = URL.createObjectURL(file);
    this.photoFile.set(file);
    this.photoPreviewUrl.set(this.photoObjectUrl);
  }

  protected clearPhoto(): void {
    this.revokePhotoPreview();
    this.photoFile.set(null);
    this.photoPreviewUrl.set(null);
  }

  private revokePhotoPreview(): void {
    if (this.photoObjectUrl) {
      URL.revokeObjectURL(this.photoObjectUrl);
      this.photoObjectUrl = null;
    }
  }

  protected async submitProfile(): Promise<void> {
    this.touched.set(true);
    if (!this.profileFormValid()) return;

    const uid = this.auth.user()?.uid;
    if (!uid || !this.firestore) {
      this.submitError.set('Não foi possível confirmar sua sessão. Faça login novamente.');
      return;
    }

    const isoBirthDate = birthDateBrToIso(this.birthDateInput())!;
    const sportCode = this.selectedSportCode();
    const levelCode = this.selectedLevelCode();
    const fullName = this.name().trim();
    const photoFile = this.photoFile()!;
    const city = this.city();
    const state = this.state();

    this.submitting.set(true);
    this.submitError.set(null);

    try {
      // `roles` é imutável no update das rules (só a Cloud Function, via Admin SDK,
      // pode alterá-lo — mesmo padrão de `completeArenaSignup`). Uma conta que já
      // veio de outro portal (arena/organizer) teria o próprio save do onboarding
      // negado por permissão se tentássemos gravar `roles` direto daqui; por isso
      // o papel é concedido primeiro via `grantAthleteRole`, e o setDoc abaixo nem
      // toca no campo.
      const grantAthleteRole = httpsCallable(athleteFunctions(), 'grantAthleteRole');
      await grantAthleteRole();
      await this.auth.user()?.getIdToken(true);

      // A foto é obrigatória e sobe ANTES do perfil: se o Storage falhar, nada
      // é gravado e o atleta repete o envio. Gravar primeiro deixaria um
      // cadastro concluído sem imagem — exatamente o que precisamos evitar.
      let photoUrl: string;
      try {
        const jpeg = await prepareAvatarJpeg(photoFile);
        photoUrl = await uploadAthleteAvatar(athleteStorage(), uid, jpeg);
      } catch (photoErr) {
        if (!environment.production) {
          console.error('[onboarding] avatar upload error', photoErr);
        }
        this.submitError.set('Não foi possível enviar sua foto. Verifique a conexão e tente de novo.');
        return;
      }

      const userDocRef = doc(this.firestore, 'users', uid);

      await Promise.all([
        setDoc(
          userDocRef,
          {
            fullName,
            nickname: this.nickname().trim() || null,
            gender: this.gender(),
            birthDate: isoBirthDate,
            city,
            state,
            profilePhotoUrl: photoUrl,
            goals: Array.from(this.selectedGoalCodes()),
            sportOnboarding: {
              version: 1,
              primarySportId: sportCode,
              levelsBySport: { [sportCode]: levelCode },
              completedAt: serverTimestamp(),
            },
            hasAthleteRole: true,
            onboardingCompleted: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
        setDoc(
          doc(this.firestore, 'athlete_profiles', uid),
          {
            fullName,
            displayName: this.nickname().trim() || fullName,
            primarySport: sportCode,
            city,
            state,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      ]);

      this.step.set(5);
    } catch (err) {
      if (!environment.production) {
        console.error('[onboarding] save error', err);
      }
      this.submitError.set('Não foi possível salvar seu perfil agora. Tente novamente.');
    } finally {
      this.submitting.set(false);
    }
  }

  /** Convite de parceiro pendente (link de cadastro) — dirige o passo final e o destino.
   *  Sem torneio no contexto é indicação pura: passo final segue o texto padrão. */
  protected readonly pendingPartnerInvite = computed(() => {
    const ctx = peekPartnerInviteContext();
    return ctx?.tournamentId ? ctx : null;
  });

  protected finish(): void {
    // Quem chegou por convite de dupla cai direto no torneio do convite — quem convidou
    // ainda precisa buscar o nome e enviar o convite real de dupla por lá.
    const invite = takePartnerInviteContext();
    const fallback = invite?.tournamentId ? `/torneios/${invite.tournamentId}` : '/painel';
    const redirectParam = this.route.snapshot.queryParamMap.get('redirect');
    // Sem convite, o onboardingGuard pode ter guardado aqui o destino original
    // (ex.: inscrição de torneio) que o atleta tentou acessar antes de ter conta.
    const target = redirectParam
      ? sanitizeReturnUrl(redirectParam, fallback, { trustedOrigins: environment.trustedReturnOrigins })
      : fallback;
    void this.router.navigateByUrl(target);
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}
