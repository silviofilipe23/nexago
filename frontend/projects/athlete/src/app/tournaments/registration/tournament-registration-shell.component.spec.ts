import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { MyAthleteProfile } from '../../data/my-athlete-profile-repository';
import type { LevelConfirmationPrompt } from '../tournament-eligibility';
import { TournamentRegistrationShellComponent } from './tournament-registration-shell.component';

/** Espelha o profile mínimo já usado nos specs de elegibilidade (`tournament-eligibility.levels.spec.ts`). */
function profile(overrides: Partial<MyAthleteProfile>): MyAthleteProfile {
  return {
    gender: null,
    birthDate: null,
    level: null,
    levelsBySport: {},
    levelLocked: {},
    fullName: null,
    nickname: null,
    profilePhotoUrl: null,
    ...overrides,
  };
}

interface ShellInternals {
  listing: WritableSignal<{ sport: string | null } | null>;
  levelConfirmationPrompt: WritableSignal<LevelConfirmationPrompt | null>;
  fetchLevelGateProfile: () => Promise<MyAthleteProfile | null>;
  ensureLevelConfirmed(): Promise<boolean>;
  confirmLevelPrompt(): void;
  adjustLevelPrompt(): void;
}

/**
 * Gate de confirmação de nível na 1ª inscrição (Task 7) — espelha o app Flutter (Task 6).
 *
 * `auth.user()` fica `null` em TODOS os testes, igual ao padrão já estabelecido em
 * `athlete-sports-levels.component.spec.ts`: os efeitos do construtor (`loadProfile`,
 * `watchMyRegistrations` via `PartnerInvitesService`) dependem de um uid pra disparar
 * qualquer chamada ao Firestore — sem uid, nenhum deles toca rede de verdade. Por isso
 * `fetchLevelGateProfile` (o ponto de fetch do próprio gate) é a única fonte da "resposta
 * do perfil" nestes testes: com o campo trocado, `ensureLevelConfirmed()` roda de ponta a
 * ponta sem depender de sessão nem de Firestore real.
 */
describe('TournamentRegistrationShellComponent — confirmação de nível na 1ª inscrição', () => {
  let fixture: ComponentFixture<TournamentRegistrationShellComponent>;
  let cmp: ShellInternals;
  let router: Router;

  function fakeAuth() {
    return { user: signal(null), devEmail: signal(null) };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentRegistrationShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentRegistrationShellComponent);
    await fixture.whenStable();
    cmp = fixture.componentInstance as unknown as ShellInternals;
    router = TestBed.inject(Router);
  });

  afterEach(() => fixture?.destroy());

  it('sem falha de resolução (uid/Firestore indisponíveis nos testes): bloqueia e não mostra o dialog', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });

    const confirmed = await cmp.ensureLevelConfirmed();

    expect(confirmed).toBeFalse();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
  });

  it('esporte já travado: resolve confirmado sem abrir o dialog', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });
    cmp.fetchLevelGateProfile = () =>
      Promise.resolve(profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_1' }, levelLocked: { VOLEI_PRAIA: true } }));

    const confirmed = await cmp.ensureLevelConfirmed();

    expect(confirmed).toBeTrue();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
  });

  it('esporte destravado: abre o dialog com a copy exata e só resolve depois da escolha', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });
    cmp.fetchLevelGateProfile = () =>
      Promise.resolve(profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' }, levelLocked: {} }));

    let settled: boolean | null = null;
    const pending = cmp.ensureLevelConfirmed().then((v) => {
      settled = v;
      return v;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBeNull();
    expect(cmp.levelConfirmationPrompt()).toEqual({ levelLabel: 'Iniciante 1', sportLabel: 'Vôlei de praia' });

    cmp.confirmLevelPrompt();
    const result = await pending;

    expect(result).toBeTrue();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
  });

  it('"Ajustar nível": resolve não-confirmado, fecha o dialog e navega pra /perfil/esportes', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });
    cmp.fetchLevelGateProfile = () =>
      Promise.resolve(profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' }, levelLocked: {} }));
    const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

    const pending = cmp.ensureLevelConfirmed();
    await Promise.resolve();
    await Promise.resolve();

    cmp.adjustLevelPrompt();
    const result = await pending;

    expect(result).toBeFalse();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/perfil/esportes']);
  });

  it('falha ao resolver o perfil: bloqueia (nunca decide no escuro) e não mostra o dialog', async () => {
    cmp.listing.set({ sport: 'beachVolleyball' });
    cmp.fetchLevelGateProfile = () => Promise.reject(new Error('fetch falhou'));

    const confirmed = await cmp.ensureLevelConfirmed();

    expect(confirmed).toBeFalse();
    expect(cmp.levelConfirmationPrompt()).toBeNull();
  });
});
