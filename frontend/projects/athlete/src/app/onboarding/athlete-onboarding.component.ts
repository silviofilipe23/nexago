import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AuthShellComponent } from '../auth/ui/auth-shell.component';
import { isAllowedAvatarFile, prepareAvatarJpeg, uploadAthleteAvatar } from '../data/athlete-avatar-upload';
import { athleteStorage } from '../data/storage';

type ObStep = 1 | 2 | 3 | 4 | 5;

export interface SportOption {
  code: string;
  label: string;
  icon: 'ball' | 'racket' | 'running' | 'plus';
}

export interface LevelOption {
  code: string;
  label: string;
  desc: string;
}

export interface GoalOption {
  code: string;
  label: string;
}

/** Mesmos códigos usados pelo app Flutter (athlete_firestore_codes.dart), ordem idêntica. */
const SPORTS: SportOption[] = [
  { code: 'VOLEI_PRAIA', label: 'Vôlei de praia', icon: 'ball' },
  { code: 'VOLEI_QUADRA', label: 'Vôlei de quadra', icon: 'ball' },
  { code: 'FUTEBOL', label: 'Futebol', icon: 'ball' },
  { code: 'BASQUETE', label: 'Basquete', icon: 'ball' },
  { code: 'TENIS', label: 'Tênis', icon: 'racket' },
  { code: 'BEACH_TENNIS', label: 'Beach tennis', icon: 'racket' },
  { code: 'CORRIDA', label: 'Corrida', icon: 'running' },
  { code: 'OUTROS', label: 'Outros', icon: 'plus' },
];

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

function isValidWhatsApp(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) return true;
  return digits.length >= 12 && digits.length <= 13 && digits.startsWith('55');
}

/** `dd/mm/aaaa` → `YYYY-MM-DD` (mesma convenção do Flutter, athlete_firestore_codes.dart). */
function birthDateBrToIso(raw: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

@Component({
  selector: 'app-athlete-onboarding',
  standalone: true,
  imports: [RouterLink, AuthShellComponent],
  templateUrl: './athlete-onboarding.component.html',
  styleUrl: './athlete-onboarding.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteOnboardingComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly sports = SPORTS;
  protected readonly levels = LEVELS;
  protected readonly goals = GOALS;
  protected readonly genders = GENDERS;

  protected readonly step = signal<ObStep>(1);

  protected readonly selectedSportCode = signal<string>(SPORTS[0]!.code);
  protected readonly selectedLevelCode = signal<string>(DEFAULT_LEVEL);
  protected readonly selectedGoalCodes = signal<ReadonlySet<string>>(
    new Set(['JOGAR_DIVERSAO', 'COMPETIR']),
  );

  protected readonly selectedSport = computed(
    () => this.sports.find((s) => s.code === this.selectedSportCode()) ?? this.sports[0]!,
  );

  protected readonly name = signal(this.initialName());
  protected readonly nickname = signal('');
  protected readonly phone = signal('');
  protected readonly birthDateInput = signal('');
  protected readonly gender = signal<string | null>(null);
  protected readonly touched = signal(false);

  protected readonly notice = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  /** Arquivo escolhido (ainda não enviado); preview local via object URL. */
  protected readonly photoFile = signal<File | null>(null);
  protected readonly photoPreviewUrl = signal<string | null>(null);
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');
  private photoObjectUrl: string | null = null;

  protected readonly nameError = computed(() =>
    this.touched() && this.name().trim().length < 2 ? 'Obrigatório' : null,
  );
  protected readonly phoneError = computed(() =>
    this.touched() && !isValidWhatsApp(this.phone()) ? 'Informe um WhatsApp válido' : null,
  );
  protected readonly birthDateError = computed(() =>
    this.touched() && !birthDateBrToIso(this.birthDateInput()) ? 'Data inválida (dd/mm/aaaa)' : null,
  );
  protected readonly genderError = computed(() => (this.touched() && !this.gender() ? 'Obrigatório' : null));

  protected readonly profileFormValid = computed(
    () =>
      this.name().trim().length >= 2 &&
      isValidWhatsApp(this.phone()) &&
      birthDateBrToIso(this.birthDateInput()) != null &&
      this.gender() != null,
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
    const photoFile = this.photoFile();

    this.submitting.set(true);
    this.submitError.set(null);

    try {
      // As rules exigem `roles` no create (`roles.hasOnly(['athlete']) && size() > 0`) e
      // imutável no update — união com o que já existir, preservando ordem (mesmo padrão do
      // app mobile em athlete_profile_repository.dart:74-82), nunca só `['athlete']` fixo.
      const userDocRef = doc(this.firestore, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      const existingRoles = userSnap.exists() ? userSnap.data()?.['roles'] : null;
      const roles = Array.from(
        new Set([
          ...(Array.isArray(existingRoles) ? existingRoles.filter((r): r is string => typeof r === 'string') : []),
          'athlete',
        ]),
      );

      await Promise.all([
        setDoc(
          userDocRef,
          {
            fullName,
            nickname: this.nickname().trim() || null,
            phoneNumber: this.phone().trim(),
            gender: this.gender(),
            birthDate: isoBirthDate,
            goals: Array.from(this.selectedGoalCodes()),
            sportOnboarding: {
              version: 1,
              primarySportId: sportCode,
              levelsBySport: { [sportCode]: levelCode },
              completedAt: serverTimestamp(),
            },
            roles,
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
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      ]);

      // Foto opcional: perfil já salvo; falha no Storage não bloqueia o onboarding
      // (mesmo contrato do app em athlete_onboarding_providers.dart).
      if (photoFile) {
        try {
          const jpeg = await prepareAvatarJpeg(photoFile);
          const url = await uploadAthleteAvatar(athleteStorage(), uid, jpeg);
          await setDoc(userDocRef, { profilePhotoUrl: url, updatedAt: serverTimestamp() }, { merge: true });
        } catch (photoErr) {
          if (!environment.production) {
            console.error('[onboarding] avatar upload error', photoErr);
          }
          this.showNotice('Cadastro concluído. A foto não foi enviada — você pode adicionar depois no perfil.');
        }
      }

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

  protected finish(): void {
    void this.router.navigateByUrl('/painel');
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}
