import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

  it('a bottom-nav fica com seis itens — o teto que o layout aguenta em 320px', async () => {
    await build(1);
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.at-bottom-nav .at-bottom-nav-item');
    expect(items.length).toBe(6);
  });
});
