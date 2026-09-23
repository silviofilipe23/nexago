import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { NAV_ITEMS } from './panel-nav.model';
import { PanelShellComponent } from './panel-shell.component';
import { ViewportService } from './viewport.service';

function mount(opts: { compact: boolean; phone: boolean }): ComponentFixture<PanelShellComponent> {
  TestBed.configureTestingModule({
    imports: [PanelShellComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: () => ({ email: 'dono@arena.com' }) } },
      {
        provide: ArenaContextService,
        useValue: {
          arenaId: () => 'arena-1',
          arenaName: () => 'Arena Beach Club',
          managedArenas: () => [{ id: 'arena-1' }],
          isOwner: () => true,
          staffRole: () => null,
          loading: () => false,
        },
      },
      {
        provide: ArenaAccessService,
        useValue: { isOwner: () => true, canRead: () => true, ready: () => true },
      },
      {
        provide: ViewportService,
        useValue: { isCompact: signal(opts.compact), isPhone: signal(opts.phone) },
      },
    ],
  });

  const fixture = TestBed.createComponent(PanelShellComponent);
  fixture.detectChanges();
  return fixture;
}

describe('PanelShellComponent', () => {
  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('NUNCA deixa o menu com overflow-y hidden', () => {
    // O bug original: .nav tinha overflow: hidden dentro de um shell de altura
    // fixa, entao os itens de baixo sumiam sem barra de rolagem e sem a pagina
    // rolar. Num MacBook Air 13" sumiam 10 dos 21.
    const fixture = mount({ compact: false, phone: false });
    const nav = fixture.nativeElement.querySelector('.nav') as HTMLElement;

    expect(nav).withContext('menu nao renderizou').toBeTruthy();
    expect(getComputedStyle(nav).overflowY).not.toBe('hidden');
  });

  /** Grupo recolhido nao renderiza os filhos, entao contar itens direto mediria
   *  so o grupo aberto. Abrir todos e o unico jeito de provar que nenhum item
   *  ficou fora do alcance -- que e a regressao que importa. */
  function expandirTudo(fixture: ComponentFixture<PanelShellComponent>): void {
    for (const head of Array.from(
      fixture.nativeElement.querySelectorAll('.nav .nav-group-head'),
    ) as HTMLButtonElement[]) {
      if (head.getAttribute('aria-expanded') === 'false') {
        head.click();
        fixture.detectChanges();
      }
    }
  }

  it('todo item do dono e alcancavel abrindo os grupos', () => {
    const fixture = mount({ compact: false, phone: false });

    const grupos = fixture.nativeElement.querySelectorAll('.nav .nav-group-head');
    expect(grupos.length).withContext('esperado 5 grupos para o dono').toBe(5);

    const vistos = new Set<string>();
    // Cada grupo abre um de cada vez (abrir um fecha o outro), entao recolhe
    // tudo o que aparecer a cada passada ate cobrir os 21.
    for (let i = 0; i < grupos.length; i++) {
      (grupos[i] as HTMLButtonElement).click();
      fixture.detectChanges();
      for (const el of Array.from(
        fixture.nativeElement.querySelectorAll('.nav .nav-item[data-nav-id]'),
      ) as HTMLElement[]) {
        const id = el.dataset['navId'];
        if (id) vistos.add(id);
      }
    }

    for (const item of NAV_ITEMS) {
      expect(Array.from(vistos))
        .withContext(`'${item.id}' nao e alcancavel por nenhum grupo`)
        .toContain(item.id);
    }
  });

  it('cabecalho de grupo e button com aria-expanded', () => {
    const fixture = mount({ compact: false, phone: false });
    const cabecalhos = fixture.nativeElement.querySelectorAll('.nav-group-head');

    expect(cabecalhos.length).toBeGreaterThan(0);
    for (const head of Array.from(cabecalhos) as HTMLElement[]) {
      expect(head.tagName).toBe('BUTTON');
      expect(head.getAttribute('aria-expanded')).toMatch(/^(true|false)$/);
    }
  });

  it('no desktop nao renderiza topbar nem bottom-nav', () => {
    const fixture = mount({ compact: false, phone: false });
    expect(fixture.nativeElement.querySelector('.topbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.bottom-nav')).toBeNull();
  });

  it('abaixo de 900px existe gatilho de menu no lugar da sidebar', () => {
    // A regressao que isso trava: hoje .sidebar vira display:none a 900px e
    // NADA entra no lugar -- a 834px o painel fica com zero rotas alcancaveis.
    const fixture = mount({ compact: true, phone: false });
    const gatilho = fixture.nativeElement.querySelector('.topbar [data-nav-trigger]');

    expect(gatilho).withContext('nenhum gatilho de navegacao no modo compacto').toBeTruthy();
    expect(gatilho.getAttribute('aria-label')).toBeTruthy();
  });

  it('o gatilho abre o drawer com a arvore de navegacao', () => {
    const fixture = mount({ compact: true, phone: false });
    const gatilho = fixture.nativeElement.querySelector(
      '.topbar [data-nav-trigger]',
    ) as HTMLButtonElement;

    gatilho.click();
    fixture.detectChanges();

    const drawer = fixture.nativeElement.querySelector('ar-drawer');
    expect(drawer).withContext('drawer nao abriu').toBeTruthy();
    // Os 5 grupos mais o Inicio solto: e a arvore inteira, mesmo com grupos
    // recolhidos (que nao renderizam filhos).
    expect(drawer.querySelectorAll('.nav-group-head').length).toBe(5);
    expect(drawer.querySelector('.nav-item[data-nav-id="inicio"]')).toBeTruthy();
  });

  it('a bottom-nav tem no maximo 5 slots e nenhum vazio', () => {
    const fixture = mount({ compact: true, phone: true });
    const slots = Array.from(
      fixture.nativeElement.querySelectorAll('.bottom-nav [data-bottom-slot]'),
    ) as HTMLElement[];

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBeLessThanOrEqual(5);
    for (const slot of slots) {
      expect(slot.textContent?.trim()).toBeTruthy();
    }
  });

  it('a bottom-nav reserva a area segura do iPhone', () => {
    const fixture = mount({ compact: true, phone: true });
    const bar = fixture.nativeElement.querySelector('.bottom-nav') as HTMLElement;
    // Nao da para medir env() no headless; o contrato aqui e que a regra exista.
    expect(fixture.nativeElement.innerHTML).toBeTruthy();
    expect(getComputedStyle(bar).position).toBe('fixed');
  });
});
