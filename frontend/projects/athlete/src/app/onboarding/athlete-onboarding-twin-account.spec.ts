import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../auth/auth.service';
import { twinAccountHint, type PhoneInOtherAccount } from '../data/twin-account-check';
import { AthleteOnboardingComponent } from './athlete-onboarding.component';

/** Mesmo contrato de `athlete-onboarding-required-fields.spec.ts`: `protected` é compile-time. */
interface OnboardingInternals {
  step: WritableSignal<number>;
  phoneInput: WritableSignal<string>;
  twinAccount: WritableSignal<PhoneInOtherAccount | null>;
  submitProfile(): Promise<void>;
}

const OTHER: PhoneInOtherAccount = { maskedEmail: 'ma•••@gmail.com', signInMethod: 'Google' };

describe('twinAccountHint', () => {
  it('junta o jeito de entrar e o e-mail mascarado', () => {
    expect(twinAccountHint(OTHER)).toBe('Google · ma•••@gmail.com');
    expect(twinAccountHint({ maskedEmail: '', signInMethod: 'Apple' })).toBe('Apple');
    expect(twinAccountHint({ maskedEmail: '', signInMethod: '' })).toBe('');
  });
});

/**
 * A mesma pessoa com duas contas é o que duplica inscrição: o "Concluir
 * cadastro" avisa quando o WhatsApp já está em outra conta.
 */
describe('AthleteOnboardingComponent — WhatsApp já em outra conta', () => {
  let fixture: ComponentFixture<AthleteOnboardingComponent>;
  let onboarding: OnboardingInternals;
  let auth: { signOutUser: jasmine.Spy };

  beforeEach(async () => {
    auth = { signOutUser: jasmine.createSpy('signOutUser').and.resolveTo() };
    await TestBed.configureTestingModule({
      imports: [AthleteOnboardingComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal(null),
            authReady: signal(true),
            devEmail: signal('atleta@dev.local'),
            ...auth,
          },
        },
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
    onboarding = fixture.componentInstance as unknown as OnboardingInternals;
    onboarding.step.set(4);
    onboarding.phoneInput.set('(62) 99123-4567');
    onboarding.twinAccount.set(OTHER);
    await fixture.whenStable();
  });

  afterEach(() => fixture?.destroy());

  function dialog(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('app-nx-blocking-dialog');
  }

  function clickButton(label: string): void {
    const buttons = Array.from(dialog()!.querySelectorAll('button'));
    buttons.find((b) => b.textContent?.trim() === label)!.click();
  }

  it('mostra a dica da outra conta', () => {
    expect(dialog()?.textContent).toContain('Você já tem uma conta?');
    expect(dialog()?.textContent).toContain('(Google · ma•••@gmail.com)');
  });

  it('"Entrar com ela" sai desta conta e vai para o login', async () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    clickButton('Entrar com ela');
    await fixture.whenStable();

    expect(auth.signOutUser).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/entrar');
    expect(dialog()).toBeNull();
  });

  it('"Não é minha" fecha o aviso e reenvia o cadastro', async () => {
    const submit = spyOn(onboarding, 'submitProfile').and.resolveTo();

    clickButton('Não é minha');
    await fixture.whenStable();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(auth.signOutUser).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
