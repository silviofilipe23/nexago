import {
  provideZonelessChangeDetection,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AthleteSportsLevelsComponent, canAddSportWithLevel } from './athlete-sports-levels.component';

/**
 * `canAddSportWithLevel` é a guarda pura por trás de `confirmAddSport()` e do
 * botão "Adicionar esporte" no template — não precisa de TestBed nem toca
 * Firestore. Trava a regra de que um esporte novo só entra com um nível
 * explícito e válido (nunca um default silencioso).
 */
describe('canAddSportWithLevel', () => {
  it('recusa sem nível escolhido', () => {
    expect(canAddSportWithLevel(null)).toBeFalse();
  });

  it('recusa código de nível inválido', () => {
    expect(canAddSportWithLevel('xpto')).toBeFalse();
  });

  it('aceita um código de nível válido da escada', () => {
    expect(canAddSportWithLevel('avancado_1')).toBeTrue();
    expect(canAddSportWithLevel('iniciante_1')).toBeTrue();
  });
});

/** Linha mínima do estado interno (`SportLevelRow` não é exportado — o teste
 *  monta o shape esperado à mão, espelhando o que `load()` produziria). */
interface FakeRow {
  code: string;
  sportLabel: string;
  savedCode: string | null;
  savedRank: number | null;
  isPrimary: boolean;
  locked: boolean;
}

interface SportsLevelsInternals {
  rows: WritableSignal<FakeRow[]>;
  pendingBySport: WritableSignal<Record<string, string>>;
  notice: WritableSignal<string | null>;
  pendingNewSportCode: WritableSignal<string | null>;
  pendingNewSportLevel: WritableSignal<string | null>;
  canConfirmAddSport: Signal<boolean>;
  pendingFor(sportCode: string): string | null;
  isOptionLocked(row: FakeRow, option: { code: string }): boolean;
  selectLevel(row: FakeRow, option: { code: string }): void;
  pickNewSport(sportCode: string): void;
  selectNewSportLevel(levelCode: string): void;
}

/**
 * Janela de calibração (Task 5): pré-lock (`row.locked === false`) o atleta
 * pode descer de nível livremente na tela de Esportes e níveis; pós-lock o
 * ratchet "só sobe" de sempre continua valendo. Adicionar um esporte novo
 * também deixa de ter default silencioso (`DEFAULT_LEVEL_CODE` removido).
 *
 * `auth.user()` fica `null` em todos os testes — evita qualquer chamada real
 * ao Firestore (`load()`/`confirmLevel()`/`confirmAddSport()` bailam cedo
 * sem uid, ANTES de qualquer `await`); os testes montam `rows`/os signals de
 * pendência diretamente, sem depender do fetch real.
 */
describe('AthleteSportsLevelsComponent — janela de correção', () => {
  let fixture: ComponentFixture<AthleteSportsLevelsComponent>;
  let cmp: SportsLevelsInternals;

  function fakeAuth() {
    return {
      user: signal(null),
    };
  }

  function row(overrides: Partial<FakeRow>): FakeRow {
    return {
      code: 'VOLEI_PRAIA',
      sportLabel: 'Vôlei de praia',
      savedCode: 'intermediario_1',
      savedRank: 2,
      isPrimary: true,
      locked: false,
      ...overrides,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AthleteSportsLevelsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AthleteSportsLevelsComponent);
    await fixture.whenStable();
    cmp = fixture.componentInstance as unknown as SportsLevelsInternals;
  });

  afterEach(() => fixture?.destroy());

  it('pré-lock: descer de nível não é travado e vira pendência (pronta pra salvar)', () => {
    const r = row({ locked: false, savedCode: 'intermediario_1', savedRank: 2 });
    cmp.rows.set([r]);

    expect(cmp.isOptionLocked(r, { code: 'iniciante_1' })).toBeFalse();

    cmp.selectLevel(r, { code: 'iniciante_1' });

    expect(cmp.pendingFor('VOLEI_PRAIA')).toBe('iniciante_1');
    expect(cmp.notice()).toBeNull();
  });

  it('pós-lock: descer de nível é travado e não vira pendência', () => {
    const r = row({ locked: true, savedCode: 'intermediario_1', savedRank: 2 });
    cmp.rows.set([r]);

    expect(cmp.isOptionLocked(r, { code: 'iniciante_1' })).toBeTrue();

    cmp.selectLevel(r, { code: 'iniciante_1' });

    expect(cmp.pendingFor('VOLEI_PRAIA')).toBeNull();
    expect(cmp.notice()).toBe('O nível só pode subir. Para reduzir, fale com o suporte.');
  });

  it('pós-lock: subir de nível continua liberado', () => {
    const r = row({ locked: true, savedCode: 'iniciante_1', savedRank: 0 });
    cmp.rows.set([r]);

    expect(cmp.isOptionLocked(r, { code: 'intermediario_1' })).toBeFalse();

    cmp.selectLevel(r, { code: 'intermediario_1' });

    expect(cmp.pendingFor('VOLEI_PRAIA')).toBe('intermediario_1');
  });

  it('adicionar esporte: sem nível escolhido, "Adicionar esporte" fica bloqueado', () => {
    cmp.pickNewSport('BEACH_TENNIS');

    expect(cmp.pendingNewSportCode()).toBe('BEACH_TENNIS');
    expect(cmp.canConfirmAddSport()).toBeFalse();
  });

  it('adicionar esporte: escolher um nível válido libera "Adicionar esporte"', () => {
    cmp.pickNewSport('BEACH_TENNIS');
    cmp.selectNewSportLevel('avancado_1');

    expect(cmp.canConfirmAddSport()).toBeTrue();
  });
});
