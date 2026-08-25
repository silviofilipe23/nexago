import { provideZonelessChangeDetection, signal, type Signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../auth/auth.service';
import { AthleteOnboardingComponent } from './athlete-onboarding.component';

/**
 * Os campos do passo 4 são `protected` (visíveis só no template). `protected` é
 * compile-time, então o teste alcança os signals por este contrato em vez de
 * dirigir a tela inteira — o passo depende de verificação por SMS, que não roda
 * no Karma.
 */
interface OnboardingInternals {
  name: WritableSignal<string>;
  phoneVerified: WritableSignal<boolean>;
  birthDateInput: WritableSignal<string>;
  gender: WritableSignal<string | null>;
  state: WritableSignal<string>;
  city: WritableSignal<string>;
  photoFile: WritableSignal<File | null>;
  selectedLevelCode: WritableSignal<string>;
  profileFormValid: Signal<boolean>;
  selectState(uf: string): void;
}

/**
 * Cidade e UF entraram no cadastro (o atleta precisa ser localizável) e a foto
 * deixou de ser opcional (precisa ser identificável nas inscrições). Este spec
 * trava as três regras.
 */
describe('AthleteOnboardingComponent — obrigatórios do perfil', () => {
  let fixture: ComponentFixture<AthleteOnboardingComponent>;
  let onboarding: OnboardingInternals;

  function fakeAuth() {
    return {
      user: signal(null),
      authReady: signal(true),
      devEmail: signal('atleta@dev.local'),
      signOutUser: jasmine.createSpy('signOutUser').and.resolveTo(),
    };
  }

  /** Preenche tudo o que o passo 4 exige (+ o nível do passo 2) — cada teste tira UM campo. */
  function fillCompleteProfile(): void {
    onboarding.name.set('Marcelo Antunes');
    onboarding.phoneVerified.set(true);
    onboarding.birthDateInput.set('15/03/1990');
    onboarding.gender.set('Masculino');
    onboarding.state.set('GO');
    onboarding.city.set('Goiânia');
    onboarding.photoFile.set(new File([new Blob(['foto'])], 'foto.jpg', { type: 'image/jpeg' }));
    onboarding.selectedLevelCode.set('intermediario_1');
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
            citiesFor: (uf: string) => (uf === 'GO' ? ['Goiânia', 'Aparecida de Goiânia'] : []),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AthleteOnboardingComponent);
    await fixture.whenStable();
    onboarding = fixture.componentInstance as unknown as OnboardingInternals;
  });

  afterEach(() => fixture?.destroy());

  it('aceita o perfil quando nome, nascimento, gênero, UF, cidade e foto estão preenchidos', () => {
    fillCompleteProfile();
    expect(onboarding.profileFormValid()).toBeTrue();
  });

  it('aceita o perfil SEM telefone verificado — SMS que não chega não trava o cadastro', () => {
    // O gate de torneios do servidor (athlete-tournament-access.ts) continua
    // exigindo phoneVerified na inscrição; aqui o atleta conclui e verifica
    // depois no perfil.
    fillCompleteProfile();
    onboarding.phoneVerified.set(false);
    expect(onboarding.profileFormValid()).toBeTrue();
  });

  it('recusa sem foto', () => {
    fillCompleteProfile();
    onboarding.photoFile.set(null);
    expect(onboarding.profileFormValid()).toBeFalse();
  });

  it('recusa sem UF', () => {
    fillCompleteProfile();
    onboarding.state.set('');
    expect(onboarding.profileFormValid()).toBeFalse();
  });

  it('recusa sem cidade', () => {
    fillCompleteProfile();
    onboarding.city.set('');
    expect(onboarding.profileFormValid()).toBeFalse();
  });

  // F7 (review): `levelChosen` (passo 2) só travava o botão "Continuar" daquele passo — a
  // invariante não valia na escrita de verdade. `profileFormValid()` agora inclui o nível.
  it('recusa sem nível escolhido (invariante da escolha obrigatória vale na escrita, não só no botão do passo 2)', () => {
    fillCompleteProfile();
    onboarding.selectedLevelCode.set('');
    expect(onboarding.profileFormValid()).toBeFalse();
  });

  it('trocar a UF limpa a cidade — senão sobra cidade de outro estado', () => {
    fillCompleteProfile();

    onboarding.selectState('SP');

    expect(onboarding.state()).toBe('SP');
    expect(onboarding.city()).toBe('');
    expect(onboarding.profileFormValid()).toBeFalse();
  });
});
