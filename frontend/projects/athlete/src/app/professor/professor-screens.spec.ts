import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { PartnerInvitesService } from '../data/partner-invites.service';
import { StaffTournamentsService } from '../data/staff-tournaments.service';
import { ProfessorArenasComponent } from './professor-arenas.component';
import { ProfessorLinkDetailComponent } from './professor-link-detail.component';
import type { ProfessorLink, ProfessorLinkEvent, ProfessorLinkResult } from './professor-links.model';
import { ProfessorLinksService } from './professor-links.service';

const DAY = 24 * 60 * 60 * 1000;

function link(overrides: Partial<ProfessorLink>): ProfessorLink {
  return {
    id: 'a_me',
    arenaId: 'a',
    professorUserId: 'me',
    relationshipType: 'INDEPENDENT',
    status: 'ACTIVE',
    initiatedBy: 'PROFESSOR',
    permissions: { canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false },
    message: null,
    cycle: 1,
    arenaName: 'Arena Norte',
    arenaLogoUrl: null,
    arenaCity: 'Goiânia · GO',
    createdAt: null,
    updatedAt: new Date(),
    invitedAt: null,
    requestedAt: null,
    expiresAt: null,
    respondedAt: null,
    approvedAt: new Date(2026, 4, 6),
    suspendedAt: null,
    endedAt: null,
    canceledAt: null,
    invitedByName: null,
    approvedByName: null,
    endedBySide: null,
    rejectionReason: null,
    suspensionReason: null,
    suspensionDetails: null,
    endedReason: null,
    ...overrides,
  };
}

const LINKS: ProfessorLink[] = [
  link({
    id: 'sul_me',
    arenaId: 'sul',
    arenaName: 'Arena Sul',
    relationshipType: 'ARENA_STAFF',
    status: 'INVITED',
    initiatedBy: 'ARENA',
    invitedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * DAY - 60_000),
    invitedByName: 'Ricardo Prado',
    message: 'Queremos você no time.',
    permissions: { canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: true },
  }),
  link({ id: 'norte_me', arenaId: 'norte' }),
  link({ id: 'lagoa_me', arenaId: 'lagoa', arenaName: 'Lagoa Beach Club', status: 'PENDING', requestedAt: new Date() }),
  link({ id: 'bp_me', arenaId: 'bp', arenaName: 'Beach Point', status: 'ENDED', endedAt: new Date(2026, 1, 3) }),
];

/** Fake do `ProfessorLinksService` — o mesmo formato que uma rota de QA sem login usaria. */
function fakeService(links: ProfessorLink[], events: ProfessorLinkEvent[] = []) {
  const ok = (linkId: string, status: ProfessorLinkResult['status']) => Promise.resolve({ linkId, status });
  return {
    links: signal(links),
    loaded: signal(true),
    loadError: signal(false),
    openInviteCount: signal(links.filter((l) => l.status === 'INVITED').length),
    watchEvents: jasmine
      .createSpy('watchEvents')
      .and.callFake((_id: string, onChange: (e: ProfessorLinkEvent[]) => void) => {
        onChange(events);
        return () => undefined;
      }),
    listArenas: jasmine.createSpy('listArenas').and.resolveTo([]),
    respondToInvite: jasmine.createSpy('respondToInvite').and.callFake((id: string) => ok(id, 'ACTIVE')),
    requestLink: jasmine.createSpy('requestLink').and.callFake((i: { arenaId: string }) => ok(`${i.arenaId}_me`, 'PENDING')),
    cancelRequest: jasmine.createSpy('cancelRequest').and.callFake((id: string) => ok(id, 'CANCELED')),
    endLink: jasmine.createSpy('endLink').and.callFake((id: string) => ok(id, 'ENDED')),
  };
}

