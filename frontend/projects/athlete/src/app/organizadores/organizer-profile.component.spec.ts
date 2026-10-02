import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { OrganizerPublicProfileSource } from '../data/organizer-public-profile-repository';
import { organizerPublicProfileFromDoc, type OrganizerPublicProfile } from '../data/organizer-public-profiles';
import { PartnerInvitesService } from '../data/partner-invites.service';
import { StaffTournamentsService } from '../data/staff-tournaments.service';
import { OrganizerProfileComponent } from './organizer-profile.component';

const PROFILE = organizerPublicProfileFromDoc('org-1', {
  name: 'Liga Amadora Goiânia',
  isOrganizer: true,
  verified: true,
  city: 'Goiânia',
  state: 'GO',
  whatsapp: '5562999991234',
  stats: { eventsCompleted: 38, athletes: 1240, sports: ['beachVolleyball'] },
});

function source(profile: OrganizerPublicProfile | null) {
  return {
    fetchProfile: () => Promise.resolve(profile),
    fetchEvents: () => Promise.resolve([]),
    fetchReputation: () => Promise.resolve(null),
    fetchReviewSummaries: () => Promise.resolve([]),
    fetchEnrolledCounts: () => Promise.resolve(new Map()),
    fetchTeamNames: () => Promise.resolve(new Map()),
    isFollowing: () => Promise.resolve(false),
    setFollowing: () => Promise.resolve(),
  };
}

describe('OrganizerProfileComponent', () => {
  let fixture: ComponentFixture<OrganizerProfileComponent>;
  let apiKey: string | undefined;

  beforeEach(() => {
    // Sem Firestore de verdade: a casca do portal não tenta ler a foto do perfil.
    apiKey = environment.firebase.apiKey;
    (environment.firebase as { apiKey: string }).apiKey = '';
  });

  afterEach(() => {
    (environment.firebase as { apiKey?: string }).apiKey = apiKey;
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  async function mount(opts: { profile?: OrganizerPublicProfile | null; viewer?: string | null; aba?: string } = {}): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [OrganizerProfileComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: OrganizerPublicProfileSource, useValue: source(opts.profile === undefined ? PROFILE : opts.profile) },
        { provide: AuthService, useValue: { user: signal(opts.viewer === null ? null : { uid: opts.viewer ?? 'me' }), devEmail: signal(null) } },
        { provide: PartnerInvitesService, useValue: { pending: signal([]), pendingCount: signal(0), markAnswered: () => undefined } },
        { provide: StaffTournamentsService, useValue: { count: signal(0) } },
      ],
    });
    fixture = TestBed.createComponent(OrganizerProfileComponent);
    fixture.componentRef.setInput('organizerId', 'org-1');
    if (opts.aba) fixture.componentRef.setInput('aba', opts.aba);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('sem perfil público: "Organizador não encontrado" com link para a lista', async () => {
    const host = await mount({ profile: null });
    expect(host.textContent).toContain('Organizador não encontrado');
    expect(host.querySelector('.op-state a')?.getAttribute('href')).toBe('/organizadores');
  });

  it('breadcrumb com o nome, selo, números e Mensagem pelo WhatsApp', async () => {
    const host = await mount();
    expect(host.querySelector('.op-crumbs')?.textContent).toContain('Liga Amadora Goiânia');
    expect(host.querySelector('.oh-verified')).not.toBeNull();
    expect(host.querySelector('.oh-stats')?.textContent).toContain('1.240');
    const message = [...host.querySelectorAll<HTMLAnchorElement>('.oh-actions a')].find((a) => a.textContent?.includes('Mensagem'));
    expect(message?.href).toBe('https://wa.me/5562999991234');
  });

  it('sem WhatsApp não há botão Mensagem', async () => {
    const host = await mount({ profile: organizerPublicProfileFromDoc('org-1', { name: 'Liga', isOrganizer: true }) });
    expect(host.querySelector('.oh-actions')?.textContent).not.toContain('Mensagem');
  });

  it('Seguir aparece para outro atleta e some no próprio perfil', async () => {
    const other = await mount({ viewer: 'me' });
    expect(other.querySelector('.oh-btn--follow')?.textContent).toContain('Seguir');
    fixture.destroy();
    TestBed.resetTestingModule();

    const self = await mount({ viewer: 'org-1' });
    expect(self.querySelector('.oh-btn--follow')).toBeNull();
  });

  it('a aba vem de ?aba= e "Eventos" mostra a contagem', async () => {
    const host = await mount({ aba: 'avaliacoes' });
    expect(host.querySelector('app-organizer-reviews-tab')).not.toBeNull();
    expect(host.querySelector('.op-tab--active')?.textContent).toContain('Avaliações');
    expect(host.querySelector('app-organizer-reviews-tab')?.textContent).toContain('Ainda sem avaliações suficientes');
  });

  it('sem ?aba= abre a visão geral, com o convite a seguir quando não há próximos eventos', async () => {
    const host = await mount();
    expect(host.querySelector('app-organizer-overview-tab')).not.toBeNull();
    expect(host.querySelector('.ov-empty')?.textContent).toContain('Siga Liga Amadora Goiânia');
  });
});
