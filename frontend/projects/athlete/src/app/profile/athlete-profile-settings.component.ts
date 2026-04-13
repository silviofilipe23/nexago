import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, updateProfile } from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { startWith } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';

type ProfileStepId = 'identity' | 'story' | 'compatibility' | 'reputation';
type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface AthleteProfileFormValue {
  coverPhotoUrl: string;
  profilePhotoUrl: string;
  fullName: string;
  publicHandle: string;
  headline: string;
  bio: string;
  city: string;
  state: string;
  country: string;
  primarySport: string;
  sports: string[];
  level: string;
  category: string;
  favoritePosition: string;
  dominantHand: string;
  heightCm: string;
  preferredCourtSide: string;
  partnerName: string;
  instagram: string;
  availabilityNote: string;
  availabilitySlots: string[];
  goals: string;
  achievements: string;
  lookingForPartner: boolean;
  openToTournaments: boolean;
  openToCasualGames: boolean;
}

interface PublicProfilePreview {
  coverPhotoUrl: string | null;
  profilePhotoUrl: string | null;
  fullName: string;
  handle: string;
  headline: string;
  bio: string;
  location: string;
  sports: string[];
  level: string;
  category: string;
  favoritePosition: string;
  dominantHand: string | null;
  heightLabel: string | null;
  preferredCourtSide: string | null;
  partnerName: string | null;
  instagram: string | null;
  instagramUrl: string | null;
  goals: string | null;
  achievements: string[];
  availabilityNote: string | null;
  availabilitySlots: string[];
  lookingForPartner: boolean;
  openToTournaments: boolean;
  openToCasualGames: boolean;
}

interface ProfileStepDefinition {
  id: ProfileStepId;
  title: string;
  subtitle: string;
  shortLabel: string;
}

interface StepProgress {
  value: number;
  complete: boolean;
}

interface CompletionMetric {
  label: string;
  done: boolean;
  weight: number;
}

interface SuggestionChip {
  label: string;
  active: boolean;
}

const PROFILE_STEPS: readonly ProfileStepDefinition[] = [
  {
    id: 'identity',
    title: 'Base publica',
    subtitle: 'Nome, fotos, esporte principal e cidade para existir bem no hub.',
    shortLabel: 'Base',
  },
  {
    id: 'story',
    title: 'Narrativa',
    subtitle: 'Headline, bio e objetivo para transformar cadastro em reputacao.',
    shortLabel: 'Narrativa',
  },
  {
    id: 'compatibility',
    title: 'Compatibilidade',
    subtitle: 'Dados que ajudam a matchar dupla, treino, torneio e estilo de jogo.',
    shortLabel: 'Matching',
  },
  {
    id: 'reputation',
    title: 'Prova social',
    subtitle: 'Destaques, agenda e sinais que deixam seu perfil confiavel.',
    shortLabel: 'Reputacao',
  },
] as const;

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

const LEVEL_OPTIONS = [
  'Iniciante',
  'Intermediario',
  'Avancado',
  'Pro / A',
  'Amador competitivo',
] as const;

const DOMINANT_HAND_OPTIONS = ['Destro', 'Canhoto', 'Ambidestro'] as const;
const COURT_SIDE_OPTIONS = ['Direita', 'Esquerda', 'Ambos'] as const;

const AVAILABILITY_OPTIONS = [
  { id: 'week_morning', label: 'Semana cedo' },
  { id: 'week_night', label: 'Semana a noite' },
  { id: 'lunch_break', label: 'Almoco' },
  { id: 'weekend_morning', label: 'Fim de semana cedo' },
  { id: 'weekend_afternoon', label: 'Fim de semana tarde' },
  { id: 'travel_ready', label: 'Topa viajar' },
] as const;

const LOCAL_PROFILE_DRAFT_PREFIX = 'nexago-athlete-profile-draft';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUTO_SAVE_DEBOUNCE_MS = 850;

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function createStorage(): FirebaseStorage | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getStorage(app);
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
  if (!local) {
    return 'Atleta NexaGO';
  }
  return titleCase(local);
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
}

function buildPublicProfileId(handle: string, uidLike: string | null | undefined): string {
  const base = slugify(handle) || 'atleta';
  const suffix = uidLike ? slugify(uidLike).slice(0, 8) : '';
  return suffix ? `${base}-${suffix}` : base;
}

function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqStrings(
      value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()),
    );
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return uniqStrings(value.split(',').map((item) => item.trim()));
  }
  return [];
}