describe('Telas do professor (Minhas arenas e detalhe)', () => {
  let apiKey: string | undefined;
  let service: ReturnType<typeof fakeService>;

  async function open(url: string, links = LINKS, events: ProfessorLinkEvent[] = []): Promise<HTMLElement> {
    service = fakeService(links, events);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'professor/arenas', component: ProfessorArenasComponent },
          { path: 'professor/arenas/:linkId', component: ProfessorLinkDetailComponent },
        ]),
        { provide: ProfessorLinksService, useValue: service },
        { provide: AuthService, useValue: { user: signal(null), devEmail: signal(null) } },
        { provide: PartnerInvitesService, useValue: { pending: signal([]), pendingCount: signal(0), markAnswered: () => undefined } },
        { provide: StaffTournamentsService, useValue: { count: signal(0) } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  }

  /** Dá uma volta no event loop (callable fake + render zoneless). */
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  function buttons(root: ParentNode, label: string): HTMLButtonElement[] {
    return [...root.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent?.trim() === label);
  }

  beforeEach(() => {
    apiKey = environment.firebase.apiKey;
    (environment.firebase as { apiKey?: string }).apiKey = '';
  });

  afterEach(() => {
    (environment.firebase as { apiKey?: string }).apiKey = apiKey;
    TestBed.resetTestingModule();
  });

  it('convite aberto vai no banner; os outros vínculos viram cards com as ações do estado', async () => {
    const host = await open('/professor/arenas');
    expect(host.querySelector('.pf-page-sub')?.textContent).toContain('4 vínculos · 1 ativo · mesma conta em todas');

    const banner = host.querySelector('.pf-invite-banner');
    expect(banner?.textContent).toContain('A Arena Sul convidou você para a equipe');
    expect(banner?.textContent).toContain('Ricardo Prado · expira em 7 dias');

    const names = [...host.querySelectorAll('.pf-card-name')].map((e) => e.textContent?.trim());
    expect(names).toEqual(['Arena Norte', 'Lagoa Beach Club', 'Beach Point']);

    const cards = [...host.querySelectorAll('.pf-card')];
    const labels = (card: Element) => [...card.querySelectorAll('.pf-card-actions button')].map((b) => b.textContent?.trim());
    expect(labels(cards[0]!)).toEqual(['Ver detalhes', 'Encerrar vínculo']);
    expect(labels(cards[1]!)).toEqual(['Ver pedido', 'Cancelar pedido']);
    expect(labels(cards[2]!)).toEqual(['Solicitar novo vínculo', 'Histórico']);
    expect(cards[2]!.classList).toContain('pf-card--off');
    expect(cards[0]!.textContent).toContain('Desde mai 2026');
  });

  it('"Ver convite" abre o P2 e aceitar chama a callable com o vínculo', async () => {
    const host = await open('/professor/arenas');
    buttons(host, 'Ver convite')[0]!.click();
    await tick();
    const dialog = document.querySelector('app-professor-invite-dialog') as HTMLElement;
    expect(dialog?.textContent).toContain('Convite da Arena Sul');
    expect(dialog.textContent).toContain('“Queremos você no time.”');
    expect(dialog.textContent).toContain('Seus vínculos com Arena Norte continuam iguais.');

    buttons(dialog, 'Aceitar e entrar na equipe')[0]!.click();
    await tick();
    expect(service.respondToInvite).toHaveBeenCalledWith('sul_me', true, null);
  });

  it('"Recusar" do banner abre o convite já no passo de recusa, com motivo opcional', async () => {
    const host = await open('/professor/arenas');
    buttons(host, 'Recusar')[0]!.click();
    await tick();
    const dialog = document.querySelector('app-professor-invite-dialog') as HTMLElement;
    const textarea = dialog.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Sem agenda';
    textarea.dispatchEvent(new Event('input'));
    buttons(dialog, 'Confirmar recusa')[0]!.click();
    await tick();
    expect(service.respondToInvite).toHaveBeenCalledWith('sul_me', false, 'Sem agenda');
  });

  it('encerrar pede confirmação e chama endLink', async () => {
    const host = await open('/professor/arenas');
    buttons(host, 'Encerrar vínculo')[0]!.click();
    await tick();
    const dialog = document.querySelector('app-professor-confirm-dialog') as HTMLElement;
    expect(dialog.textContent).toContain('Encerrar vínculo com a Arena Norte?');
    expect(dialog.textContent).toContain('Encerrar aqui não afeta seus vínculos com outras arenas.');
    buttons(dialog, 'Encerrar vínculo')[0]!.click();
    await tick();
    expect(service.endLink).toHaveBeenCalledWith('norte_me', null);
  });

  it('"Solicitar novo vínculo" abre o P3 na mesma arena e mostra o M4 depois de enviar', async () => {
    const host = await open('/professor/arenas');
    buttons(host, 'Solicitar novo vínculo')[0]!.click();
    await tick();
    const dialog = document.querySelector('app-professor-request-dialog') as HTMLElement;
    expect(dialog.querySelector('.pf-req-arena-name')?.textContent).toContain('Beach Point');
    expect(dialog.textContent).toContain('Até a aprovação você não pode reservar quadras nem aparecer no perfil da arena.');

    buttons(dialog, 'Enviar solicitação')[0]!.click();
    await tick();
    expect(service.requestLink).toHaveBeenCalledWith({ arenaId: 'bp', relationshipType: 'INDEPENDENT', message: '' });
    expect(dialog.textContent).toContain('Solicitação enviada');
    expect(dialog.textContent).toContain('A Beach Point vai analisar seu pedido.');
  });

  it('duplicado do servidor vira o M5 com "Ver pedido atual"', async () => {
    const host = await open('/professor/arenas');
    service.requestLink.and.rejectWith({
      code: 'functions/already-exists',
      message: 'Você já tem um pedido aqui.',
      details: { linkId: 'bp_me', status: 'PENDING', initiatedBy: 'PROFESSOR' },
    });
    buttons(host, 'Solicitar novo vínculo')[0]!.click();
    await tick();
    const dialog = document.querySelector('app-professor-request-dialog') as HTMLElement;
    buttons(dialog, 'Enviar solicitação')[0]!.click();
    await tick();
    expect(dialog.querySelector('.pf-dialog-title')?.textContent).toContain('Você já tem um pedido aqui');
    expect(buttons(dialog, 'Ver pedido atual').length).toBe(1);
  });

  it('sem vínculos: estado vazio explica como pedir pela página da arena', async () => {
    const host = await open('/professor/arenas', []);
    expect(host.querySelector('.pf-empty')?.textContent).toContain('Você ainda não tem vínculos com arenas');
    expect(host.querySelector('.pf-empty')?.textContent).toContain('Solicitar vínculo');
  });

  it('detalhe: breadcrumb, permissões efetivas e histórico do mais recente', async () => {
    const events: ProfessorLinkEvent[] = [
      {
        id: 'e2',
        eventType: 'APPROVED',
        actorUserId: 'g',
        actorName: 'Carla Nogueira',
        actorRole: 'ARENA',
        cycle: 1,
        fromStatus: 'PENDING',
        toStatus: 'ACTIVE',
        reason: null,
        metadata: {},
        createdAt: new Date(2026, 4, 6),
      },
      {
        id: 'e1',
        eventType: 'REQUESTED',
        actorUserId: 'me',
        actorName: 'Thiago Mendes',
        actorRole: 'PROFESSOR',
        cycle: 1,
        fromStatus: null,
        toStatus: 'PENDING',
        reason: null,
        metadata: { relationshipType: 'INDEPENDENT' },
        createdAt: new Date(2026, 4, 5),
      },
    ];
    const host = await open('/professor/arenas/norte_me', LINKS, events);
    expect(service.watchEvents).toHaveBeenCalledWith('norte_me', jasmine.any(Function), jasmine.any(Function));
    expect(host.querySelector('.pf-crumbs')?.textContent).toContain('Minhas arenas');
    expect(host.querySelector('.pf-crumbs h1')?.textContent).toContain('Arena Norte');
    expect(host.querySelector('.pf-page-sub')?.textContent).toContain('Vínculo ativo desde 06 mai 2026');
    const titles = [...host.querySelectorAll('app-pf-timeline .title')].map((e) => e.textContent?.trim());
    expect(titles).toEqual(['Solicitação aprovada como Independente', 'Você solicitou vínculo · Independente']);
    const perms = [...host.querySelectorAll('app-pf-perm-list li')].map((li) => li.classList.contains('on'));
    expect(perms).toEqual([true, true, false]);
    expect(buttons(host, 'Encerrar vínculo').length).toBe(1);
  });

  it('detalhe de vínculo que não é da conta: "Vínculo não encontrado"', async () => {
    const host = await open('/professor/arenas/outro_x');
    expect(host.querySelector('.pf-notfound')?.textContent).toContain('Vínculo não encontrado');
  });
});
