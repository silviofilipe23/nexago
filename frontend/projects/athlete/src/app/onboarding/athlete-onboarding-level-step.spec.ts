import { provideZonelessChangeDetection, signal, type Signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../auth/auth.service';
import { AthleteOnboardingComponent } from './athlete-onboarding.component';

/** Mesmo contrato de `athlete-onboarding-required-fields.spec.ts`: os campos são
 *  `protected`, então o teste alcança os signals por este contrato em vez de
 *  dirigir a tela inteira. */
interface OnboardingLevelInternals {
  selectedLevelCode: WritableSignal<string>;
  levelChosen: Signal<boolean>;
  selectLevel(code: string): void;
}

/**
 * Janela de calibração (Task 5): o passo de nível do onboarding não pode mais
 * nascer com um nível pré-selecionado (`intermediario_1` era um default
 * silencioso) — o atleta precisa escolher explicitamente antes de avançar.
 */
describe('AthleteOnboardingComponent — escolha obrigatória de nível', () => {
  let fixture: ComponentFixture<AthleteOnboardingComponent>;
  let onboarding: OnboardingLevelInternals;

  function fakeAuth() {
    return {
      user: signal(null),
      authReady: signal(true),
      devEmail: signal('atleta@dev.local'),
      signOutUser: jasmine.createSpy('signOutUser').and.resolveTo(),
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AthleteOnboardingComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth() },
        {
          provide: BrLocationsService,
          useValue: {
            states: [{ sigla: 'GO', name: 'Goiás' }],
            loaded: signal(true),
            ready: Promise.resolve(),
            citiesFor: () => [],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AthleteOnboardingComponent);
    await fixture.whenStable();
    onboarding = fixture.componentInstance as unknown as OnboardingLevelInternals;
  });

  afterEach(() => fixture?.destroy());

  it('nasce sem nível escolhido — nenhum chip pré-selecionado', () => {
    expect(onboarding.selectedLevelCode()).toBe('');
  });

  it('bloqueia avançar do passo 2 sem escolher um nível', () => {
    expect(onboarding.levelChosen()).toBeFalse();
  });

  it('libera avançar assim que um nível é escolhido', () => {
    onboarding.selectLevel('avancado_1');

    expect(onboarding.selectedLevelCode()).toBe('avancado_1');
    expect(onboarding.levelChosen()).toBeTrue();
  });
});
