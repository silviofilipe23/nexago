import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import {
  arrayUnion,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import {
  LEVEL_OPTIONS,
  levelDisplayLabel,
  levelRankOf,
  type LevelOption,
} from '@nexago/levels';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import { SPORT_CATALOG, sportLabelForCode } from '../data/sport-catalog';
import { nameFromEmail } from './profile-format';

/** Esporte inscrito com o nível salvo (código cru + rank pra regra só-sobe). */
interface SportLevelRow {
  code: string;
  sportLabel: string;
  savedCode: string | null;
  savedRank: number | null;
  isPrimary: boolean;
  /** `sportOnboarding.levelLocked[code] === true` — janela de correção (Task 1–3
   *  do plano de calibração): sem lock o dono pode descer livremente neste
   *  esporte; o backend grava o lock na 1ª inscrição ativa. */
  locked: boolean;
}

const DOWNGRADE_BLOCKED_MESSAGE =
  'O nível só pode subir. Para reduzir, fale com o suporte.';

/** Guarda pura de `confirmAddSport()`/do botão "Adicionar esporte": um esporte
 *  novo só entra com um nível explícito e válido — nunca cai num default
 *  silencioso (`DEFAULT_LEVEL_CODE` foi removido daqui de propósito). Espelha
 *  `AthleteSportsLevelsDraft.addSport` do app Flutter (Task 4 deste plano). */
export function canAddSportWithLevel(levelCode: string | null): levelCode is string {
  return levelCode != null && levelRankOf(levelCode) != null;
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code: unknown }).code === 'permission-denied'
  );
}

/**
 * Esportes e níveis — paridade com a tela homônima do app Flutter.
 *
 * A ÚNICA escrita de nível é `users/{uid}.sportOnboarding.levelsBySport` com
 * merge por chave (nunca o mapa inteiro reconstruído de uma leitura velha —
 * evitaria corrida com o app/engine). A regra "só sobe" vale em 3 camadas: as
 * opções abaixo do nível salvo ficam travadas aqui, e o backend
 * (`athleteLevelsNotDowngraded` nas rules) recusa o update inteiro se algum
 * nível regredir — o `permission-denied` vira a mensagem de suporte.
 *
 * JANELA DE CORREÇÃO (Task 1–5 do plano de calibração): o ratchet acima só
 * vale por esporte DEPOIS que `sportOnboarding.levelLocked.{código}` vira
 * `true` (gravado só pelo backend, na 1ª inscrição ativa naquele esporte —
 * `functions/src/tournament-level-lock.ts`). Antes do lock (`row.locked ===
 * false`) o dono pode descer livremente — mesma regra que as
 * `firestore.rules` (`sportLevelNotLowered`) já aceitam do lado do servidor.
 */
