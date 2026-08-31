import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FormGroup, FormControl } from '@angular/forms';
import { BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../auth/auth.service';
import { AthleteGamificationService } from './athlete-gamification.service';
import { AthleteProfileSettingsComponent } from './athlete-profile-settings.component';
import { SandRankCardComponent } from './sand-rank-card.component';

/** Mesmo motivo do spec de logout: o card real busca `appConfig/sandRank` no
 *  construtor e o Firestore entra em retry infinito no Karma. */
@Component({ selector: 'app-sand-rank-card', template: '' })
class SandRankCardStubComponent {}

/** Os membros do componente são `protected` (compile-time) — o spec alcança o
 *  form por este contrato em vez de dirigir a tela inteira. */
interface SettingsInternals {
  form: FormGroup<{ phoneNumber: FormControl<string> }>;
  setPhone(value: string): void;
  onPhoneVerified(event: { phoneNumber: string }): void;
}

/**
 * O WhatsApp deixou de depender do SMS: o número é digitado e salvo direto
 * (as rules aceitam enquanto não há selo). Aqui trava o formato e a trava de
 * edição depois de verificado.
 */
describe('AthleteProfileSettingsComponent — WhatsApp', () => {
  let fixture: ComponentFixture<AthleteProfileSettingsComponent>;
  let settings: SettingsInternals;

  function fakeAuth() {
    return {
      user: signal(null),
      authReady: signal(true),
      devEmail: signal('atleta@dev.local'),
      signOutUser: jasmine.createSpy('signOutUser').and.resolveTo(),
      sendPasswordReset: jasmine.createSpy('sendPasswordReset').and.resolveTo(),
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AthleteProfileSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth() },
        {
          provide: AthleteGamificationService,
          useValue: { summary: signal(null), unlockedAchievementIds: signal(new Set<string>()) },
        },
        {
          provide: BrLocationsService,
          useValue: { states: [], loaded: signal(true), ready: Promise.resolve(), citiesFor: () => [] },
        },
      ],
    })
      .overrideComponent(AthleteProfileSettingsComponent, {
        remove: { imports: [SandRankCardComponent] },
        add: { imports: [SandRankCardStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AthleteProfileSettingsComponent);
    await fixture.whenStable();
    settings = fixture.componentInstance as unknown as SettingsInternals;
  });

  afterEach(() => fixture?.destroy());

  it('aceita um celular válido', () => {
    settings.form.controls.phoneNumber.setValue('(62) 99123-4567');
    expect(settings.form.controls.phoneNumber.valid).toBeTrue();
  });

  it('recusa número mal formado', () => {
    settings.form.controls.phoneNumber.setValue('(62) 3333-4444');
    expect(settings.form.controls.phoneNumber.valid).toBeFalse();
  });

  it('deixa salvar sem telefone — conta legada não fica presa na edição', () => {
    // O gate de torneios avisa o que falta na hora da inscrição; travar o save
    // impediria o atleta de editar até a bio.
    settings.form.controls.phoneNumber.setValue('');
    expect(settings.form.controls.phoneNumber.valid).toBeTrue();
  });

  it('mascara o número enquanto digita', () => {
    settings.setPhone('62991234567');
    expect(settings.form.controls.phoneNumber.value).toBe('(62) 99123-4567');
  });

  it('verificar por SMS preenche o campo e trava a edição', () => {
    // Depois do selo as rules recusam qualquer troca vinda do client.
    settings.onPhoneVerified({ phoneNumber: '+5562991234567' });

    expect(settings.form.controls.phoneNumber.value).toBe('(62) 99123-4567');
    expect(settings.form.controls.phoneNumber.disabled).toBeTrue();
  });
});
