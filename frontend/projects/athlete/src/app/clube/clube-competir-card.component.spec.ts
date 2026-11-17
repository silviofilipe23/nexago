import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ClubeCompetirCardComponent } from './clube-competir-card.component';
import type { BenefitsClubConfig } from './clube.logic';
import { CLUB_API, type ClubApi } from './data/clube-api';

interface FakeUser {
  uid: string;
  getIdTokenResult?: () => Promise<{ claims: Record<string, unknown> }>;
}

/**
 * O card do Clube no Competir aparece com a flag ligada ou para quem testa, e em nenhum outro
 * caso: carregando ou com erro, o hub segue como era (sem card piscando e sumindo).
 * O `ClubAccessService` é o real; só a porta do Firebase e a sessão são de mentira.
 */
describe('ClubeCompetirCardComponent', () => {
  let fetchConfig: jasmine.Spy<() => Promise<BenefitsClubConfig>>;
  let user: ReturnType<typeof signal<FakeUser | null>>;

  function api(): ClubApi {
    return {
      fetchConfig,
      fetchPartners: async () => [],
      fetchProfile: async () => null,
      track: async () => undefined,
      submitLead: async () => ({ successMessage: null }),
      claimBenefit: async () => null,
    };
  }

  beforeEach(async () => {
    fetchConfig = jasmine.createSpy('fetchConfig');
    user = signal<FakeUser | null>({ uid: 'u1' });
    await TestBed.configureTestingModule({
      imports: [ClubeCompetirCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CLUB_API, useFactory: api },
        { provide: AuthService, useValue: { user } },
      ],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(ClubeCompetirCardComponent);
    await fixture.whenStable();
    // A leitura da config é uma promise fora do Angular: espera ela assentar e renderiza de novo.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function card(host: HTMLElement): HTMLAnchorElement | null {
    return host.querySelector<HTMLAnchorElement>('a.cc-card');
  }

  it('aparece com a flag ligada, com selo NOVO e a origem do Competir', async () => {
    fetchConfig.and.resolveTo({ enabled: true, testerUids: [] });
    const host = await render();
    expect(card(host)?.textContent).toContain('Clube de Vantagens Nexa');
    expect(card(host)?.textContent).toContain('Descontos dos parceiros NexaGO');
    expect(card(host)?.textContent).toContain('NOVO');
    expect(card(host)?.getAttribute('href')).toBe('/clube?origem=competir_web');
  });

  it('some com a flag desligada para quem não testa', async () => {
    fetchConfig.and.resolveTo({ enabled: false, testerUids: ['outra-pessoa'] });
    expect(card(await render())).toBeNull();
  });

  it('aparece para quem está na lista de teste, mesmo com a flag desligada', async () => {
    fetchConfig.and.resolveTo({ enabled: false, testerUids: ['u1'] });
    expect(card(await render())).not.toBeNull();
  });

  it('aparece para admin pelo token, mesmo com a flag desligada', async () => {
    user.set({ uid: 'u1', getIdTokenResult: async () => ({ claims: { roles: ['athlete', 'admin'] } }) });
    fetchConfig.and.resolveTo({ enabled: false, testerUids: [] });
    expect(card(await render())).not.toBeNull();
  });

  it('não aparece enquanto carrega nem quando a leitura falha', async () => {
    fetchConfig.and.returnValue(new Promise(() => undefined));
    expect(card(await render())).toBeNull();

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ClubeCompetirCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CLUB_API, useFactory: api },
        { provide: AuthService, useValue: { user } },
      ],
    }).compileComponents();
    fetchConfig.and.rejectWith(new Error('permission-denied'));
    expect(card(await render())).toBeNull();
  });

  it('sem sessão não lê nada e não aparece', async () => {
    user.set(null);
    fetchConfig.and.resolveTo({ enabled: true, testerUids: [] });
    expect(card(await render())).toBeNull();
    expect(fetchConfig).not.toHaveBeenCalled();
  });
});
