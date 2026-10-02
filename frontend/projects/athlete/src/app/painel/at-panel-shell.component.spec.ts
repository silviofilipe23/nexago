import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { PartnerInvitesService } from '../data/partner-invites.service';
import { StaffTournamentsService } from '../data/staff-tournaments.service';
import { AtPanelShellComponent } from './at-panel-shell.component';

/** A Mesa é item condicional das DUAS navegações: só existe pra quem é equipe de torneio EM
 *  ANDAMENTO — a maioria dos atletas nunca opera nada e não deve ver um item que abre tela
 *  vazia. Precisa estar nas duas porque a sidebar some abaixo de 900px, e é justamente no
 *  celular que o mesário trabalha. */
describe('AtPanelShellComponent — item Mesa nas navegações', () => {
  let fixture: ComponentFixture<AtPanelShellComponent>;
  let count: ReturnType<typeof signal<number>>;

  function mesaItem(): HTMLAnchorElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.at-nav a[href="/mesa"]');
  }

  function mesaBottomItem(): HTMLAnchorElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.at-bottom-nav a[href="/mesa"]');
  }

  async function build(ongoing: number): Promise<void> {
    count.set(ongoing);
    fixture = TestBed.createComponent(AtPanelShellComponent);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    count = signal(0);
    await TestBed.configureTestingModule({
      imports: [AtPanelShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: StaffTournamentsService, useValue: { count } },
        { provide: PartnerInvitesService, useValue: { pending: signal([]), pendingCount: signal(0), markAnswered: () => {} } },
        // Sem usuário: o shell não busca a foto do perfil, e o menu não depende disso.
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  it('esconde a Mesa de quem não opera nenhum torneio', async () => {
    await build(0);
    expect(mesaItem()).toBeNull();
    expect(mesaBottomItem()).toBeNull();
  });

  it('mostra a Mesa nas duas navegações quando há torneio pra operar', async () => {
    await build(1);
    expect(mesaItem()?.textContent).toContain('Mesa');
    expect(mesaBottomItem()?.textContent).toContain('Mesa');
  });

  it('só conta os torneios no item quando há mais de um', async () => {
    await build(1);
    expect(mesaItem()?.querySelector('.at-nav-badge')).toBeNull();

    count.set(3);
    await fixture.whenStable();
    expect(mesaItem()?.querySelector('.at-nav-badge')?.textContent?.trim()).toBe('3');
  });

  it('some das duas assim que o último torneio encerra', async () => {
    await build(2);
    expect(mesaItem()).not.toBeNull();
    expect(mesaBottomItem()).not.toBeNull();

    count.set(0);
    await fixture.whenStable();
    expect(mesaItem()).toBeNull();
    expect(mesaBottomItem()).toBeNull();
  });

  // No desktop não há item "Competir": sem este, a lista de organizadores só se achava pelo
  // breadcrumb do perfil. No celular a entrada é o card no hub Competir.
  it('a sidebar do desktop tem o item Organizadores', async () => {
    await build(0);
    const item = (fixture.nativeElement as HTMLElement).querySelector('.at-nav a[href="/organizadores"]');
    expect(item?.textContent).toContain('Organizadores');
  });

  it('a bottom-nav fica com seis itens — o teto que o layout aguenta em 320px', async () => {
    await build(1);
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.at-bottom-nav .at-bottom-nav-item');
    expect(items.length).toBe(6);
  });
});

describe('AtPanelShellComponent — bottom-nav no fluxo de inscrição', () => {
  let fixture: ComponentFixture<AtPanelShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtPanelShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'painel', component: AtPanelShellComponent },
          { path: 'torneios/:id/inscricao/categoria', component: AtPanelShellComponent },
        ]),
        { provide: StaffTournamentsService, useValue: { count: signal(0) } },
        { provide: PartnerInvitesService, useValue: { pending: signal([]), pendingCount: signal(0), markAnswered: () => {} } },
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AtPanelShellComponent);
    await fixture.whenStable();
  });

  afterEach(() => fixture?.destroy());

  it('esconde a bottom-nav em /torneios/:id/inscricao e nas etapas do wizard', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/torneios/abc/inscricao/categoria');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.at-bottom-nav')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.at-shell--no-bottom-nav')).not.toBeNull();
  });

  it('mantém a bottom-nav fora do fluxo de inscrição', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/painel');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.at-bottom-nav')).not.toBeNull();
  });
});

