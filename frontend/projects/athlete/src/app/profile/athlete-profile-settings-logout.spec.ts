import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../auth/auth.service';
import { AthleteGamificationService } from './athlete-gamification.service';
import { AthleteProfileSettingsComponent } from './athlete-profile-settings.component';
import { SandRankCardComponent } from './sand-rank-card.component';

/** O card real busca `appConfig/sandRank` no construtor sem depender de uid — o Firestore
 *  entra em retry infinito no Karma e derruba o runner. Não tem nada a ver com logout. */
@Component({ selector: 'app-sand-rank-card', template: '' })
class SandRankCardStubComponent {}

/**
 * O botão "Sair da conta" da sidebar desaparece abaixo de 900px, então o card "Conta"
 * do /perfil é o ÚNICO caminho de logout no celular. Estes testes travam esse caminho
 * e a confirmação em dois passos que protege do toque acidental.
 */
describe('AthleteProfileSettingsComponent — card Conta', () => {
  let fixture: ComponentFixture<AthleteProfileSettingsComponent>;
  let signOutUser: jasmine.Spy<() => Promise<void>>;
  let navigateByUrl: jasmine.Spy;

  /** AuthService sem usuário e já pronto: é o ramo em que o componente
   *  larga o `loading` e renderiza os cards sem tocar no Firestore. */
  function fakeAuth() {
    signOutUser = jasmine.createSpy('signOutUser').and.resolveTo();
    return {
      user: signal(null),
      authReady: signal(true),
      devEmail: signal('atleta@dev.local'),
      signOutUser,
      sendPasswordReset: jasmine.createSpy('sendPasswordReset').and.resolveTo(),
    };
  }

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  /** Acha um botão pelo texto — os botões do card não têm classe própria. */
  function buttonByText(text: string): HTMLButtonElement | null {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.at-card button'),
    );
    return buttons.find((b) => b.textContent?.trim() === text) ?? null;
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
          useValue: {
            states: [],
            loaded: signal(true),
            ready: Promise.resolve(),
            citiesFor: () => [],
          },
        },
      ],
    })
      .overrideComponent(AthleteProfileSettingsComponent, {
        remove: { imports: [SandRankCardComponent] },
        add: { imports: [SandRankCardStubComponent] },
      })
      .compileComponents();

    navigateByUrl = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);

    fixture = TestBed.createComponent(AthleteProfileSettingsComponent);
    await fixture.whenStable();
  });

  afterEach(() => fixture?.destroy());

  it('mostra o card Conta com o botão de sair', () => {
    const titles: string[] = Array.from(
      fixture.nativeElement.querySelectorAll('.at-card-title'),
    ).map((el) => (el as HTMLElement).textContent?.trim() ?? '');

    expect(titles).toContain('Conta');
    expect(buttonByText('Sair da conta')).not.toBeNull();
  });

  it('o primeiro toque NÃO desloga — só pede confirmação', async () => {
    buttonByText('Sair da conta')!.click();
    await fixture.whenStable();

    expect(signOutUser).not.toHaveBeenCalled();
    expect(query('.at-profile-logout-confirm')).not.toBeNull();
    expect(buttonByText('Sair da conta')).toBeNull();
    expect(buttonByText('Sair agora')).not.toBeNull();
  });

  it('Cancelar volta ao estado inicial sem deslogar', async () => {
    buttonByText('Sair da conta')!.click();
    await fixture.whenStable();

    buttonByText('Cancelar')!.click();
    await fixture.whenStable();

    expect(signOutUser).not.toHaveBeenCalled();
    expect(query('.at-profile-logout-confirm')).toBeNull();
    expect(buttonByText('Sair da conta')).not.toBeNull();
  });

  it('Sair agora encerra a sessão e volta pra raiz', async () => {
    buttonByText('Sair da conta')!.click();
    await fixture.whenStable();

    buttonByText('Sair agora')!.click();
    await fixture.whenStable();

    expect(signOutUser).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });
});
