import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { SquadBadgesService } from '../data/squad-badges.service';
import { StoreBadgesService } from '../data/store-badges.service';
import { TournamentBadgesService } from '../data/tournament-badges.service';
import { PanelShellComponent } from './panel-shell.component';

describe('PanelShellComponent', () => {
  async function mount(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PanelShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelShellComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labels = (host: HTMLElement, selector: string) =>
    [...host.querySelectorAll(selector)].map((e) => e.textContent!.trim());

  const groupButton = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button.nav-item')].find((b) => b.textContent!.includes(label))!;

  it('renderiza os itens com rota como link', async () => {
    const host = await mount();
    const links = labels(host, 'a.nav-item');
    expect(links).toContain('Início');
    expect(links).toContain('Financeiro');
  });

  it('renderiza item sem rota como "Em breve" e não navegável', async () => {
    const host = await mount();
    const soon = [...host.querySelectorAll('.nav-item.disabled')].map((e) => e.textContent!.trim());
    expect(soon.some((t) => t.startsWith('Moderação'))).toBeTrue();
    expect(host.querySelector('a.nav-item[href*="moderacao"]')).toBeNull();
  });
  it('mostra o grupo Loja fechado fora da área, com os filhos escondidos', async () => {
    const host = await mount();
    const group = groupButton(host, 'Loja');
    expect(group.textContent!.trim()).toContain('Loja');
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.subnav')).toBeNull();
  });

  it('Squad fica entre Atletas e Financeiro, com os cinco filhos navegáveis', async () => {
    const host = await mount();
    const top = labels(host, '.nav > .nav-item');
    expect(top.indexOf('Squad')).toBe(top.indexOf('Atletas') + 1);
    expect(top.indexOf('Financeiro')).toBe(top.indexOf('Squad') + 1);

    groupButton(host, 'Squad').click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(labels(host, '.subnav .nav-item')).toEqual([
      'Visão geral',
      'Embaixadores',
      'Candidaturas',
      'Comissões',
      'Níveis & regras',
    ]);
    const links = [...host.querySelectorAll('.subnav a.nav-item')];
    expect(links.map((e) => e.getAttribute('href'))).toEqual([
      '/painel/squad/visao-geral',
      '/painel/squad/embaixadores',
      '/painel/squad/candidaturas',
      '/painel/squad/comissoes',
      '/painel/squad/niveis-regras',
    ]);
    // Sem comissão liberada: nenhuma contagem nos filhos.
    expect(host.querySelector('.subnav .badge')).toBeNull();
  });

  it('o badge de Comissões é o número de embaixadores com repasse a fazer', async () => {
    const host = await mount();
    TestBed.inject(SquadBadgesService).set(14);
    groupButton(host, 'Squad').click();
    await TestBed.inject(ApplicationRef).whenStable();
    const item = [...host.querySelectorAll('.subnav a.nav-item')].find((e) => e.textContent!.includes('Comissões'))!;
    expect(item.querySelector('.badge')!.textContent!.trim()).toBe('14');
  });

  it('Embaixadores mostra os contratos ativos e Candidaturas as novas', async () => {
    const host = await mount();
    const badges = TestBed.inject(SquadBadgesService);
    badges.setActiveContracts(20);
    badges.setNewApplications(3);
    groupButton(host, 'Squad').click();
    await TestBed.inject(ApplicationRef).whenStable();
    const badgeOf = (label: string) =>
      [...host.querySelectorAll('.subnav a.nav-item')].find((e) => e.textContent!.includes(label))!.querySelector('.badge')
        ?.textContent?.trim();
    expect(badgeOf('Embaixadores')).toBe('20');
    expect(badgeOf('Candidaturas')).toBe('3');
  });

  it('Torneios lista Contratos entre Planos e Sponsors, com o badge dos pedidos novos', async () => {
    const host = await mount();
    TestBed.inject(TournamentBadgesService).setRequestedContracts(2);
    groupButton(host, 'Torneios').click();
    await TestBed.inject(ApplicationRef).whenStable();
    const links = [...host.querySelectorAll('.subnav a.nav-item')];
    expect(links.map((e) => e.getAttribute('href'))).toEqual([
      '/painel/torneios',
      '/painel/torneios/planos',
      '/painel/torneios/contratos',
      '/painel/torneios/sponsors',
      '/painel/torneios/taxas',
    ]);
    const item = links.find((e) => e.textContent!.includes('Contratos'))!;
    expect(item.querySelector('.badge')!.textContent!.trim()).toBe('2');
  });

  it('abre o grupo no clique e fecha no clique seguinte', async () => {
    const host = await mount();
    const group = groupButton(host, 'Loja');

    group.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(group.getAttribute('aria-expanded')).toBe('true');
    const children = [...host.querySelectorAll('.subnav .nav-item')].map((e) => e.textContent!.trim());
    expect(children.some((t) => t.startsWith('Produtos'))).toBeTrue();
    expect(children.some((t) => t.startsWith('Pedidos'))).toBeTrue();

    group.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(group.getAttribute('aria-expanded')).toBe('false');
  });

  it('o cabeçalho do grupo usa a mesma fonte e alinhamento dos links', async () => {
    const host = await mount();
    const group = getComputedStyle(groupButton(host, 'Loja'));
    const link = getComputedStyle(host.querySelector('a.nav-item')!);
    expect(group.textAlign).toBe('left');
    expect(group.fontFamily).toBe(link.fontFamily);
    expect(group.fontSize).toBe(link.fontSize);
    expect(group.fontWeight).toBe(link.fontWeight);
  });

  it('abrir o grupo na mão não o destaca: o destaque é da rota', async () => {
    const host = await mount();
    const group = groupButton(host, 'Loja');
    group.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(group.classList.contains('active')).toBeFalse();
  });

  it('todos os filhos da Loja são links, na ordem do desenho', async () => {
    const host = await mount();
    groupButton(host, 'Loja').click();
    await TestBed.inject(ApplicationRef).whenStable();

    const links = [...host.querySelectorAll('.subnav a.nav-item')];
    expect(links.map((e) => e.textContent!.trim().replace(/\d+$/, '').trim())).toEqual([
      'Visão geral',
      'Pedidos',
      'Personalizados',
      'Produtos',
      'Estoque',
      'Retirada & frete',
      'Cupons & promoções',
      'Campanhas',
      'Trocas',
      'Avaliações',
    ]);
    expect(links.map((e) => e.getAttribute('href'))).toEqual([
      '/painel/loja/visao-geral',
      '/painel/loja/pedidos',
      '/painel/loja/personalizados',
      '/painel/loja/produtos',
      '/painel/loja/estoque',
      '/painel/loja/retirada',
      '/painel/loja/cupons',
      '/painel/loja/campanhas',
      '/painel/loja/trocas',
      '/painel/loja/avaliacoes',
    ]);
  });

  it('o badge de Personalizados é o número de artes para aprovar', async () => {
    const host = await mount();
    TestBed.inject(StoreBadgesService).setCustom(2);
    groupButton(host, 'Loja').click();
    await TestBed.inject(ApplicationRef).whenStable();
    const item = [...host.querySelectorAll('.subnav a.nav-item')].find((e) => e.textContent!.includes('Personalizados'))!;
    expect(item.querySelector('.badge')!.textContent!.trim()).toBe('2');
  });

  it('o badge de Trocas é o número para analisar', async () => {
    const host = await mount();
    TestBed.inject(StoreBadgesService).setReturns(2);
    groupButton(host, 'Loja').click();
    await TestBed.inject(ApplicationRef).whenStable();
    const trocas = [...host.querySelectorAll('.subnav a.nav-item')].find((e) => e.textContent!.includes('Trocas'))!;
    expect(trocas.querySelector('.badge')!.textContent!.trim()).toBe('2');
  });

  it('o badge do Estoque vem da contagem real de SKUs baixos', async () => {
    const host = await mount();
    TestBed.inject(StoreBadgesService).set(4);
    groupButton(host, 'Loja').click();
    await TestBed.inject(ApplicationRef).whenStable();
    const estoque = [...host.querySelectorAll('.subnav a.nav-item')].find((e) => e.textContent!.includes('Estoque'))!;
    expect(estoque.querySelector('.badge')!.textContent!.trim()).toBe('4');

    TestBed.inject(StoreBadgesService).set(0);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(estoque.querySelector('.badge')).toBeNull();
  });

  it('o badge de Pedidos é o número para separar', async () => {
    const host = await mount();
    TestBed.inject(StoreBadgesService).setOrders(9);
    groupButton(host, 'Loja').click();
    await TestBed.inject(ApplicationRef).whenStable();

    const pedidos = [...host.querySelectorAll('.subnav .nav-item')].find((e) =>
      e.textContent!.includes('Pedidos'),
    )!;
    expect(pedidos.querySelector('.badge')!.textContent!.trim()).toBe('9');

    TestBed.inject(StoreBadgesService).setOrders(0);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(pedidos.querySelector('.badge')).toBeNull();
  });
});