function parseLineList(input: string): string[] {
  return uniqStrings(
    input
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function readString(data: DocumentData | null | undefined, keys: readonly string[]): string {
  if (!data) {
    return '';
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function readBoolean(data: DocumentData | null | undefined, keys: readonly string[], fallback = false): boolean {
  if (!data) {
    return fallback;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return fallback;
}

function readNumberString(data: DocumentData | null | undefined, keys: readonly string[]): string {
  if (!data) {
    return '';
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.round(value));
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function readStringArray(data: DocumentData | null | undefined, keys: readonly string[]): string[] {
  if (!data) {
    return [];
  }
  for (const key of keys) {
    const list = coerceStringArray(data[key]);
    if (list.length > 0) {
      return list;
    }
  }
  return [];
}

function draftStorageKey(source: string): string {
  return `${LOCAL_PROFILE_DRAFT_PREFIX}:${slugify(source)}`;
}

function emptyProfile(defaultName: string): AthleteProfileFormValue {
  return {
    coverPhotoUrl: '',
    profilePhotoUrl: '',
    fullName: defaultName,
    publicHandle: slugify(defaultName),
    headline: 'Atleta ativo no hub NexaGO',
    bio: '',
    city: '',
    state: '',
    country: 'Brasil',
    primarySport: 'Volei de praia',
    sports: [],
    level: 'Intermediario',
    category: '',
    favoritePosition: '',
    dominantHand: '',
    heightCm: '',
    preferredCourtSide: '',
    partnerName: '',
    instagram: '',
    availabilityNote: '',
    availabilitySlots: [],
    goals: '',
    achievements: '',
    lookingForPartner: true,
    openToTournaments: true,
    openToCasualGames: true,
  };
}

function mergeProfileForm(
  fallbackName: string,
  userDoc: DocumentData | null,
  profileDoc: DocumentData | null,
): AthleteProfileFormValue {
  const fullName =
    readString(profileDoc, ['fullName', 'displayName', 'name']) ||
    readString(userDoc, ['fullName', 'displayName', 'name']) ||
    fallbackName;
  const primarySport = readString(profileDoc, ['primarySport']) || 'Volei de praia';
  const allSports = readStringArray(profileDoc, ['sports']).filter((sport) => sport !== primarySport);

  return {
    coverPhotoUrl: readString(profileDoc, ['coverPhotoUrl', 'coverImageUrl', 'bannerUrl']),
    profilePhotoUrl:
      readString(profileDoc, ['profilePhotoUrl', 'photoURL', 'avatarUrl', 'avatar']) ||
      readString(userDoc, ['profilePhotoUrl', 'photoURL', 'avatarUrl', 'avatar']),
    fullName,
    publicHandle:
      readString(profileDoc, ['publicHandle', 'slug', 'username']) || slugify(fullName) || 'atleta-nexago',
    headline: readString(profileDoc, ['headline', 'publicHeadline']) || 'Atleta ativo no hub NexaGO',
    bio: readString(profileDoc, ['bio', 'about']),
    city: readString(profileDoc, ['city', 'cidade']) || readString(userDoc, ['city', 'cidade']),
    state: readString(profileDoc, ['state', 'uf']) || readString(userDoc, ['state', 'uf']),
    country: readString(profileDoc, ['country']) || 'Brasil',
    primarySport,
    sports: allSports,
    level:
      readString(profileDoc, ['level', 'nivel', 'category']) ||
      readString(userDoc, ['level', 'nivel']) ||
      'Intermediario',
    category: readString(profileDoc, ['categoryLabel', 'category', 'categoria']),
    favoritePosition: readString(profileDoc, ['favoritePosition', 'position']),
    dominantHand: readString(profileDoc, ['dominantHand']),
    heightCm: readNumberString(profileDoc, ['heightCm', 'height']),
    preferredCourtSide: readString(profileDoc, ['preferredCourtSide', 'courtSide']),
    partnerName: readString(profileDoc, ['favoritePartnerName', 'partnerName', 'duoPartnerName']),
    instagram: readString(profileDoc, ['instagram', 'instagramHandle']),
    availabilityNote: readString(profileDoc, ['availabilityNote', 'availability']),
    availabilitySlots: readStringArray(profileDoc, ['availabilitySlots']),
    goals: readString(profileDoc, ['goals', 'objective']),
    achievements: coerceStringArray(profileDoc?.['achievementHighlights']).join('\n'),
    lookingForPartner: readBoolean(profileDoc, ['lookingForPartner'], true),
    openToTournaments: readBoolean(profileDoc, ['openToTournaments'], true),
    openToCasualGames: readBoolean(profileDoc, ['openToCasualGames'], true),
  };
}

function mergeDraftIntoProfile(
  base: AthleteProfileFormValue,
  draft: Partial<AthleteProfileFormValue> | null,
): AthleteProfileFormValue {
  if (!draft) {
    return base;
  }

  return {
    ...base,
    ...draft,
    sports: coerceStringArray(draft['sports'] ?? base.sports),
    availabilitySlots: coerceStringArray(draft['availabilitySlots'] ?? base.availabilitySlots),
  };
}

function normalizeProfileForm(value: AthleteProfileFormValue): AthleteProfileFormValue {
  const asTrimmed = (input: unknown): string => (typeof input === 'string' ? input : String(input ?? '')).trim();
  return {
    ...value,
    coverPhotoUrl: asTrimmed(value.coverPhotoUrl),
    profilePhotoUrl: asTrimmed(value.profilePhotoUrl),
    fullName: asTrimmed(value.fullName),
    publicHandle: slugify(asTrimmed(value.publicHandle) || asTrimmed(value.fullName)) || 'atleta-nexago',
    headline: asTrimmed(value.headline),
    bio: asTrimmed(value.bio),
    city: asTrimmed(value.city),
    state: asTrimmed(value.state).toUpperCase().slice(0, 2),
    country: asTrimmed(value.country) || 'Brasil',
    primarySport: asTrimmed(value.primarySport),
    sports: uniqStrings(value.sports.map((sport) => sport.trim())).filter(
      (sport) => sport !== asTrimmed(value.primarySport),
    ),
    level: asTrimmed(value.level),
    category: asTrimmed(value.category),
    favoritePosition: asTrimmed(value.favoritePosition),
    dominantHand: asTrimmed(value.dominantHand),
    heightCm: asTrimmed(value.heightCm),
    preferredCourtSide: asTrimmed(value.preferredCourtSide),
    partnerName: asTrimmed(value.partnerName),
    instagram: asTrimmed(value.instagram).replace(/^@+/, ''),
    availabilityNote: asTrimmed(value.availabilityNote),
    availabilitySlots: uniqStrings(value.availabilitySlots.map((slot) => slot.trim())),
    goals: asTrimmed(value.goals),
    achievements: parseLineList(value.achievements).join('\n'),
  };
}

function buildPreview(value: AthleteProfileFormValue, fallbackName: string): PublicProfilePreview {
  const normalized = normalizeProfileForm(value);
  const fullName = normalized.fullName || fallbackName;
  const handle = slugify(normalized.publicHandle || fullName) || 'atleta-nexago';
  const allSports = uniqStrings([normalized.primarySport, ...normalized.sports]);
  const instagram = normalized.instagram || null;
  const heightNumber = Number(normalized.heightCm);

  return {
    coverPhotoUrl: normalized.coverPhotoUrl || null,
    profilePhotoUrl: normalized.profilePhotoUrl || null,
    fullName,
    handle,
    headline: normalized.headline || 'Atleta ativo no hub NexaGO',
    bio:
      normalized.bio ||
      'Use este espaco para contar estilo de jogo, energia competitiva e como gosta de se conectar com a comunidade.',
    location: [normalized.city, normalized.state].filter((part) => part.length > 0).join(', '),
    sports: allSports,
    level: normalized.level,
    category: normalized.category,
    favoritePosition: normalized.favoritePosition,
    dominantHand: normalized.dominantHand || null,
    heightLabel:
      Number.isFinite(heightNumber) && heightNumber > 0 ? `${Math.round(heightNumber)} cm` : null,
    preferredCourtSide: normalized.preferredCourtSide || null,
    partnerName: normalized.partnerName || null,
    instagram,
    instagramUrl: instagram ? `https://instagram.com/${instagram}` : null,
    goals: normalized.goals || null,
    achievements: parseLineList(normalized.achievements),
    availabilityNote: normalized.availabilityNote || null,
    availabilitySlots: normalized.availabilitySlots,
    lookingForPartner: normalized.lookingForPartner,
    openToTournaments: normalized.openToTournaments,
    openToCasualGames: normalized.openToCasualGames,
  };
}

function relativeTimeLabel(value: Date | null): string {
  if (!value) {
    return 'agora';
  }
  const diffSeconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000));
  if (diffSeconds < 10) {
    return 'agora';
  }
  if (diffSeconds < 60) {
    return `ha ${diffSeconds}s`;
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `ha ${diffMinutes} min`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  return `ha ${diffHours} h`;
}

@Component({
  selector: 'app-athlete-profile-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './athlete-profile-settings.component.html',
  styleUrl: './athlete-profile-settings.component.scss',
})
export class AthleteProfileSettingsComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();
  private readonly storage = createStorage();

  protected readonly steps = PROFILE_STEPS;
  protected readonly sportOptions = PRIMARY_SPORT_OPTIONS;
  protected readonly levelOptions = LEVEL_OPTIONS;
  protected readonly dominantHandOptions = DOMINANT_HAND_OPTIONS;
  protected readonly courtSideOptions = COURT_SIDE_OPTIONS;
  protected readonly availabilityOptions = AVAILABILITY_OPTIONS;

  protected readonly currentStep = signal<ProfileStepId>('identity');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly coverUploading = signal(false);
  protected readonly profileUploading = signal(false);
  protected readonly coverUploadError = signal<string | null>(null);
  protected readonly profileUploadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal<string | null>(null);
  protected readonly autoSaveState = signal<AutoSaveState>('idle');
  protected readonly lastAutoSavedAt = signal<Date | null>(null);
  protected readonly customSportInput = signal('');
  protected readonly copyFeedback = signal<string | null>(null);
  private readonly loadedSource = signal<string | null>(null);
  private readonly persistedPublicProfileId = signal<string | null>(null);

  protected readonly form = this.fb.group({
    coverPhotoUrl: this.fb.nonNullable.control(''),
    profilePhotoUrl: this.fb.nonNullable.control(''),
    fullName: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3)]),
    publicHandle: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(3),
      Validators.pattern(/^[a-z0-9-]+$/),
    ]),
    headline: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(8),
      Validators.maxLength(120),
    ]),
    bio: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(20),
      Validators.maxLength(500),
    ]),
    city: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
    state: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(2),
    ]),
    country: this.fb.nonNullable.control('Brasil', [Validators.required]),
    primarySport: this.fb.nonNullable.control('Volei de praia', [Validators.required]),
    sports: this.fb.nonNullable.control<string[]>([]),
    level: this.fb.nonNullable.control('Intermediario', [Validators.required]),
    category: this.fb.nonNullable.control(''),
    favoritePosition: this.fb.nonNullable.control(''),
    dominantHand: this.fb.nonNullable.control(''),
    heightCm: this.fb.nonNullable.control(''),
    preferredCourtSide: this.fb.nonNullable.control(''),
    partnerName: this.fb.nonNullable.control(''),
    instagram: this.fb.nonNullable.control(''),
    availabilityNote: this.fb.nonNullable.control(''),
    availabilitySlots: this.fb.nonNullable.control<string[]>([]),
    goals: this.fb.nonNullable.control(''),
    achievements: this.fb.nonNullable.control(''),
    lookingForPartner: this.fb.nonNullable.control(true),
    openToTournaments: this.fb.nonNullable.control(true),
    openToCasualGames: this.fb.nonNullable.control(true),
  });

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly canPersistRemotely = computed(
    () => this.auth.user() != null && this.firestore != null,
  );
  protected readonly canUploadImages = computed(
    () => this.auth.user() != null && this.storage != null,
  );
  protected readonly isPreviewMode = computed(() => !this.canPersistRemotely());
  protected readonly draftSource = computed(() => this.auth.user()?.uid ?? this.auth.devEmail() ?? null);
  protected readonly accountLabel = computed(() => {
    const user = this.auth.user();
    if (user?.displayName?.trim()) {
      return user.displayName.trim();
    }
    if (user?.email?.trim()) {
      return nameFromEmail(user.email);
    }
    const devEmail = this.auth.devEmail();
    if (devEmail?.trim()) {
      return nameFromEmail(devEmail);
    }
    return 'Atleta NexaGO';
  });
  protected readonly normalizedValue = computed<AthleteProfileFormValue>(() =>
    normalizeProfileForm({
      ...emptyProfile(this.accountLabel()),
      ...this.formValue(),
    }),
  );
  protected readonly preview = computed<PublicProfilePreview>(() =>
    buildPreview(this.normalizedValue(), this.accountLabel()),
  );
  protected readonly selectedSports = computed(() => this.normalizedValue().sports);
  protected readonly selectedAvailability = computed(() => this.normalizedValue().availabilitySlots);
  protected readonly headlineCount = computed(() => this.normalizedValue().headline.length);
  protected readonly bioCount = computed(() => this.normalizedValue().bio.length);
  protected readonly profileMetrics = computed<CompletionMetric[]>(() => {
    const profile = this.preview();
    return [
      { label: 'Foto de perfil', done: !!profile.profilePhotoUrl, weight: 12 },
      { label: 'Foto de capa', done: !!profile.coverPhotoUrl, weight: 8 },
      { label: 'Nome esportivo', done: profile.fullName.length >= 3, weight: 8 },
      { label: 'Headline', done: profile.headline.length >= 12, weight: 10 },
      { label: 'Bio', done: profile.bio.length >= 40, weight: 14 },
      { label: 'Cidade e UF', done: profile.location.length > 0, weight: 10 },
      { label: 'Esporte e nivel', done: profile.sports.length > 0 && profile.level.length > 0, weight: 10 },
      { label: 'Compatibilidade', done: !!(profile.dominantHand || profile.preferredCourtSide || profile.heightLabel), weight: 10 },
      { label: 'Agenda estruturada', done: profile.availabilitySlots.length > 0, weight: 8 },
      { label: 'Objetivo ou destaques', done: !!(profile.goals || profile.achievements.length > 0), weight: 10 },
    ];
  });
  protected readonly completion = computed(() => {
    const metrics = this.profileMetrics();
    const total = metrics.reduce((sum, metric) => sum + metric.weight, 0);
    const done = metrics.filter((metric) => metric.done).reduce((sum, metric) => sum + metric.weight, 0);
    return Math.round((done / total) * 100);
  });
  protected readonly strengthLabel = computed(() => {
    const score = this.completion();
    if (score >= 85) {
      return 'Perfil forte';
    }
    if (score >= 60) {
      return 'Perfil promissor';
    }
    return 'Perfil em construcao';
  });
  protected readonly discoverabilityHint = computed(() => {
    const score = this.completion();
    if (score >= 85) {
      return 'Seu perfil ja transmite confianca, contexto esportivo e boa chance de convite.';
    }
    if (score >= 60) {
      return 'Voce ja tem uma base boa. Mais alguns detalhes e esse perfil fica muito mais encontrado.';
    }
    return 'Os primeiros campos certos ja aumentam muito a clareza do seu perfil dentro do hub.';
  });
  protected readonly publicProfileUrl = computed(() => {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    const source = this.draftSource();
    const identifier = this.persistedPublicProfileId() || buildPublicProfileId(this.preview().handle, source);
    return `${origin}/atletas/${identifier}`;
  });
  protected readonly autoSaveLabel = computed(() => {
    const state = this.autoSaveState();
    if (state === 'saving') {
      return 'Salvando rascunho automaticamente...';
    }
    if (state === 'saved') {
      return `Rascunho salvo automaticamente ${relativeTimeLabel(this.lastAutoSavedAt())}.`;
    }
    if (state === 'error') {
      return 'Nao foi possivel salvar o rascunho local agora.';
    }
    return this.isPreviewMode()
      ? 'Modo preview com rascunho local.'
      : 'Rascunho local ativo enquanto voce edita.';
  });
  protected readonly currentStepIndex = computed(() =>
    this.steps.findIndex((step) => step.id === this.currentStep()),
  );
  protected readonly isFirstStep = computed(() => this.currentStepIndex() === 0);
  protected readonly isLastStep = computed(() => this.currentStepIndex() === this.steps.length - 1);
  protected readonly currentStepMeta = computed(
    () => this.steps[this.currentStepIndex()] ?? this.steps[0]!,
  );
  protected readonly stepProgress = computed<Record<ProfileStepId, StepProgress>>(() => {
    const profile = this.preview();
    const value = this.normalizedValue();

    const scoreFrom = (checks: boolean[]): StepProgress => {
      const done = checks.filter(Boolean).length;
      const progress = Math.round((done / checks.length) * 100);
      return { value: progress, complete: progress >= 100 };
    };

    return {
      identity: scoreFrom([
        profile.fullName.length >= 3,
        !!profile.profilePhotoUrl,
        value.primarySport.length > 0,
        value.city.length > 0,
        value.state.length === 2,
      ]),
      story: scoreFrom([
        profile.headline.length >= 12,
        profile.bio.length >= 40,
        !!profile.goals,
      ]),
      compatibility: scoreFrom([
        value.level.length > 0,
        profile.sports.length > 0,
        value.availabilitySlots.length > 0,
        !!(value.dominantHand || value.preferredCourtSide || value.heightCm),
      ]),
      reputation: scoreFrom([
        value.achievements.length > 0,
        !!(value.partnerName || value.instagram),
        value.lookingForPartner || value.openToCasualGames || value.openToTournaments,
      ]),
    };
  });
  protected readonly sportChips = computed<SuggestionChip[]>(() => {
    const primary = this.normalizedValue().primarySport;
    const extra = this.selectedSports();
    return this.sportOptions.map((sport) => ({
      label: sport,
      active: sport === primary || extra.includes(sport),
    }));
  });

  constructor() {
    effect(() => {
      if (!this.auth.authReady()) {
        return;
      }

      const user = this.auth.user();
      const devEmail = this.auth.devEmail();
      const source = user?.uid ?? (devEmail ? `preview:${devEmail}` : null);

      if (!source || this.loadedSource() === source) {
        return;
      }

      this.loadedSource.set(source);
      this.saveError.set(null);
      this.saveSuccess.set(null);
      this.copyFeedback.set(null);

      if (user) {
        void this.loadRemoteProfile(source);
        return;
      }

      if (devEmail) {
        this.loadDraftProfile(devEmail);
      }
    });

    effect(() => {
      const primary = this.normalizedValue().primarySport;
      const sports = this.selectedSports();
      if (sports.includes(primary)) {
        this.form.controls.sports.setValue(sports.filter((sport) => sport !== primary));
      }
    });

    effect((onCleanup) => {
      const source = this.draftSource();
      const value = this.normalizedValue();
      if (!source || this.loading() || !this.form.dirty) {
        return;
      }

      this.autoSaveState.set('saving');
      const timer = globalThis.setTimeout(() => {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(draftStorageKey(source), JSON.stringify(value));
          }
          this.lastAutoSavedAt.set(new Date());
          this.autoSaveState.set('saved');
        } catch {
          this.autoSaveState.set('error');
        }
      }, AUTO_SAVE_DEBOUNCE_MS);

      onCleanup(() => globalThis.clearTimeout(timer));
    });
  }

  private patchForm(value: AthleteProfileFormValue): void {
    this.form.reset(value);
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.autoSaveState.set('idle');
  }

  private readDraft(source: string): Partial<AthleteProfileFormValue> | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(draftStorageKey(source));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as Partial<AthleteProfileFormValue>;
    } catch {
      return null;
    }
  }

  private async loadRemoteProfile(source: string): Promise<void> {
    const user = this.auth.user();
    if (!user || !this.firestore) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);

    try {
      const [userSnap, profileSnap] = await Promise.all([
        getDoc(doc(this.firestore, 'users', user.uid)),
        getDoc(doc(this.firestore, 'athlete_profiles', user.uid)),
      ]);

      const remote = mergeProfileForm(
        user.displayName?.trim() || nameFromEmail(user.email),
        userSnap.exists() ? userSnap.data() : null,
        profileSnap.exists() ? profileSnap.data() : null,
      );
      const remoteProfileId = readString(
        profileSnap.exists() ? profileSnap.data() : null,
        ['publicProfileId', 'athleteId', 'profileIdentifier'],
      );
      this.persistedPublicProfileId.set(remoteProfileId || null);
      const draft = this.readDraft(source);
      this.patchForm(mergeDraftIntoProfile(remote, draft));
    } catch {
      this.saveError.set('Nao foi possivel carregar seu perfil agora.');
    } finally {
      this.loading.set(false);
    }
  }

  private loadDraftProfile(source: string): void {
    this.loading.set(true);
    try {
      const base = emptyProfile(nameFromEmail(source));
      const draft = this.readDraft(source);
      this.persistedPublicProfileId.set(null);
      this.patchForm(mergeDraftIntoProfile(base, draft));
    } finally {
      this.loading.set(false);
    }
  }

  protected isStepActive(stepId: ProfileStepId): boolean {
    return this.currentStep() === stepId;
  }

  protected goToStep(stepId: ProfileStepId): void {
    this.currentStep.set(stepId);
  }

  protected nextStep(): void {
    if (this.isLastStep()) {
      return;
    }
    const nextIndex = this.currentStepIndex() + 1;
    const next = this.steps[nextIndex];
    if (next) {
      this.currentStep.set(next.id);
    }
  }

  protected previousStep(): void {
    if (this.isFirstStep()) {
      return;
    }
    const previousIndex = this.currentStepIndex() - 1;
    const previous = this.steps[previousIndex];
    if (previous) {
      this.currentStep.set(previous.id);
    }
  }

  protected suggestHandle(): void {
    const fullName = this.form.controls.fullName.value;
    this.form.controls.publicHandle.setValue(slugify(fullName) || 'atleta-nexago');
    this.form.controls.publicHandle.markAsDirty();
  }

  protected suggestHeadline(): void {
    const value = this.normalizedValue();
    const base = [value.primarySport, value.level, value.city]
      .filter((part) => part.length > 0)
      .join(' · ');
    const goal = value.goals ? `Focado em ${value.goals.toLowerCase()}` : 'Em busca de boas conexoes competitivas';
    this.form.controls.headline.setValue(`${base || 'Atleta multi-esportes'} · ${goal}`);
    this.form.controls.headline.markAsDirty();
  }

  protected suggestBio(): void {
    const value = this.normalizedValue();
    const city = value.city ? `em ${value.city}` : 'na comunidade NexaGO';
    const sports = uniqStrings([value.primarySport, ...value.sports]).join(', ');
    const style = value.favoritePosition ? ` Meu estilo puxa para ${value.favoritePosition.toLowerCase()}.` : '';
    const goal = value.goals ? ` Busco ${value.goals.toLowerCase()}.` : '';
    const bio =
      `Atleta de ${sports || 'esportes de raquete e areia'} ${city}, com nivel ${value.level.toLowerCase()}.` +
      `${style}${goal} Aberto para jogos, treinos e novas conexoes que facam sentido.`;
    this.form.controls.bio.setValue(bio.trim());
    this.form.controls.bio.markAsDirty();
  }

  protected normalizeState(): void {
    const current = this.form.controls.state.value.trim().toUpperCase().slice(0, 2);
    this.form.controls.state.setValue(current);
  }

  protected hasRequiredError(
    fieldName:
      | 'fullName'
      | 'publicHandle'
      | 'headline'
      | 'bio'
      | 'city'
      | 'state'
      | 'country'
      | 'primarySport'
      | 'level',
  ): boolean {
    const control = this.form.controls[fieldName];
    return control.hasError('required') && (control.touched || control.dirty);
  }

  protected onCustomSportInput(value: string): void {
    this.customSportInput.set(value);
  }

  protected toggleSport(sport: string): void {
    const primary = this.normalizedValue().primarySport;
    if (sport === primary) {
      return;
    }
    const current = this.selectedSports();
    if (current.includes(sport)) {
      this.form.controls.sports.setValue(current.filter((item) => item !== sport));
      return;
    }
    this.form.controls.sports.setValue([...current, sport]);
  }

  protected addCustomSport(rawValue: string): void {
    const sport = titleCase(rawValue.trim());
    if (!sport) {
      return;
    }
    const current = this.selectedSports();
    const primary = this.normalizedValue().primarySport;
    if (sport !== primary && !current.includes(sport)) {
      this.form.controls.sports.setValue([...current, sport]);
    }
    this.customSportInput.set('');
  }

  protected removeSport(sport: string): void {
    this.form.controls.sports.setValue(this.selectedSports().filter((item) => item !== sport));
  }

  protected toggleAvailability(slotId: string): void {
    const current = this.selectedAvailability();
    if (current.includes(slotId)) {
      this.form.controls.availabilitySlots.setValue(current.filter((item) => item !== slotId));
      return;
    }
    this.form.controls.availabilitySlots.setValue([...current, slotId]);
  }

  protected availabilityLabel(slotId: string): string {
    return this.availabilityOptions.find((option) => option.id === slotId)?.label ?? slotId;
  }

  protected async copyProfileLink(): Promise<void> {
    this.copyFeedback.set(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(this.publicProfileUrl());
        this.copyFeedback.set('Link do perfil copiado.');
        return;
      }
      this.copyFeedback.set('Copie manualmente o link do perfil.');
    } catch {
      this.copyFeedback.set('Nao foi possivel copiar agora.');
    }
  }

  protected async onCoverFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    await this.uploadImageFile('cover', file);
    if (input) {
      input.value = '';
    }
  }

  protected async onProfileFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    await this.uploadImageFile('profile', file);
    if (input) {
      input.value = '';
    }
  }

  private async uploadImageFile(kind: 'cover' | 'profile', file: File | null): Promise<void> {
    const isCover = kind === 'cover';
    const setUploading = isCover ? this.coverUploading : this.profileUploading;
    const setError = isCover ? this.coverUploadError : this.profileUploadError;
    const targetControl = isCover ? this.form.controls.coverPhotoUrl : this.form.controls.profilePhotoUrl;
    const pathBase = isCover ? 'cover' : 'avatar';

    setError.set(null);
    if (!file) {
      return;
    }
    if (!this.canUploadImages()) {
      setError.set('Nao foi possivel enviar imagem agora. Verifique autenticacao e Firebase.');
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError.set('Formato invalido. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError.set('Arquivo maior que 5MB. Escolha uma imagem menor.');
      return;
    }

    const uid = this.auth.user()?.uid;
    if (!uid || !this.storage) {
      setError.set('Sessao invalida para upload. Entre novamente e tente.');
      return;
    }

    setUploading.set(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `athletes/${uid}/${pathBase}.${extension}`;
      const imageRef = ref(this.storage, storagePath);
      await uploadBytes(imageRef, file, {
        contentType: file.type,
        cacheControl: 'public,max-age=3600',
      });
      const downloadURL = await getDownloadURL(imageRef);
      targetControl.setValue(downloadURL);
      targetControl.markAsDirty();
      targetControl.markAsTouched();
    } catch {
      setError.set('Falha no upload da imagem. Tente novamente em instantes.');
    } finally {
      setUploading.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.saveError.set(null);
    this.saveSuccess.set(null);

    const normalized = this.normalizedValue();
    this.form.patchValue(normalized, { emitEvent: true });
    this.form.updateValueAndValidity({ emitEvent: false });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Preencha os campos principais do perfil publico antes de salvar.');
      return;
    }

    this.saving.set(true);

    try {
      const combinedSports = uniqStrings([normalized.primarySport, ...normalized.sports]);
      const achievementHighlights = parseLineList(normalized.achievements);
      const heightNumber = Number(normalized.heightCm);
      const publicProfileId =
        this.persistedPublicProfileId() ||
        buildPublicProfileId(normalized.publicHandle || normalized.fullName, this.auth.user()?.uid ?? this.draftSource());

      if (this.canPersistRemotely()) {
        const user = this.auth.user()!;
        const authInstance = getAuth(getApps()[0]!);

        if (authInstance.currentUser && authInstance.currentUser.uid === user.uid) {
          await updateProfile(authInstance.currentUser, {
            displayName: normalized.fullName,
            photoURL: normalized.profilePhotoUrl || null,
          });
        }

        await Promise.all([
          setDoc(
            doc(this.firestore!, 'users', user.uid),
            {
              uid: user.uid,
              email: user.email ?? null,
              fullName: normalized.fullName,
              nickname: normalized.publicHandle || null,
              profilePhotoUrl: normalized.profilePhotoUrl || null,
              coverPhotoUrl: normalized.coverPhotoUrl || null,
              instagram: normalized.instagram || null,
              city: normalized.city,
              state: normalized.state,
              publicProfileId,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
          setDoc(
            doc(this.firestore!, 'athlete_profiles', user.uid),
            {
              fullName: normalized.fullName,
              displayName: normalized.fullName,
              coverPhotoUrl: normalized.coverPhotoUrl || null,
              profilePhotoUrl: normalized.profilePhotoUrl || null,
              publicProfileId,
              publicHandle: normalized.publicHandle,
              publicProfileEnabled: true,
              headline: normalized.headline,
              bio: normalized.bio,
              city: normalized.city,
              state: normalized.state,
              country: normalized.country,
              primarySport: normalized.primarySport,
              sports: combinedSports,
              level: normalized.level,
              categoryLabel: normalized.category || null,
              favoritePosition: normalized.favoritePosition || null,
              dominantHand: normalized.dominantHand || null,
              heightCm:
                Number.isFinite(heightNumber) && heightNumber > 0
                  ? Math.round(heightNumber)
                  : null,
              preferredCourtSide: normalized.preferredCourtSide || null,
              favoritePartnerName: normalized.partnerName || null,
              instagram: normalized.instagram || null,
              availabilityNote: normalized.availabilityNote || null,
              availabilitySlots: normalized.availabilitySlots,
              goals: normalized.goals || null,
              achievementHighlights,
              lookingForPartner: normalized.lookingForPartner,
              openToTournaments: normalized.openToTournaments,
              openToCasualGames: normalized.openToCasualGames,
              completionScore: this.completion(),
              profileStrength: this.strengthLabel(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
        ]);

        this.saveSuccess.set('Perfil salvo no Firebase e pronto para o hub publico.');
        this.persistedPublicProfileId.set(publicProfileId);
      } else {
        const source = this.draftSource();
        if (source && typeof localStorage !== 'undefined') {
          localStorage.setItem(draftStorageKey(source), JSON.stringify(normalized));
        }
        this.saveSuccess.set('Rascunho salvo localmente para preview do perfil publico.');
      }

      this.lastAutoSavedAt.set(new Date());
      this.autoSaveState.set('saved');
      this.form.markAsPristine();
    } catch {
      this.saveError.set('Nao foi possivel salvar agora. Tente novamente em instantes.');
    } finally {
      this.saving.set(false);
    }
  }
}