@Component({
  selector: 'app-athlete-sports-levels',
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent, NxSpinnerComponent],
  templateUrl: './athlete-sports-levels.component.html',
  styleUrl: './athlete-sports-levels.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteSportsLevelsComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly levelOptions = LEVEL_OPTIONS;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly rows = signal<SportLevelRow[]>([]);
  /** Nível escolhido (ainda não confirmado) por esporte. */
  protected readonly pendingBySport = signal<Record<string, string>>({});
  protected readonly savingSport = signal<string | null>(null);
  protected readonly addingSport = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /** Esporte do catálogo em processo de ser adicionado (chip clicado, ainda
   *  sem nível confirmado) — `null` quando a lista de "+ esporte" está aberta. */
  protected readonly pendingNewSportCode = signal<string | null>(null);
  /** Nível escolhido pro esporte novo. Nasce `null` — sem default silencioso;
   *  `confirmAddSport()` não grava enquanto estiver vazio. */
  protected readonly pendingNewSportLevel = signal<string | null>(null);
  protected readonly canConfirmAddSport = computed(() =>
    canAddSportWithLevel(this.pendingNewSportLevel()),
  );

  private readonly profileName = signal<string | null>(null);

  protected readonly displayName = computed(
    () =>
      this.profileName() ??
      this.auth.user()?.displayName ??
      nameFromEmail(this.auth.user()?.email),
  );

  /** Esportes do catálogo ainda não inscritos (sem o coringa OUTROS). */
  protected readonly availableToAdd = computed(() => {
    const enrolled = new Set(this.rows().map((row) => row.code));
    return SPORT_CATALOG.filter(
      (entry) => entry.code !== 'OUTROS' && !enrolled.has(entry.code),
    );
  });

  constructor() {
    void this.load();
  }

  /** Ponte pro template — free function importada, não membro da classe. */
  protected readonly sportLabelForCode = sportLabelForCode;

  protected levelLabelOf(code: string | null): string {
    return levelDisplayLabel(code);
  }

  protected pendingFor(sportCode: string): string | null {
    return this.pendingBySport()[sportCode] ?? null;
  }

  /** Opção travada quando fica ABAIXO do nível salvo — só quando o esporte já
   *  passou pela janela de correção (`row.locked`). Pré-lock nada trava aqui;
   *  o backend aceita a descida (`sportLevelNotLowered` nas rules). */
  protected isOptionLocked(row: SportLevelRow, option: LevelOption): boolean {
    if (!row.locked || row.savedRank == null) return false;
    const optionRank = levelRankOf(option.code) ?? 0;
    return optionRank < row.savedRank;
  }

  protected isOptionSelected(row: SportLevelRow, option: LevelOption): boolean {
    const pending = this.pendingFor(row.code);
    if (pending != null) return pending === option.code;
    return row.savedRank != null && levelRankOf(row.savedCode) === levelRankOf(option.code);
  }

  protected selectLevel(row: SportLevelRow, option: LevelOption): void {
    this.notice.set(null);
    this.saveError.set(null);
    if (this.isOptionLocked(row, option)) {
      this.notice.set(DOWNGRADE_BLOCKED_MESSAGE);
      return;
    }
    const next = { ...this.pendingBySport() };
    if (row.savedRank != null && levelRankOf(option.code) === row.savedRank) {
      delete next[row.code];
    } else {
      next[row.code] = option.code;
    }
    this.pendingBySport.set(next);
  }

  protected cancelPending(sportCode: string): void {
    const next = { ...this.pendingBySport() };
    delete next[sportCode];
    this.pendingBySport.set(next);
    this.saveError.set(null);
  }

  protected async confirmLevel(row: SportLevelRow): Promise<void> {
    const uid = this.auth.user()?.uid;
    const pending = this.pendingFor(row.code);
    if (!uid || !this.firestore || !pending || this.savingSport() != null) {
      return;
    }
    this.savingSport.set(row.code);
    this.saveError.set(null);
    try {
      // Merge aninhado: só a chave deste esporte é tocada.
      await setDoc(
        doc(this.firestore, 'users', uid),
        {
          sportOnboarding: { levelsBySport: { [row.code]: pending } },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      this.rows.update((rows) =>
        rows.map((item) =>
          item.code === row.code
            ? { ...item, savedCode: pending, savedRank: levelRankOf(pending) }
            : item,
        ),
      );
      this.cancelPending(row.code);
      this.notice.set(
        `Nível de ${row.sportLabel} atualizado para ${levelDisplayLabel(pending)}.`,
      );
    } catch (error) {
      this.saveError.set(
        isPermissionDenied(error)
          ? DOWNGRADE_BLOCKED_MESSAGE
          : 'Não foi possível salvar agora. Tente novamente.',
      );
    } finally {
      this.savingSport.set(null);
    }
  }

  /** Abre o seletor de nível pro esporte clicado — nada é gravado ainda. */
  protected pickNewSport(sportCode: string): void {
    this.saveError.set(null);
    this.pendingNewSportCode.set(sportCode);
    this.pendingNewSportLevel.set(null);
  }

  protected selectNewSportLevel(levelCode: string): void {
    this.pendingNewSportLevel.set(levelCode);
  }

  protected cancelNewSport(): void {
    this.pendingNewSportCode.set(null);
    this.pendingNewSportLevel.set(null);
  }

  protected async confirmAddSport(): Promise<void> {
    const uid = this.auth.user()?.uid;
    const sportCode = this.pendingNewSportCode();
    const levelCode = this.pendingNewSportLevel();
    // Sem nível explícito e válido, nem tenta gravar — sem default silencioso.
    if (!uid || !this.firestore || !sportCode || !canAddSportWithLevel(levelCode) || this.addingSport()) {
      return;
    }
    this.addingSport.set(true);
    this.saveError.set(null);
    try {
      await setDoc(
        doc(this.firestore, 'users', uid),
        {
          sportOnboarding: {
            levelsBySport: { [sportCode]: levelCode },
            secondarySportIds: arrayUnion(sportCode),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      this.rows.update((rows) => [
        ...rows,
        {
          code: sportCode,
          sportLabel: sportLabelForCode(sportCode),
          savedCode: levelCode,
          savedRank: levelRankOf(levelCode),
          isPrimary: false,
          // Esporte recém-adicionado nunca tem lock — precisa da 1ª inscrição
          // ativa (backend) pra travar.
          locked: false,
        },
      ]);
      this.notice.set(
        `${sportLabelForCode(sportCode)} adicionado como ${levelDisplayLabel(levelCode)}.`,
      );
      this.cancelNewSport();
    } catch {
      this.saveError.set('Não foi possível adicionar o esporte. Tente novamente.');
    } finally {
      this.addingSport.set(false);
    }
  }

  private async load(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.firestore) {
      this.loading.set(false);
      this.loadError.set('Faça login novamente para gerenciar seus esportes.');
      return;
    }
    try {
      const snap = await getDoc(doc(this.firestore, 'users', uid));
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      this.profileName.set(
        typeof data['fullName'] === 'string' ? data['fullName'] : null,
      );

      const onboarding = (data['sportOnboarding'] ?? {}) as Record<string, unknown>;
      const primary =
        typeof onboarding['primarySportId'] === 'string'
          ? onboarding['primarySportId']
          : null;
      const secondaries = Array.isArray(onboarding['secondarySportIds'])
        ? (onboarding['secondarySportIds'] as unknown[]).filter(
            (item): item is string => typeof item === 'string',
          )
        : [];
      const levels = (onboarding['levelsBySport'] ?? {}) as Record<string, unknown>;
      const legacyLevel =
        typeof data['level'] === 'string' ? (data['level'] as string) : null;
      // Janela de correção: só o backend escreve isto (1ª inscrição ativa no
      // esporte) — o dono nunca grava a própria chave.
      const lockedBySport = (onboarding['levelLocked'] ?? {}) as Record<string, unknown>;

      const codes = Array.from(
        new Set([primary, ...secondaries].filter((code): code is string => !!code)),
      );
      this.rows.set(
        codes.map((code) => {
          const raw = typeof levels[code] === 'string' ? (levels[code] as string) : null;
          // Cadeia canônica de leitura: por esporte → global legado (só no principal).
          const resolved = raw ?? (code === primary ? legacyLevel : null);
          return {
            code,
            sportLabel: sportLabelForCode(code),
            savedCode: resolved,
            savedRank: levelRankOf(resolved),
            isPrimary: code === primary,
            locked: lockedBySport[code] === true,
          };
        }),
      );
      this.loading.set(false);
    } catch {
      this.loading.set(false);
      this.loadError.set('Não foi possível carregar seus esportes. Tente novamente.');
    }
  }
}
