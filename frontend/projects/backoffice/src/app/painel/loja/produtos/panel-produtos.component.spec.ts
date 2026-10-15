import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { STORE_PRODUCTS } from './data/products.mock';
import { ProductsRepository, type StoreProduct } from './data/products.repository';
import { PanelProdutosComponent } from './panel-produtos.component';

describe('PanelProdutosComponent', () => {
  let fixture: ComponentFixture<PanelProdutosComponent>;

  async function mount(
    options: { rows?: StoreProduct[]; fail?: boolean; params?: Record<string, string> } = {},
  ): Promise<HTMLElement> {
    const rows = options.rows ?? STORE_PRODUCTS.map((p) => ({ ...p }));
    await TestBed.configureTestingModule({
      imports: [PanelProdutosComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(options.params ?? {}) } },
        },
        {
          provide: ProductsRepository,
          useValue: {
            list: () => (options.fail ? Promise.reject(new Error('falhou')) : Promise.resolve(rows)),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PanelProdutosComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  /** A leitura é promise fora do TestBed: deixa resolver e re-renderiza. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  const names = (host: HTMLElement) =>
    [...host.querySelectorAll('.cell-product .name')].map((e) => e.textContent!.trim());

  it('lista os produtos do repositório', async () => {
    const host = await mount();
    expect(names(host).length).toBe(8);
    expect(names(host)[0]).toBe('Bola NexaGO Pro Beach');
  });

  it('mostra total de produtos e de SKUs no cabeçalho', async () => {
    const host = await mount();
    expect(host.querySelector('.count-pill')!.textContent).toContain('8 produtos');
    expect(host.querySelector('.count-pill')!.textContent).toContain('31 SKUs');
  });

  it('mostra preço de agora e preço antigo riscado', async () => {
    const host = await mount();
    const first = host.querySelector('.cell-price')!;
    expect(first.querySelector('.now')!.textContent).toContain('289,90');
    expect(first.querySelector('.was')!.textContent).toContain('329,90');
  });

  it('pill de esgotado e de estoque baixo', async () => {
    const host = await mount();
    const cells = [...host.querySelectorAll('.cell-stock')].map((e) => e.textContent!.trim());
    // O caixa-alta do pill é CSS: o texto no DOM continua como foi escrito.
    expect(cells.some((t) => t.includes('Esgotado'))).toBeTrue();
    expect(cells.some((t) => t.includes('Baixo'))).toBeTrue();
    expect(cells.some((t) => t === '86 un.')).toBeTrue();
  });

  it('ações de escrita ficam desabilitadas', async () => {
    const host = await mount();
    const novo = host.querySelector('.header-actions .bo-mini-btn-primary') as HTMLButtonElement;
    expect(novo.disabled).toBeTrue();
    expect(novo.title).toBe('Em breve');
  });

  it('erro na leitura mostra o aviso e o botão de tentar de novo', async () => {
    const host = await mount({ fail: true });
    expect(host.querySelector('.bo-alert')).not.toBeNull();
    expect(host.textContent).toContain('Tentar de novo');
  });

  it('sem produto nenhum explica que não há cadastro', async () => {
    const host = await mount({ rows: [] });
    expect(host.textContent).toContain('Nenhum produto cadastrado');
  });

  const tabs = (host: HTMLElement) =>
    [...host.querySelectorAll('.tabs button')].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());

  const clickTab = async (host: HTMLElement, label: string) => {
    const button = [...host.querySelectorAll('.tabs button')].find((e) =>
      e.textContent!.includes(label),
    ) as HTMLButtonElement;
    button.click();
    await settle();
  };

  it('mostra as abas com os contadores do exemplo', async () => {
    const host = await mount();
    expect(tabs(host)).toEqual([
      'Todos 8',
      'Ativos 7',
      'Rascunhos 0',
      'Esgotados 1',
      'Estoque baixo 2',
    ]);
  });

  it('trocar de aba muda as linhas da tabela', async () => {
    const host = await mount();
    await clickTab(host, 'Esgotados');
    expect(names(host)).toEqual(['Mochila Praia Impermeável']);
  });

  it('desligar o toggle tira a linha da aba Ativos e baixa o contador', async () => {
    const host = await mount();
    await clickTab(host, 'Ativos');
    expect(names(host).length).toBe(7);

    const toggle = host.querySelector(
      'bo-product-row [role="switch"][aria-label^="Desativar Bola"]',
    ) as HTMLButtonElement;
    toggle.click();
    await settle();

    expect(names(host).length).toBe(6);
    expect(names(host)).not.toContain('Bola NexaGO Pro Beach');
    expect(tabs(host)).toContain('Ativos 6');
  });

  it('aba sem resultado explica e oferece limpar os filtros', async () => {
    const host = await mount();
    await clickTab(host, 'Rascunhos');
    expect(host.textContent).toContain('Nenhum produto com esses filtros');
    expect(host.querySelector('.empty .bo-mini-btn')).not.toBeNull();
  });

  const typeSearch = async (host: HTMLElement, text: string) => {
    const input = host.querySelector('.search-input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
  };

  it('busca por nome sem acento', async () => {
    const host = await mount();
    await typeSearch(host, 'oculos');
    expect(names(host)).toEqual(['Óculos Polarizado Sunline']);
  });

  it('busca por SKU', async () => {
    const host = await mount();
    await typeSearch(host, 'NX-RED');
    expect(names(host)).toEqual(['Rede Oficial Beach 8,5 m']);
  });

  it('chip de categoria filtra e clicar de novo limpa', async () => {
    const host = await mount();
    const chip = [...host.querySelectorAll('.bo-chip')].find((e) =>
      e.textContent!.includes('Rede & quadra'),
    ) as HTMLButtonElement;

    chip.click();
    await settle();
    expect(names(host).length).toBe(2);

    chip.click();
    await settle();
    expect(names(host).length).toBe(8);
  });

  it('abre já filtrado pelo que veio na URL', async () => {
    const host = await mount({ params: { aba: 'esgotados' } });
    expect(names(host)).toEqual(['Mochila Praia Impermeável']);
  });

  it('parâmetro inválido na URL não esvazia a lista', async () => {
    const host = await mount({ params: { aba: 'xpto', categoria: 'foo' } });
    expect(names(host).length).toBe(8);
  });

  it('escreve o filtro na URL sem empilhar histórico', async () => {
    const host = await mount();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    await clickTab(host, 'Esgotados');

    expect(navigate).toHaveBeenCalled();
    const [, extras] = navigate.calls.mostRecent().args as [unknown, { queryParams: unknown; replaceUrl: boolean }];
    expect(extras.queryParams).toEqual(
      jasmine.objectContaining({ aba: 'esgotados', q: null, categoria: null }),
    );
    expect(extras.replaceUrl).toBeTrue();
  });
});