/** O item Competir aponta só pra `/competir`, mas representa o hub inteiro: torneios, ligas,
 *  ranking, atletas e equipes também o acendem. Cada tela monta o PRÓPRIO shell, então o caso
 *  que importa é o shell nascer já numa dessas rotas (link compartilhado, F5, voltar) — era aí
 *  que o `routerLinkActive` do link apagava, um microtask depois, a classe que o sinal de prefixo
 *  tinha acabado de pôr. */
describe('AtPanelShellComponent — item Competir na bottom-nav', () => {
  const HUB_URLS = [
    '/competir',
    '/torneios',
    '/torneios/t1',
    '/ligas/l1',
    '/ranking',
    '/atletas',
    '/atletas/fulano',
    '/equipes',
    '/equipes/e1',
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtPanelShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(
          ['painel', 'agenda', 'competir', 'torneios', 'torneios/:id', 'ligas/:id', 'ranking', 'atletas', 'atletas/:handle', 'equipes', 'equipes/:teamId'].map(
            (path) => ({ path, component: AtPanelShellComponent }),
          ),
        ),
        { provide: StaffTournamentsService, useValue: { count: signal(0) } },
        { provide: PartnerInvitesService, useValue: { pending: signal([]), pendingCount: signal(0), markAnswered: () => {} } },
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    }).compileComponents();
  });

  function bottomItem(fixture: ComponentFixture<AtPanelShellComponent>, href: string): HTMLAnchorElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(`.at-bottom-nav a[href="${href}"]`);
    if (!el) throw new Error(`item ${href} ausente da bottom-nav`);
    return el;
  }

  function isActive(fixture: ComponentFixture<AtPanelShellComponent>, href: string): boolean {
    return bottomItem(fixture, href).classList.contains('at-bottom-nav-item--active');
  }

  /** Como a tela real: a navegação termina e só então a página monta o seu shell. */
  async function openAt(url: string): Promise<ComponentFixture<AtPanelShellComponent>> {
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(AtPanelShellComponent);
    await fixture.whenStable();
    return fixture;
  }

  async function navigate(fixture: ComponentFixture<AtPanelShellComponent>, url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  }

  for (const url of HUB_URLS) {
    it(`acende ao abrir ${url} direto`, async () => {
      const fixture = await openAt(url);
      expect(isActive(fixture, '/competir')).toBeTrue();
    });
  }

  it('não acende fora do hub — quem acende é o item da rota', async () => {
    const fixture = await openAt('/agenda');
    expect(isActive(fixture, '/competir')).toBeFalse();
    expect(isActive(fixture, '/agenda')).toBeTrue();
  });

  it('segue aceso ao trocar de seção do hub com o shell montado', async () => {
    const fixture = await openAt('/competir');
    await navigate(fixture, '/ranking');
    expect(isActive(fixture, '/competir')).toBeTrue();
    await navigate(fixture, '/torneios/t1');
    expect(isActive(fixture, '/competir')).toBeTrue();
  });

  it('apaga ao sair do hub e acende de novo ao voltar', async () => {
    const fixture = await openAt('/torneios');
    await navigate(fixture, '/painel');
    expect(isActive(fixture, '/competir')).toBeFalse();
    expect(isActive(fixture, '/painel')).toBeTrue();
    await navigate(fixture, '/equipes');
    expect(isActive(fixture, '/competir')).toBeTrue();
  });
});
