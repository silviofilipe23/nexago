import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
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
    const group = host.querySelector('button.nav-item')!;
    expect(group.textContent!.trim()).toContain('Loja');
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.subnav')).toBeNull();
  });

  it('abre o grupo no clique e fecha no clique seguinte', async () => {
    const host = await mount();
    const group = host.querySelector('button.nav-item') as HTMLButtonElement;

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
    const group = getComputedStyle(host.querySelector('button.nav-item')!);
    const link = getComputedStyle(host.querySelector('a.nav-item')!);
    expect(group.textAlign).toBe('left');
    expect(group.fontFamily).toBe(link.fontFamily);
    expect(group.fontSize).toBe(link.fontSize);
    expect(group.fontWeight).toBe(link.fontWeight);
  });

  it('abrir o grupo na mão não o destaca: o destaque é da rota', async () => {
    const host = await mount();
    const group = host.querySelector('button.nav-item') as HTMLButtonElement;
    group.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(group.classList.contains('active')).toBeFalse();
  });

  it('Produtos e Retirada & frete são links; os outros filhos são "Em breve"', async () => {
    const host = await mount();
    (host.querySelector('button.nav-item') as HTMLButtonElement).click();
    await TestBed.inject(ApplicationRef).whenStable();

    const links = [...host.querySelectorAll('.subnav a.nav-item')].map((e) => e.textContent!.trim());
    expect(links.length).toBe(2);
    expect(links[0]).toContain('Produtos');
    expect(links[1]).toContain('Retirada & frete');
    expect(host.querySelector('.subnav a.nav-item')!.getAttribute('href')).toBe(
      '/painel/loja/produtos',
    );
  });

  it('mostra o badge dos filhos que têm contador', async () => {
    const host = await mount();
    (host.querySelector('button.nav-item') as HTMLButtonElement).click();
    await TestBed.inject(ApplicationRef).whenStable();

    const pedidos = [...host.querySelectorAll('.subnav .nav-item')].find((e) =>
      e.textContent!.includes('Pedidos'),
    )!;
    expect(pedidos.querySelector('.badge')!.textContent!.trim()).toBe('12');
  });
});
