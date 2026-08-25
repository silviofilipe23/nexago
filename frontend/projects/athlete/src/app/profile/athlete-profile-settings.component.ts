import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
import { NxSkeletonComponent } from '../shared/loading/nx-skeleton.component';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import { SandRankCardComponent } from './sand-rank-card.component';
import { ACHIEVEMENT_CATALOG, buildAchievementViewModels } from './achievement-catalog';
import { AthleteGamificationService } from './athlete-gamification.service';
import { buildPublicProfileId, buildSportLevels, initialsOf, joinCityState, nameFromEmail, slugify, type SportLevelEntry } from './profile-format';
import { athleteFunctions } from '../data/functions';
import {
  registerReferral,
  XP_REFERRAL_BONUS,
  type ReferralRegistrationRejection,
} from '../data/athlete-referral-repository';
import { PhoneVerificationComponent } from '../shared/phone-verification/phone-verification.component';
import { BrLocationsService } from '@nexago/br-locations';
import {
  isAllowedAvatarFile,
  prepareAvatarJpeg,
  uploadAthleteAvatar,
  uploadAthleteCoverPhoto,
} from '../data/athlete-avatar-upload';
import {
  HIGHLIGHT_ASPECT_RATIO,
  HIGHLIGHT_JPEG_QUALITY,
  HIGHLIGHT_MAX_OUTPUT_WIDTH,
  MAX_HIGHLIGHT_PHOTOS,
  buildHighlightPhotoId,
  deleteAthleteHighlightPhoto,
  uploadAthleteHighlightPhoto,
} from '../data/athlete-highlight-upload';
import { athleteStorage } from '../data/storage';
import { AthleteHighlightsEditorComponent } from './athlete-highlights-editor.component';
import { AthleteHighlightsGalleryComponent } from './athlete-highlights-gallery.component';
import { NxImageCropperComponent } from '../shared/media/nx-image-cropper.component';

interface AthleteProfileData {
  fullName: string;
  nickname: string;
  city: string;
  state: string;
  phoneNumber: string;
  phoneVerified: boolean;
  bio: string;
  publicProfileId: string | null;
  publicProfileEnabled: boolean;
  profilePhotoUrl: string | null;
  coverPhotoUrl: string | null;
  highlightPhotoUrls: string[];
}

const EMPTY_PROFILE: AthleteProfileData = {
  fullName: '',
  nickname: '',
  city: '',
  state: '',
  phoneNumber: '',
  phoneVerified: false,
  bio: '',
  publicProfileId: null,
  publicProfileEnabled: true,
  profilePhotoUrl: null,
  coverPhotoUrl: null,
  highlightPhotoUrls: [],
};

