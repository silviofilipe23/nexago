import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, updateProfile } from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import { SandRankCardComponent } from './sand-rank-card.component';
import { ACHIEVEMENT_CATALOG, buildAchievementViewModels } from './achievement-catalog';
import { AthleteGamificationService } from './athlete-gamification.service';
import { buildPublicProfileId, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState } from './profile-format';
import { athleteFunctions } from '../data/functions';
import {
  registerReferral,
  XP_REFERRAL_BONUS,
  type ReferralRegistrationRejection,
} from '../data/athlete-referral-repository';

const PRIMARY_SPORT_OPTIONS = [
  'Volei de praia',
  'Volei de quadra',
  'Beach tennis',
  'Futevolei',
  'Tenis',
  'Pickleball',
  'Padel',
  'Corrida',
] as const;

interface AthleteProfileData {
  fullName: string;
  city: string;
  state: string;
  whatsappNumber: string;
  primarySport: string;
  bio: string;
  publicProfileId: string | null;
  publicProfileEnabled: boolean;
}

const EMPTY_PROFILE: AthleteProfileData = {
  fullName: '',
  city: '',
  state: '',
  whatsappNumber: '',
  primarySport: 'Volei de praia',
  bio: '',
  publicProfileId: null,
  publicProfileEnabled: true,
};

