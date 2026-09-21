import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { FinanceiroReachStatus } from '../data/tournament-role';
import type { OrganizerTournament, TournamentRole } from '../data/tournament.model';
import { FinanceiroReachService } from './financeiro-reach.service';
import { PanelShellComponent } from './panel-shell.component';
import { PanelContextService } from './panel-context.service';
import { OgBellComponent } from './og-bell.component';

/** `og-bell` de verdade abre um `onSnapshot` real contra o Firestore de produção — sem sentido
 *  (e sem rede) nestes testes de gaveta e de menu, que não olham pra notificação nenhuma. */
@Component({ selector: 'og-bell', template: '' })
class OgBellStub {}

/** `MediaQueryList` de mentira com `matches` controlável, pra simular girar o tablet
 *  sem depender do tamanho real da janela do runner. */
function fakeMediaQueryList(initial: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
  };
  return {
    mql: mql as unknown as MediaQueryList,
    /** Simula a mudança de largura (girar o iPad, redimensionar a janela). */
    emit(matches: boolean) {
      mql.matches = matches;
      for (const fn of listeners) fn({ matches } as MediaQueryListEvent);
    },
    removedListeners: () => listeners.size === 0,
  };
}

function authStub() {
  return {
    isSuperAdmin: signal(false),
    user: signal({ uid: 'u1', email: 'org@nexago.com', photoURL: null }),
    displayName: signal('Organizador Teste'),
    signOutUser: () => Promise.resolve(),
  };
}

function ctxStub() {
  return {
    level: signal<'global' | 'liga' | 'torneio' | 'categoria'>('global'),
    tournament: signal(null),
    league: signal(null),
    category: signal(null),
    tournamentId: signal(null),
    leagueBase: signal(null),
    tournamentBase: signal(null),
    categoryBase: signal(null),
  };
}

/** O serviço de verdade lê `listMyTournaments` do Firestore no construtor — teste unitário
 *  não fala com projeto vivo. `null` = alcance desconhecido (carregando ou falhou). */
function reachStub(tournaments: OrganizerTournament[] | null) {
  return {
    status: signal<FinanceiroReachStatus>(tournaments ? 'carregado' : 'desconhecido'),
    tournaments: signal(tournaments ?? []),
  };
}

function tournament(id: string, myRole: TournamentRole): OrganizerTournament {
  return { id, name: id, myRole } as OrganizerTournament;
}

/** Monta o shell com a largura pedida. `compact` = abaixo de 1024px, onde vira gaveta. */
async function mountShell(
  compact: boolean,
  reach: ReturnType<typeof reachStub>,
): Promise<{ fixture: ComponentFixture<PanelShellComponent>; media: ReturnType<typeof fakeMediaQueryList> }> {
  const media = fakeMediaQueryList(compact);
  spyOn(window, 'matchMedia').and.returnValue(media.mql);

  TestBed.overrideComponent(PanelShellComponent, { remove: { imports: [OgBellComponent] }, add: { imports: [OgBellStub] } });
  await TestBed.configureTestingModule({
    imports: [PanelShellComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: AuthService, useValue: authStub() },
      { provide: PanelContextService, useValue: ctxStub() },
      { provide: FinanceiroReachService, useValue: reach },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PanelShellComponent);
  await fixture.whenStable();
  return { fixture, media };
}

describe('PanelShellComponent — gaveta de tablet', () => {
  let fixture: ComponentFixture<PanelShellComponent>;
  let media: ReturnType<typeof fakeMediaQueryList>;

  async function mount(compact: boolean): Promise<void> {
    ({ fixture, media } = await mountShell(compact, reachStub([])));
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function burger(): HTMLButtonElement {
    return host().querySelector('.og-topbar-burger')!;
  }

  it('começa fechada e abre no hambúrguer', async () => {
    await mount(true);
    expect(host().classList).not.toContain('drawer-open');

    burger().click();
    await fixture.whenStable();

    expect(host().classList).toContain('drawer-open');
    expect(burger().getAttribute('aria-expanded')).toBe('true');
  });

  it('deixa o conteúdo inerte com a gaveta aberta, e a gaveta inerte com ela fechada', async () => {
    await mount(true);
    const nav = host().querySelector('.og-sidebar')!;
    const main = host().querySelector('.og-main')!;

    // Fechada: a gaveta está fora da tela, então não pode receber Tab.
    expect(nav.hasAttribute('inert')).toBe(true);
    expect(main.hasAttribute('inert')).toBe(false);

    burger().click();
    await fixture.whenStable();

    expect(nav.hasAttribute('inert')).toBe(false);
    expect(main.hasAttribute('inert')).toBe(true);
  });

  it('nunca marca nada como inerte em largura de desktop', async () => {
    await mount(false);
    expect(host().querySelector('.og-sidebar')!.hasAttribute('inert')).toBe(false);
    expect(host().querySelector('.og-main')!.hasAttribute('inert')).toBe(false);
  });

  it('fecha ao navegar — todo item da gaveta leva pra outra tela', async () => {
    await mount(true);
    burger().click();
    await fixture.whenStable();
    expect(host().classList).toContain('drawer-open');

    await TestBed.inject(Router).navigateByUrl('/painel/eventos');
    await fixture.whenStable();

    expect(host().classList).not.toContain('drawer-open');
  });

  it('fecha ao girar pra paisagem — senão o conteúdo fica inerte atrás de uma sidebar fixa', async () => {
    await mount(true);
    burger().click();
    await fixture.whenStable();

    media.emit(false);
    await fixture.whenStable();

    expect(host().classList).not.toContain('drawer-open');
    expect(host().querySelector('.og-main')!.hasAttribute('inert')).toBe(false);
  });

  it('solta o listener de largura ao destruir', async () => {
    await mount(true);
    fixture.destroy();
    expect(media.removedListeners()).toBe(true);
  });
});

describe('PanelShellComponent — item Financeiro no menu', () => {
  /** Rótulos dos itens da sidebar, na ordem em que a pessoa os lê. */
  async function navLabels(reach: ReturnType<typeof reachStub>): Promise<string[]> {
    const { fixture } = await mountShell(false, reach);
    const host = fixture.nativeElement as HTMLElement;
    return [...host.querySelectorAll('.og-sidebar .og-nav-item-label')].map((el) => el.textContent!.trim());
  }

  it('dono de um evento vê o item', async () => {
    expect(await navLabels(reachStub([tournament('a', 'owner')]))).toContain('Financeiro');
  });

  it('só administrador do evento NÃO vê o item', async () => {
    expect(await navLabels(reachStub([tournament('a', 'eventAdmin')]))).not.toContain('Financeiro');
  });

  it('alcance desconhecido (carregando ou falhou) mostra o item — falha aberto', async () => {
    expect(await navLabels(reachStub(null))).toContain('Financeiro');
  });
});
