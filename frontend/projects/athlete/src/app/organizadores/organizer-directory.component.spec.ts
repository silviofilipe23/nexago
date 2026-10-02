import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CompetirHubComponent } from '../competir/competir-hub.component';
import { OrganizerPublicProfileSource } from '../data/organizer-public-profile-repository';
import { organizerPublicProfileFromDoc } from '../data/organizer-public-profiles';
import { PartnerInvitesService } from '../data/partner-invites.service';
import { StaffTournamentsService } from '../data/staff-tournaments.service';
import { OrganizerDirectoryComponent } from './organizer-directory.component';

const LIST = [
  organizerPublicProfileFromDoc('a', { name: 'Circuito Areia Sul', isOrganizer: true, city: 'Florianópolis', state: 'SC', followersCount: 900, stats: { openEvents: 0 } }),
  organizerPublicProfileFromDoc('b', {
    name: 'Liga Amadora Goiânia',
    isOrganizer: true,
    city: 'Goiânia',
    state: 'GO',
    logoUrl: 'https://exemplo.invalid/logo.png',
    followersCount: 10,
    stats: { openEvents: 2 },
  }),
];

describe('Lista "Organizadores" e card no Competir', () => {
  let fixture: ComponentFixture<unknown>;
  let apiKey: string | undefined;

  beforeEach(() => {
    apiKey = environment.firebase.apiKey;
    (environment.firebase as { apiKey?: string }).apiKey = '';
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: OrganizerPublicProfileSource,
          useValue: {
            fetchListedOrganizers: () => Promise.resolve(LIST),
            fetchReputations: () =>
              Promise.resolve(new Map([['b', { reviewsCount: 12, tournamentsRated: 2, average: 4.62, distribution: null, aspects: {} }]])),
          },
        },
        { provide: AuthService, useValue: { user: signal(null), devEmail: signal(null) } },
        { provide: PartnerInvitesService, useValue: { pending: signal([]), pendingCount: signal(0), markAnswered: () => undefined } },
        { provide: StaffTournamentsService, useValue: { count: signal(0) } },
      ],
    });
  });

  afterEach(() => {
    (environment.firebase as { apiKey?: string }).apiKey = apiKey;
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  async function render(): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('inscrição aberta primeiro, com a nota quando há reputação pública', async () => {
    fixture = TestBed.createComponent(OrganizerDirectoryComponent);
    const host = await render();
    const names = [...host.querySelectorAll('.od-name-text')].map((e) => e.textContent?.trim());
    expect(names).toEqual(['Liga Amadora Goiânia', 'Circuito Areia Sul']);
    expect(host.querySelector('.od-card')?.getAttribute('href')).toBe('/organizadores/b');
    expect(host.querySelector('.od-rating')?.textContent).toContain('4,6');
    expect(host.querySelector('.od-open')?.textContent).toContain('2 com inscrição aberta');
  });

  it('busca por cidade sem acento', async () => {
    fixture = TestBed.createComponent(OrganizerDirectoryComponent);
    const host = await render();
    const input = host.querySelector<HTMLInputElement>('.od-search input')!;
    input.value = 'florianopolis';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect([...host.querySelectorAll('.od-name-text')].map((e) => e.textContent?.trim())).toEqual(['Circuito Areia Sul']);
  });

  it('logo que não carrega cai nas iniciais', async () => {
    fixture = TestBed.createComponent(OrganizerDirectoryComponent);
    const host = await render();
    const img = host.querySelector<HTMLImageElement>('.od-logo img')!;
    expect(img).not.toBeNull();
    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.querySelector('.od-logo img')).toBeNull();
    expect(host.querySelector('.od-logo')?.textContent?.trim()).toBe('LAG');
  });

  it('o hub Competir tem o card Organizadores', async () => {
    fixture = TestBed.createComponent(CompetirHubComponent);
    const host = await render();
    const card = [...host.querySelectorAll<HTMLAnchorElement>('.ch-card')].find((a) => a.textContent?.includes('Organizadores'));
    expect(card?.getAttribute('href')).toBe('/organizadores');
  });
});