interface StatRow {
  label: string;
  value: string;
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function readString(data: DocumentData | null | undefined, keys: readonly string[]): string | null {
  if (!data) {
    return null;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readNumber(data: DocumentData | null | undefined, keys: readonly string[]): number | null {
  if (!data) {
    return null;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

@Component({
  selector: 'app-athlete-profile-settings',
  standalone: true,
  imports: [ReactiveFormsModule, AtPanelShellComponent, SandRankCardComponent, NxPageLoadingComponent, NxSpinnerComponent],
  templateUrl: './athlete-profile-settings.component.html',
  styleUrl: './athlete-profile-settings.component.scss',
})
export class AthleteProfileSettingsComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  protected readonly gamification = inject(AthleteGamificationService);
  private readonly firestore = createFirestore();

  protected readonly sportOptions = PRIMARY_SPORT_OPTIONS;

  protected readonly isEditing = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal<string | null>(null);
  protected readonly copyFeedback = signal<string | null>(null);
  protected readonly showAllAchievements = signal(false);
  protected readonly sendingReset = signal(false);
  protected readonly passwordResetSent = signal(false);
  protected readonly resetError = signal<string | null>(null);

  // Programa de indicação (referral) — `referredBy` vem de `users/{uid}`, carregado junto
  // com o resto do perfil em loadRemoteProfile. `null` = ainda sem indicador vinculado,
  // então o campo "aplicar código" continua visível.
  protected readonly xpReferralBonus = XP_REFERRAL_BONUS;
  protected readonly referredBy = signal<string | null>(null);
  protected readonly referralCopyFeedback = signal<string | null>(null);
  protected readonly referralApplyCode = signal('');
  protected readonly referralApplying = signal(false);
  protected readonly referralApplyError = signal<string | null>(null);
  protected readonly referralApplySuccess = signal<string | null>(null);

  // undefined (not null) so the very first run isn't mistaken for "already loaded" when there's no
  // user yet (uid is null in that case too) — this bit the dev-auth-bypass path, which never has a
  // real uid, and left the page stuck on "Carregando perfil..." forever.
  private readonly loadedUid = signal<string | null | undefined>(undefined);
  private readonly profileState = signal<AthleteProfileData>(EMPTY_PROFILE);
  private readonly rankingLabel = signal<string | null>(null);
  // `roles` já existentes em users/{uid}, lido em loadRemoteProfile — reutilizado em save()
  // pra satisfazer as rules (create exige roles=['athlete']; update exige roles imutável).
  private readonly existingUserRoles = signal<string[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    cityState: ['', Validators.required],
    whatsappNumber: [''],
    primarySport: ['Volei de praia', Validators.required],
    bio: [''],
  });

  protected readonly displayName = computed(() => this.profileState().fullName || this.fallbackAccountLabel());
  protected readonly initials = computed(() => initialsOf(this.displayName()));
  protected readonly handle = computed(() => slugify(this.displayName()) || 'atleta');
  protected readonly cityStateLabel = computed(
    () => joinCityState(this.profileState().city, this.profileState().state) || 'Cidade não informada',
  );
  protected readonly sportPillLabel = computed(() => this.profileState().primarySport || 'Volei de praia');
  protected readonly profileBio = computed(
    () => this.profileState().bio || 'Conte um pouco sobre seu jogo editando o perfil.',
  );
  protected readonly accountEmail = computed(() => this.auth.user()?.email ?? this.auth.devEmail() ?? '');

  protected readonly levelLabel = computed(() => `Nível ${this.gamification.summary()?.level ?? 0}`);
  protected readonly xpLabel = computed(() => {
    const summary = this.gamification.summary();
    return summary ? `${summary.progress.xpInLevel} / 100 XP` : '0 / 100 XP';
  });
  protected readonly xpToNextLabel = computed(() => {
    const summary = this.gamification.summary();
    if (!summary) {
      return 'Continue jogando pra ganhar XP.';
    }
    return `Faltam ${summary.progress.xpForNextLevel} XP pro nível ${summary.level + 1}`;
  });
  protected readonly xpProgressPercent = computed(() =>
    Math.round((this.gamification.summary()?.progress.progressRatio ?? 0) * 100),
  );

  protected readonly statRows = computed<StatRow[]>(() => {
    const summary = this.gamification.summary();
    return [
      { label: 'Jogos', value: summary ? String(summary.totalGames) : '—' },
      { label: 'Sequência', value: summary && summary.streak > 0 ? `${summary.streak} dias` : '—' },
      { label: 'Ranking', value: this.rankingLabel() ?? '—' },
    ];
  });

  protected readonly achievements = computed(() => buildAchievementViewModels(this.gamification.unlockedAchievementIds()));
  protected readonly achievementTotal = ACHIEVEMENT_CATALOG.length;
  protected readonly unlockedCount = computed(() => this.achievements().filter((item) => item.unlocked).length);
  protected readonly visibleAchievements = computed(() =>
    this.showAllAchievements() ? this.achievements() : this.achievements().slice(0, 4),
  );

  protected readonly publicProfileUrl = computed(() => {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    // Rota `/atletas/:handle` resolve `public_profiles/{uid}` — o id do doc é o uid do Auth,
    // não o slug de exibição (`buildPublicProfileId`). Link com slug nunca encontra o perfil.
    const uid = this.auth.user()?.uid?.trim();
    return uid ? `${origin}/atletas/${uid}` : `${origin}/atletas`;
  });

  // Código de indicação = o próprio UID (mesma decisão do app mobile — sem handle curto
  // reaproveitável no projeto). `registerReferral` valida o código no backend.
  protected readonly referralCode = computed(() => this.auth.user()?.uid?.trim() ?? '');
  protected readonly referralLink = computed(() => {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    const code = this.referralCode();
    return code ? `${origin}/cadastro?ref=${code}` : `${origin}/cadastro`;
  });
  protected readonly referralShareText = computed(
    () =>
      `Vem jogar comigo no nexaGO! Use meu código de indicação ${this.referralCode()} ao se cadastrar — ` +
      `quando você jogar sua primeira partida, eu ganho +${XP_REFERRAL_BONUS} XP. Cadastre-se: ${this.referralLink()}`,
  );

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (!this.auth.authReady() || uid === this.loadedUid()) {
        return;
      }
      this.loadedUid.set(uid);

      if (uid) {
        void this.loadRemoteProfile(uid);
        return;
      }

      const devEmail = this.auth.devEmail();
      this.profileState.set({ ...EMPTY_PROFILE, fullName: devEmail ? nameFromEmail(devEmail) : '' });
      this.existingUserRoles.set([]);
      this.referredBy.set(null);
      this.loading.set(false);
    });

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const projectId = environment.firebase.projectId;
      if (!uid || !this.firestore || !projectId) {
        this.rankingLabel.set(null);
        return;
      }

      const stop = onSnapshot(
        doc(this.firestore, 'artifacts', projectId, 'public', 'data', 'athleteRankings', uid),
        (snapshot) => {
          const data = snapshot.exists() ? snapshot.data() : null;
          const position = readNumber(data, ['position', 'rank', 'placement']);
          this.rankingLabel.set(position != null ? `#${Math.round(position)}` : 'Sem ranking');
        },
        () => this.rankingLabel.set(null),
      );

      onCleanup(() => stop());
    });
  }

  protected startEdit(): void {
    const current = this.profileState();
    this.form.reset({
      fullName: current.fullName,
      cityState: joinCityState(current.city, current.state),
      whatsappNumber: current.whatsappNumber,
      primarySport: current.primarySport || 'Volei de praia',
      bio: current.bio,
    });
    this.saveError.set(null);
    this.saveSuccess.set(null);
    this.isEditing.set(true);
  }

  protected cancelEdit(): void {
    this.isEditing.set(false);
    this.saveError.set(null);
  }

  protected selectSport(sport: string): void {
    this.form.controls.primarySport.setValue(sport);
    this.form.controls.primarySport.markAsDirty();
  }

  protected toggleAllAchievements(): void {
    this.showAllAchievements.update((value) => !value);
  }

  protected async save(): Promise<void> {
    this.saveError.set(null);
    this.saveSuccess.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Preencha os campos obrigatórios antes de salvar.');
      return;
    }

    const uid = this.auth.user()?.uid;
    if (!uid || !this.firestore) {
      this.saveError.set('Faça login para salvar seu perfil.');
      return;
    }

    this.saving.set(true);

    try {
      const raw = this.form.getRawValue();
      const { city, state } = splitCityState(raw.cityState);
      const whatsappNumber = raw.whatsappNumber.trim();
      const bio = raw.bio.trim();
      const publicProfileId = this.profileState().publicProfileId || buildPublicProfileId(raw.fullName, uid);
      // Preserva um "false" explícito (ex.: privacidade desativada no app); só liga por padrão
      // quando o doc nunca teve esse campo — sem isso, "Compartilhar perfil" gera um link que o
      // perfil público nunca encontra, porque a consulta lá exige publicProfileEnabled == true.
      const publicProfileEnabled = this.profileState().publicProfileEnabled;

      const authInstance = getAuth(getApps()[0]!);
      if (authInstance.currentUser && authInstance.currentUser.uid === uid) {
        await updateProfile(authInstance.currentUser, { displayName: raw.fullName });
      }

      // As rules exigem `roles` no create (`roles.hasOnly(['athlete']) && size() > 0`) e
      // imutável no update — união com o que já existir, preservando ordem (mesmo padrão do
      // app mobile em athlete_profile_repository.dart:74-82), nunca só `['athlete']` fixo.
      const roles = Array.from(new Set([...this.existingUserRoles(), 'athlete']));

      await Promise.all([
        setDoc(
          doc(this.firestore, 'users', uid),
          { fullName: raw.fullName, city, state, roles, hasAthleteRole: true, updatedAt: serverTimestamp() },
          { merge: true },
        ),
        setDoc(
          doc(this.firestore, 'athlete_profiles', uid),
          {
            fullName: raw.fullName,
            displayName: raw.fullName,
            city,
            state,
            whatsappNumber,
            primarySport: raw.primarySport,
            bio,
            publicProfileId,
            publicProfileEnabled,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      ]);

      this.profileState.set({
        fullName: raw.fullName,
        city,
        state,
        whatsappNumber,
        primarySport: raw.primarySport,
        bio,
        publicProfileId,
        publicProfileEnabled,
      });
      this.saveSuccess.set('Perfil atualizado.');
      this.isEditing.set(false);
    } catch {
      this.saveError.set('Não foi possível salvar agora. Tente novamente em instantes.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async copyProfileLink(): Promise<void> {
    this.copyFeedback.set(null);
    try {
      await navigator.clipboard.writeText(this.publicProfileUrl());
      this.copyFeedback.set('Link copiado.');
    } catch {
      this.copyFeedback.set('Copie manualmente o link do perfil.');
    }
  }

  protected async shareProfile(): Promise<void> {
    const url = this.publicProfileUrl();
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: { title: string; url: string }) => Promise<void> }).share({
          title: 'Meu perfil NexaGO',
          url,
        });
        return;
      } catch {
        // usuario cancelou o compartilhamento nativo — cai pro copiar.
      }
    }
    await this.copyProfileLink();
  }

  protected async copyReferralLink(): Promise<void> {
    this.referralCopyFeedback.set(null);
    try {
      await navigator.clipboard.writeText(this.referralLink());
      this.referralCopyFeedback.set('Link copiado.');
    } catch {
      this.referralCopyFeedback.set('Copie manualmente o link de indicação.');
    }
  }

  protected async shareReferral(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (
          navigator as Navigator & { share: (data: { title: string; text: string; url: string }) => Promise<void> }
        ).share({
          title: 'Convide um amigo pro nexaGO',
          text: this.referralShareText(),
          url: this.referralLink(),
        });
        return;
      } catch {
        // usuario cancelou o compartilhamento nativo — cai pro copiar.
      }
    }
    await this.copyReferralLink();
  }

  protected onReferralApplyCodeInput(value: string): void {
    this.referralApplyCode.set(value);
  }

  protected async applyReferralCode(): Promise<void> {
    this.referralApplyError.set(null);
    this.referralApplySuccess.set(null);

    const code = this.referralApplyCode().trim();
    if (!code) {
      this.referralApplyError.set('Informe um código de indicação.');
      return;
    }

    if (!this.auth.user()?.uid) {
      this.referralApplyError.set('Faça login para aplicar um código de indicação.');
      return;
    }

    this.referralApplying.set(true);
    try {
      const result = await registerReferral(athleteFunctions(), code);
      if (result.applied) {
        this.referredBy.set(code);
        this.referralApplyCode.set('');
        this.referralApplySuccess.set(
          `Código aplicado! Quando você jogar sua primeira partida, seu amigo ganha +${XP_REFERRAL_BONUS} XP.`,
        );
      } else {
        this.referralApplyError.set(this.referralRejectionMessage(result.rejection));
      }
    } catch {
      this.referralApplyError.set('Não foi possível aplicar o código agora. Tente novamente.');
    } finally {
      this.referralApplying.set(false);
    }
  }

  private referralRejectionMessage(rejection: ReferralRegistrationRejection | null): string {
    switch (rejection) {
      case 'MISSING_CODE':
        return 'Informe um código de indicação.';
      case 'SELF_REFERRAL':
        return 'Esse é o seu próprio código — use o código de um amigo.';
      case 'REFERRER_NOT_FOUND':
        return 'Não encontramos esse código de indicação.';
      case 'ALREADY_SET':
        return 'Você já tem um código de indicação aplicado.';
      default:
        return 'Não foi possível aplicar o código agora.';
    }
  }

  protected async sendPasswordReset(): Promise<void> {
    const email = this.auth.user()?.email;
    if (!email) {
      return;
    }
    this.resetError.set(null);
    this.sendingReset.set(true);
    try {
      await this.auth.sendPasswordReset(email);
      this.passwordResetSent.set(true);
    } catch {
      this.resetError.set('Não foi possível enviar o e-mail agora.');
    } finally {
      this.sendingReset.set(false);
    }
  }

  private fallbackAccountLabel(): string {
    const user = this.auth.user();
    if (user?.displayName?.trim()) {
      return user.displayName.trim();
    }
    if (user?.email?.trim()) {
      return nameFromEmail(user.email);
    }
    const devEmail = this.auth.devEmail();
    return devEmail ? nameFromEmail(devEmail) : 'Atleta NexaGO';
  }

  private async loadRemoteProfile(uid: string): Promise<void> {
    if (!this.firestore) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const [userSnap, profileSnap] = await Promise.all([
        getDoc(doc(this.firestore, 'users', uid)),
        getDoc(doc(this.firestore, 'athlete_profiles', uid)),
      ]);
      const userData = userSnap.exists() ? userSnap.data() : null;
      const profileData = profileSnap.exists() ? profileSnap.data() : null;

      const rawRoles = userData?.['roles'];
      this.existingUserRoles.set(
        Array.isArray(rawRoles) ? rawRoles.filter((r): r is string => typeof r === 'string') : [],
      );

      const fullName =
        readString(profileData, ['fullName', 'displayName']) ??
        readString(userData, ['fullName']) ??
        this.auth.user()?.displayName?.trim() ??
        nameFromEmail(this.auth.user()?.email);

      this.profileState.set({
        fullName,
        city: readString(profileData, ['city']) ?? readString(userData, ['city']) ?? '',
        state: readString(profileData, ['state']) ?? readString(userData, ['state']) ?? '',
        whatsappNumber: readString(profileData, ['whatsappNumber']) ?? '',
        primarySport: readString(profileData, ['primarySport']) ?? 'Volei de praia',
        bio: readString(profileData, ['bio']) ?? '',
        publicProfileId: readString(profileData, ['publicProfileId', 'athleteId', 'profileIdentifier']),
        // Só false quando o doc já existe e diz explicitamente false (ex.: privacidade desativada
        // no app) — um doc novo ou sem esse campo deve poder ser encontrado pelo perfil público.
        publicProfileEnabled: profileData?.['publicProfileEnabled'] !== false,
      });
      this.referredBy.set(readString(userData, ['referredBy']));
    } catch {
      this.saveError.set('Não foi possível carregar seu perfil agora.');
    } finally {
      this.loading.set(false);
    }
  }
}