function readStringArray(data: DocumentData | null | undefined, key: string): string[] {
  const value = data?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

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
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AtPanelShellComponent,
    SandRankCardComponent,
    NxPageLoadingComponent,
    NxSkeletonComponent,
    NxSpinnerComponent,
    PhoneVerificationComponent,
    AthleteHighlightsGalleryComponent,
    AthleteHighlightsEditorComponent,
    NxImageCropperComponent,
  ],
  templateUrl: './athlete-profile-settings.component.html',
  styleUrl: './athlete-profile-settings.component.scss',
})
export class AthleteProfileSettingsComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  protected readonly gamification = inject(AthleteGamificationService);
  protected readonly brLocations = inject(BrLocationsService);
  private readonly router = inject(Router);
  private readonly firestore = createFirestore();

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
  protected readonly changingPhone = signal(false);
  // Sair da conta pede confirmação em dois passos: no mobile a sidebar some (com o botão
  // de logout dela), então este card é o único caminho — e um toque errado derruba a
  // sessão. Mesma convenção do "Sair da lista" do Clubinho.
  protected readonly logoutConfirming = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly cityOptions = signal<string[]>([]);
  protected readonly uploadingAvatar = signal(false);
  protected readonly avatarUploadError = signal<string | null>(null);
  protected readonly uploadingCover = signal(false);
  protected readonly coverUploadError = signal<string | null>(null);
  /** Arquivo aguardando recorte — enquanto não for null o cropper está aberto. */
  protected readonly highlightCropFile = signal<File | null>(null);
  protected readonly uploadingHighlight = signal(false);
  protected readonly removingHighlight = signal(false);
  protected readonly highlightError = signal<string | null>(null);
  /** Controla o skeleton de cada imagem — falso enquanto o <img> não disparou (load)/(error). */
  protected readonly avatarLoaded = signal(false);
  protected readonly coverLoaded = signal(false);

  protected readonly avatarInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');
  protected readonly coverInput = viewChild<ElementRef<HTMLInputElement>>('coverInput');

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
  private readonly sportLevels = signal<SportLevelEntry[]>([]);
  private readonly rankingLabel = signal<string | null>(null);
  // `roles` já existentes em users/{uid}, lido em loadRemoteProfile — reutilizado em save()
  // pra satisfazer as rules (create exige roles=['athlete']; update exige roles imutável).
  private readonly existingUserRoles = signal<string[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    nickname: [''],
    state: ['', Validators.required],
    city: ['', Validators.required],
    bio: [''],
  });

  protected readonly displayName = computed(() => this.profileState().fullName || this.fallbackAccountLabel());
  protected readonly initials = computed(() => initialsOf(this.displayName()));
  /** Foto do onboarding (Firestore `users/{uid}.profilePhotoUrl`) tem prioridade;
   *  cai pro `photoURL` do Firebase Auth (Google/Apple) quando não há uma. */
  protected readonly avatarUrl = computed(
    () => this.profileState().profilePhotoUrl ?? this.auth.user()?.photoURL ?? null,
  );
  protected readonly coverUrl = computed(() => this.profileState().coverPhotoUrl);
  protected readonly highlightPhotos = computed(() => this.profileState().highlightPhotoUrls);
  protected readonly highlightAspectRatio = HIGHLIGHT_ASPECT_RATIO;
  protected readonly highlightMaxOutputWidth = HIGHLIGHT_MAX_OUTPUT_WIDTH;
  protected readonly highlightQuality = HIGHLIGHT_JPEG_QUALITY;
  protected readonly maxHighlightPhotos = MAX_HIGHLIGHT_PHOTOS;
  protected readonly handle = computed(() => slugify(this.displayName()) || 'atleta');
  protected readonly cityStateLabel = computed(
    () => joinCityState(this.profileState().city, this.profileState().state) || 'Cidade não informada',
  );
  protected readonly primarySportLevel = computed<SportLevelEntry | null>(() => this.sportLevels()[0] ?? null);
  protected readonly otherSportLevels = computed(() => this.sportLevels().slice(1));
  protected readonly profileBio = computed(
    () => this.profileState().bio || 'Conte um pouco sobre seu jogo editando o perfil.',
  );
  protected readonly phoneNumber = computed(() => this.profileState().phoneNumber);
  protected readonly phoneVerified = computed(() => this.profileState().phoneVerified);
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
      this.sportLevels.set([]);
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

  protected async startEdit(): Promise<void> {
    const current = this.profileState();
    this.form.reset({
      fullName: current.fullName,
      nickname: current.nickname,
      state: current.state,
      city: '',
      bio: current.bio,
    });
    this.cityOptions.set(this.brLocations.citiesFor(current.state));
    this.saveError.set(null);
    this.saveSuccess.set(null);
    this.avatarUploadError.set(null);
    this.coverUploadError.set(null);
    this.highlightError.set(null);
    this.isEditing.set(true);

    await this.brLocations.ready;
    const liveState = this.form.controls.state.value;
    const cities = this.brLocations.citiesFor(liveState);
    this.cityOptions.set(cities);
    if (liveState === current.state) {
      const matched = cities.find((c) => c.toLowerCase() === current.city.trim().toLowerCase());
      this.form.patchValue({ city: matched ?? '' });
    }
  }

  protected onStateSelected(uf: string): void {
    this.form.patchValue({ state: uf, city: '' });
    this.cityOptions.set(this.brLocations.citiesFor(uf));
  }

  protected cancelEdit(): void {
    this.isEditing.set(false);
    this.saveError.set(null);
    this.avatarUploadError.set(null);
    this.coverUploadError.set(null);
    this.highlightError.set(null);
    // Fotos de destaque já foram persistidas no momento do upload; cancelar a
    // edição do formulário não deve deixar um recorte pendente aberto.
    this.highlightCropFile.set(null);
  }

  protected toggleAllAchievements(): void {
    this.showAllAchievements.update((value) => !value);
  }

  protected chooseAvatarFile(): void {
    this.avatarInput()?.nativeElement.click();
  }

  protected chooseCoverFile(): void {
    this.coverInput()?.nativeElement.click();
  }

  /** Upload imediato ao selecionar — não depende de "Salvar alterações" (mesmo
   *  contrato de storage.rules/profiles do onboarding, ver athlete-avatar-upload.ts). */
  protected async onAvatarFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    this.avatarUploadError.set(null);
    const fileError = isAllowedAvatarFile(file);
    if (fileError) {
      this.avatarUploadError.set(fileError);
      return;
    }

    const uid = this.auth.user()?.uid;
    if (!uid || !this.firestore) {
      this.avatarUploadError.set('Faça login para trocar sua foto.');
      return;
    }

    this.uploadingAvatar.set(true);
    try {
      const jpeg = await prepareAvatarJpeg(file);
      const url = await uploadAthleteAvatar(athleteStorage(), uid, jpeg);
      await setDoc(doc(this.firestore, 'users', uid), { profilePhotoUrl: url, updatedAt: serverTimestamp() }, { merge: true });
      this.avatarLoaded.set(false);
      this.profileState.update((current) => ({ ...current, profilePhotoUrl: url }));
    } catch {
      this.avatarUploadError.set('Não foi possível enviar a foto agora. Tente novamente.');
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  protected async onCoverFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    this.coverUploadError.set(null);
    const fileError = isAllowedAvatarFile(file);
    if (fileError) {
      this.coverUploadError.set(fileError);
      return;
    }

    const uid = this.auth.user()?.uid;
    if (!uid || !this.firestore) {
      this.coverUploadError.set('Faça login para trocar sua capa.');
      return;
    }

    this.uploadingCover.set(true);
    try {
      const jpeg = await prepareAvatarJpeg(file, 1600);
      const url = await uploadAthleteCoverPhoto(athleteStorage(), uid, jpeg);
      await setDoc(doc(this.firestore, 'users', uid), { coverPhotoUrl: url, updatedAt: serverTimestamp() }, { merge: true });
      this.coverLoaded.set(false);
      this.profileState.update((current) => ({ ...current, coverPhotoUrl: url }));
    } catch {
      this.coverUploadError.set('Não foi possível enviar a capa agora. Tente novamente.');
    } finally {
      this.uploadingCover.set(false);
    }
  }

  /** Passo 1 da foto de destaque: valida o arquivo e abre o recorte 1:1. */
  protected onHighlightFileChosen(file: File): void {
    this.highlightError.set(null);

    if (this.highlightPhotos().length >= MAX_HIGHLIGHT_PHOTOS) {
      this.highlightError.set(`Você já tem ${MAX_HIGHLIGHT_PHOTOS} fotos. Remova uma pra adicionar outra.`);
      return;
    }

    const fileError = isAllowedAvatarFile(file);
    if (fileError) {
      this.highlightError.set(fileError);
      return;
    }

    this.highlightCropFile.set(file);
  }

  protected cancelHighlightCrop(): void {
    this.highlightCropFile.set(null);
  }

  /** Passo 2: sobe o recorte e persiste na hora, como avatar e capa. */
  protected async onHighlightCropped(blob: Blob): Promise<void> {
    this.highlightCropFile.set(null);
    this.highlightError.set(null);

    const uid = this.auth.user()?.uid;
    if (!uid || !this.firestore) {
      this.highlightError.set('Faça login para adicionar fotos de destaque.');
      return;
    }

    const current = this.highlightPhotos();
    if (current.length >= MAX_HIGHLIGHT_PHOTOS) {
      this.highlightError.set(`Você já tem ${MAX_HIGHLIGHT_PHOTOS} fotos. Remova uma pra adicionar outra.`);
      return;
    }

    this.uploadingHighlight.set(true);
    try {
      const photoId = buildHighlightPhotoId(current.length);
      const url = await uploadAthleteHighlightPhoto(athleteStorage(), uid, photoId, blob);
      const next = [...current, url];
      await setDoc(
        doc(this.firestore, 'users', uid),
        { highlightPhotoUrls: next, updatedAt: serverTimestamp() },
        { merge: true },
      );
      this.profileState.update((state) => ({ ...state, highlightPhotoUrls: next }));
    } catch {
      this.highlightError.set('Não foi possível enviar a foto agora. Tente novamente.');
    } finally {
      this.uploadingHighlight.set(false);
    }
  }

  protected async removeHighlight(index: number): Promise<void> {
    this.highlightError.set(null);

    const uid = this.auth.user()?.uid;
    if (!uid || !this.firestore) {
      this.highlightError.set('Faça login para editar suas fotos de destaque.');
      return;
    }

    const current = this.highlightPhotos();
    const removed = current[index];
    if (!removed) {
      return;
    }

    this.removingHighlight.set(true);
    try {
      const next = current.filter((_, i) => i !== index);
      await setDoc(
        doc(this.firestore, 'users', uid),
        { highlightPhotoUrls: next, updatedAt: serverTimestamp() },
        { merge: true },
      );
      this.profileState.update((state) => ({ ...state, highlightPhotoUrls: next }));
      // Só depois de a foto sair do perfil — falhar aqui não desfaz a remoção.
      void deleteAthleteHighlightPhoto(athleteStorage(), removed);
    } catch {
      this.highlightError.set('Não foi possível remover a foto agora. Tente novamente.');
    } finally {
      this.removingHighlight.set(false);
    }
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
      const { city, state } = raw;
      const nickname = raw.nickname.trim() || null;
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
          { fullName: raw.fullName, nickname, city, state, roles, hasAthleteRole: true, updatedAt: serverTimestamp() },
          { merge: true },
        ),
        setDoc(
          doc(this.firestore, 'athlete_profiles', uid),
          {
            fullName: raw.fullName,
            displayName: raw.fullName,
            city,
            state,
            bio,
            publicProfileId,
            publicProfileEnabled,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      ]);

      this.profileState.update((current) => ({
        ...current,
        fullName: raw.fullName,
        nickname: nickname ?? '',
        city,
        state,
        bio,
        publicProfileId,
        publicProfileEnabled,
      }));
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

  protected startChangePhone(): void {
    this.changingPhone.set(true);
  }

  protected cancelChangePhone(): void {
    this.changingPhone.set(false);
  }

  /** `confirmPhoneVerification` já gravou phoneNumber/phoneVerified em
   *  users/{uid} via Admin SDK — aqui só refletimos o estado na UI. */
  protected onPhoneVerified(event: { phoneNumber: string }): void {
    this.profileState.update((current) => ({ ...current, phoneNumber: event.phoneNumber, phoneVerified: true }));
    this.changingPhone.set(false);
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

  protected startLogout(): void {
    this.logoutConfirming.set(true);
  }

  protected cancelLogout(): void {
    this.logoutConfirming.set(false);
  }

  protected async confirmLogout(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.signOutUser();
      await this.router.navigateByUrl('/');
    } finally {
      this.signingOut.set(false);
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

      this.sportLevels.set(buildSportLevels(userData));

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
        nickname: readString(userData, ['nickname']) ?? '',
        city: readString(profileData, ['city']) ?? readString(userData, ['city']) ?? '',
        state: readString(profileData, ['state']) ?? readString(userData, ['state']) ?? '',
        phoneNumber: readString(userData, ['phoneNumber']) ?? '',
        phoneVerified: userData?.['phoneVerified'] === true,
        bio: readString(profileData, ['bio']) ?? '',
        publicProfileId: readString(profileData, ['publicProfileId', 'athleteId', 'profileIdentifier']),
        // Só false quando o doc já existe e diz explicitamente false (ex.: privacidade desativada
        // no app) — um doc novo ou sem esse campo deve poder ser encontrado pelo perfil público.
        publicProfileEnabled: profileData?.['publicProfileEnabled'] !== false,
        profilePhotoUrl: readString(userData, ['profilePhotoUrl']),
        coverPhotoUrl: readString(userData, ['coverPhotoUrl']),
        // `users/{uid}` é a fonte; o espelho `public_profiles` é derivado por CF.
        highlightPhotoUrls: readStringArray(userData, 'highlightPhotoUrls').slice(0, MAX_HIGHLIGHT_PHOTOS),
      });
      this.referredBy.set(readString(userData, ['referredBy']));
    } catch {
      this.saveError.set('Não foi possível carregar seu perfil agora.');
    } finally {
      this.loading.set(false);
    }
  }
}
