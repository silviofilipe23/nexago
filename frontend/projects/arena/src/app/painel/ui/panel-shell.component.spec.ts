import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { NAV_ITEMS } from './panel-nav.model';
import { PanelShellComponent } from './panel-shell.component';
import { ViewportService } from './viewport.service';

/** Destino genérico pro roteador de teste: só precisa existir pra alguma rota
 *  bater e a navegação terminar em NavigationEnd, nunca é renderizado (nenhum
 *  teste monta um router-outlet). */
@Component({ selector: 'test-route-stub', template: '' })
class RouteStubComponent {}

function configure(opts: { compact: boolean; phone: boolean }): void {
  TestBed.configureTestingModule({
    imports: [PanelShellComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: RouteStubComponent }]),
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
}

function mount(opts: { compact: boolean; phone: boolean }): ComponentFixture<PanelShellComponent> {
  configure(opts);
  const fixture = TestBed.createComponent(PanelShellComponent);
  fixture.detectChanges();
  return fixture;
}

/** Mesmo setup do `mount`, mas navega ANTES de criar o componente -- assim
 *  `router.url` já reflete o destino quando o shell lê a rota ativa no
 *  construtor, sem precisar de router-outlet nem de esperar NavigationEnd
 *  depois de montado. */
async function mountAt(
  path: string,
  opts: { compact: boolean; phone: boolean },
): Promise<ComponentFixture<PanelShellComponent>> {
  configure(opts);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(path);

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
    // fixa, então os itens de baixo sumiam sem barra de rolagem e sem a página
    // rolar. Num MacBook Air 13" sumiam 10 dos 21.
    const fixture = mount({ compact: false, phone: false });
    const nav = fixture.nativeElement.querySelector('.nav') as HTMLElement;

    expect(nav).withContext('menu não renderizou').toBeTruthy();
    // Afirma o contrato positivo, não só a negação de um valor específico:
    // 'visible' e 'clip' também cortariam a lista em silêncio e passariam
    // num `not.toBe('hidden')`, que é exatamente o bug que isto existe pra
    // pegar.
    expect(['auto', 'scroll']).toContain(getComputedStyle(nav).overflowY);
  });

  it('todo item do dono é alcançável abrindo os grupos', () => {
    const fixture = mount({ compact: false, phone: false });

    const grupos = fixture.nativeElement.querySelectorAll('.nav .nav-group-head');
    expect(grupos.length).withContext('esperado 5 grupos para o dono').toBe(5);

    const vistos = new Set<string>();
    // Cada grupo abre um de cada vez (abrir um fecha o outro), então recolhe
    // tudo o que aparecer a cada passada até cobrir os 21.
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
        .withContext(`'${item.id}' não é alcançável por nenhum grupo`)
        .toContain(item.id);
    }
  });

  it('cabeçalho de grupo é button com aria-expanded', () => {
    const fixture = mount({ compact: false, phone: false });
    const cabecalhos = fixture.nativeElement.querySelectorAll('.nav-group-head');

    expect(cabecalhos.length).toBeGreaterThan(0);
    for (const head of Array.from(cabecalhos) as HTMLElement[]) {
      expect(head.tagName).toBe('BUTTON');
      expect(head.getAttribute('aria-expanded')).toMatch(/^(true|false)$/);
    }
  });

  it('o chevron do cabeçalho gira quando o grupo abre', () => {
    // O ícone é o mesmo (PanelIconName não tem chevron-down), então quem
    // indica aberto/fechado é a rotação por CSS -- sem este teste, uma regra
    // de rotação morta (mirando o lugar errado do DOM) passa batido pelos
    // outros 12 testes, porque nenhum deles mede o `transform` computado.
    const fixture = mount({ compact: false, phone: false });
    const head = fixture.nativeElement.querySelector('.nav .nav-group-head') as HTMLButtonElement;
    const icone = head.querySelector('ar-icon') as HTMLElement;

    expect(icone).withContext('ar-icon não encontrado no cabeçalho do grupo').toBeTruthy();
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(getComputedStyle(icone).transform)
      .withContext('ícone deveria começar sem rotação, com o grupo fechado')
      .toBe('none');

    head.click();
    fixture.detectChanges();

    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(getComputedStyle(icone).transform)
      .withContext('ícone não girou quando o grupo abriu -- regra de rotação morta ou mirando o lugar errado')
      .not.toBe('none');
  });

  it('fecha o grupo da rota ativa de verdade, sem o fallback reabrir sozinho', async () => {
    // 'agenda' é do grupo 'operacao', que é o primeiro grupo da lista. Sem
    // nada guardado ainda, isOpen cai no fallback da rota ativa e começa
    // aberto. O bug: toggleGroup gravava `null` ao fechar, e `null` também
    // significa "nada guardado" -- então isOpen caía de volta no MESMO
    // fallback e o grupo nunca fechava (o clique virava no-op silencioso).
    const fixture = await mountAt('/painel/agenda', { compact: false, phone: false });
    const operacao = fixture.nativeElement.querySelector('.nav .nav-group-head') as HTMLButtonElement;

    expect(operacao.getAttribute('aria-expanded'))
      .withContext('grupo da rota ativa deveria começar aberto pelo fallback')
      .toBe('true');

    operacao.click();
    fixture.detectChanges();

    expect(operacao.getAttribute('aria-expanded'))
      .withContext('fechar o grupo da rota ativa não fechou -- o fallback reabriu sozinho')
      .toBe('false');
  });

  it('fechar um grupo não reabre o grupo da rota ativa sozinho', async () => {
    // Mesmo cenário do relato: com 'operacao' aberto pelo fallback da rota
    // ativa, abrir 'vendas' (accordion: só um aberto por vez) e depois fechar
    // 'vendas' de novo. 'operacao' NÃO pode voltar sozinho -- essa era a
    // segunda metade do bug ("fechar VENDAS grava null e reabre OPERACAO").
    const fixture = await mountAt('/painel/agenda', { compact: false, phone: false });
    const cabecalhos = Array.from(
      fixture.nativeElement.querySelectorAll('.nav .nav-group-head'),
    ) as HTMLButtonElement[];
    const operacao = cabecalhos[0]!;
    const vendas = cabecalhos[1]!;

    expect(operacao.getAttribute('aria-expanded')).toBe('true');

    vendas.click();
    fixture.detectChanges();
    expect(vendas.getAttribute('aria-expanded')).toBe('true');
    expect(operacao.getAttribute('aria-expanded'))
      .withContext('abrir outro grupo deveria fechar o de operacao (accordion)')
      .toBe('false');

    vendas.click();
    fixture.detectChanges();

    expect(vendas.getAttribute('aria-expanded')).toBe('false');
    expect(operacao.getAttribute('aria-expanded'))
      .withContext("fechar 'vendas' reabriu 'operacao' sozinho -- o bug original")
      .toBe('false');
  });

  it('o grupo aberto sobrevive a uma instância nova do serviço (recarga fria)', () => {
    const primeira = mount({ compact: false, phone: false });
    const vendas = Array.from(
      primeira.nativeElement.querySelectorAll('.nav .nav-group-head'),
    )[1] as HTMLButtonElement;

    vendas.click();
    primeira.detectChanges();
    expect(vendas.getAttribute('aria-expanded')).toBe('true');

    // Simula uma recarga fria: reseta o injetor raiz -- nova instância de
    // PanelNavStateService, cache em memória vazio -- mas o localStorage real
    // do navegador sobrevive ao reset. Sem o efeito reativo no construtor (em
    // vez de ler o arenaId uma vez só no inicializador do campo), a escolha
    // gravada seria perdida aqui.
    TestBed.resetTestingModule();

    const segunda = mount({ compact: false, phone: false });
    const vendasNova = Array.from(
      segunda.nativeElement.querySelectorAll('.nav .nav-group-head'),
    )[1] as HTMLButtonElement;

    expect(vendasNova.getAttribute('aria-expanded'))
      .withContext('grupo aberto não sobreviveu a uma instância nova do serviço')
      .toBe('true');
  });

  it('restaura o grupo guardado quando o arenaId só resolve depois da montagem', () => {
    // No F5 real, ArenaContextService começa com arenaId() null até o
    // Firestore responder. Pré-grava 'vendas' aberto pra essa arena (uma
    // escolha de sessão anterior) e só DEPOIS resolve o arenaId -- se
    // storedGroup fosse lido uma vez só no inicializador do campo (em vez de
    // dentro de um effect), essa leitura tardia nunca aconteceria e a
    // escolha guardada seria perdida.
    localStorage.setItem('ar.nav.arena-1', JSON.stringify({ openGroup: 'vendas', scrollTop: 0 }));
    const arenaId = signal<string | null>(null);

    TestBed.configureTestingModule({
      imports: [PanelShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: RouteStubComponent }]),
        { provide: AuthService, useValue: { user: () => ({ email: 'dono@arena.com' }) } },
        {
          provide: ArenaContextService,
          useValue: {
            arenaId,
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
        { provide: ViewportService, useValue: { isCompact: signal(false), isPhone: signal(false) } },
      ],
    });

    const fixture = TestBed.createComponent(PanelShellComponent);
    fixture.detectChanges();

    const vendas = fixture.nativeElement.querySelectorAll('.nav .nav-group-head')[1] as HTMLButtonElement;
    expect(vendas.getAttribute('aria-expanded'))
      .withContext('antes do arenaId resolver, nada foi lido ainda pra essa sessão')
      .toBe('false');

    arenaId.set('arena-1');
    fixture.detectChanges();

    expect(vendas.getAttribute('aria-expanded'))
      .withContext('arenaId resolveu depois da montagem e a escolha guardada não foi restaurada')
      .toBe('true');
  });

  it('no desktop não renderiza topbar nem bottom-nav', () => {
    const fixture = mount({ compact: false, phone: false });
    expect(fixture.nativeElement.querySelector('.topbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.bottom-nav')).toBeNull();
  });

  it('abaixo de 900px existe gatilho de menu no lugar da sidebar', () => {
    // A regressão que isso trava: hoje .sidebar vira display:none a 900px e
    // NADA entra no lugar -- a 834px o painel fica com zero rotas alcançáveis.
    const fixture = mount({ compact: true, phone: false });
    const gatilho = fixture.nativeElement.querySelector('.topbar [data-nav-trigger]');

    expect(gatilho).withContext('nenhum gatilho de navegação no modo compacto').toBeTruthy();
    expect(gatilho.getAttribute('aria-label')).toBeTruthy();
  });

  it('o gatilho abre o drawer com a árvore de navegação', () => {
    const fixture = mount({ compact: true, phone: false });
    const gatilho = fixture.nativeElement.querySelector(
      '.topbar [data-nav-trigger]',
    ) as HTMLButtonElement;

    gatilho.click();
    fixture.detectChanges();

    const drawer = fixture.nativeElement.querySelector('ar-drawer');
    expect(drawer).withContext('drawer não abriu').toBeTruthy();
    // Os 5 grupos mais o Início solto: é a árvore inteira, mesmo com grupos
    // recolhidos (que não renderizam filhos).
    expect(drawer.querySelectorAll('.nav-group-head').length).toBe(5);
    expect(drawer.querySelector('.nav-item[data-nav-id="inicio"]')).toBeTruthy();
  });

  it('a bottom-nav tem no máximo 5 slots e nenhum vazio', () => {
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

  it('a bottom-nav reserva a área segura do iPhone', () => {
    const fixture = mount({ compact: true, phone: true });
    const bar = fixture.nativeElement.querySelector('.bottom-nav') as HTMLElement;

    expect(bar).withContext('bottom-nav não renderizou').toBeTruthy();
    expect(getComputedStyle(bar).position).toBe('fixed');

    // Não dá pra medir env() computado no Chrome headless, então a asserção
    // de verdade é que a declaração exista na folha de estilo injetada --
    // `position: fixed` sozinho passaria mesmo se a linha do padding-bottom
    // fosse apagada. Recorta só o bloco da regra `.bottom-nav`: o componente
    // tem OUTRO env(safe-area-inset-bottom) (no `.content` do host `.phone`),
    // então procurar a string solta na folha inteira passaria mesmo com a
    // regra certa apagada.
    const estilos = Array.from(document.querySelectorAll('style'))
      .map((el) => el.textContent ?? '')
      .join('\n');
    const regraBottomNav = estilos.match(/\.bottom-nav\b[^{]*\{[^}]*\}/);

    expect(regraBottomNav)
      .withContext('regra .bottom-nav não encontrada na folha de estilo injetada')
      .toBeTruthy();
    expect(regraBottomNav?.[0] ?? '')
      .withContext('a regra .bottom-nav não declara env(safe-area-inset-bottom)')
      .toContain('safe-area-inset-bottom');
  });
});
