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
    // 22, não 31: o 31 vinha do campo solto do mock; agora é a contagem real de SKUs.
    expect(host.querySelector('.count-pill')!.textContent).toContain('22 SKUs');
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

  const checkboxes = (host: HTMLElement) =>
    [...host.querySelectorAll('bo-product-row input[type="checkbox"]')] as HTMLInputElement[];

  it('selecionar uma linha mostra a barra de lote com as ações desabilitadas', async () => {
    const host = await mount();
    checkboxes(host)[0]!.click();
    await settle();

    const bar = host.querySelector('.bulk-bar')!;
    expect(bar.textContent).toContain('1 selecionado');
    const actions = [...bar.querySelectorAll('button')] as HTMLButtonElement[];
    const comAcao = actions.filter((b) => !b.textContent!.includes('Limpar'));
    expect(comAcao.length).toBeGreaterThan(0);
    expect(comAcao.every((b) => b.disabled)).toBeTrue();
  });

  it('o checkbox do cabeçalho marca e desmarca a página inteira', async () => {
    const host = await mount();
    const all = host.querySelector('.select-all input') as HTMLInputElement;

    all.click();
    await settle();
    expect(host.querySelector('.bulk-bar')!.textContent).toContain('8 selecionados');

    all.click();
    await settle();
    expect(host.querySelector('.bulk-bar')).toBeNull();
  });

  it('mudar o filtro limpa a seleção, para ninguém agir sobre linha que não vê', async () => {
    const host = await mount();
    checkboxes(host)[0]!.click();
    await settle();
    expect(host.querySelector('.bulk-bar')).not.toBeNull();

    await clickTab(host, 'Esgotados');
    expect(host.querySelector('.bulk-bar')).toBeNull();
  });

  it('desativar um produto selecionado na aba Ativos não deixa seleção órfã', async () => {
    const host = await mount();
    await clickTab(host, 'Ativos');
    checkboxes(host)[0]!.click();
    await settle();
    // Sem esta asserção o teste passaria mesmo sem a barra existir: não saberia falhar.
    expect(host.querySelector('.bulk-bar')!.textContent).toContain('1 selecionado');

    const toggle = host.querySelector(
      'bo-product-row [role="switch"][aria-label^="Desativar Bola"]',
    ) as HTMLButtonElement;
    toggle.click();
    await settle();

    expect(host.querySelector('.bulk-bar')).toBeNull();
  });
  /** O debounce da busca é de 300 ms: espera real, sem jasmine.clock (o mount depende de setTimeout). */
  const afterDebounce = () => new Promise((resolve) => setTimeout(resolve, 350));

  it('escreve a busca na URL depois do debounce', async () => {
    const host = await mount();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    await typeSearch(host, 'bola');
    expect(navigate).not.toHaveBeenCalled();

    await afterDebounce();
    expect(navigate).toHaveBeenCalled();
    const [, extras] = navigate.calls.mostRecent().args as [unknown, { queryParams: unknown }];
    expect(extras.queryParams).toEqual(jasmine.objectContaining({ q: 'bola' }));
  });

  it('sair da tela no meio do debounce não navega de volta para Produtos', async () => {
    const host = await mount();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    await typeSearch(host, 'bola');
    fixture.destroy();
    await afterDebounce();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('mudar de aba dentro da janela do debounce não apaga a seleção feita depois', async () => {
    const host = await mount();
    await typeSearch(host, 'b');
    await clickTab(host, 'Ativos');
    checkboxes(host)[0]!.click();
    await settle();
    expect(host.querySelector('.bulk-bar')!.textContent).toContain('1 selecionado');

    await afterDebounce();
    await settle();

    expect(host.querySelector('.bulk-bar')).not.toBeNull();
  });

  it('coleção desconhecida na URL cai no padrão, em vez de sumir com a lista', async () => {
    const host = await mount({ params: { colecao: 'foo' } });
    expect(names(host).length).toBe(8);
  });
  it('o checkbox do header fica parcial quando só algumas linhas estão marcadas', async () => {
    const host = await mount();
    const all = host.querySelector('.select-all input') as HTMLInputElement;
    expect(all.indeterminate).toBeFalse();

    checkboxes(host)[0]!.click();
    await settle();

    expect(all.indeterminate).toBeTrue();
    expect(all.checked).toBeFalse();
  });

  it('o checkbox do header fica marcado, e não parcial, com a página inteira selecionada', async () => {
    const host = await mount();
    const all = host.querySelector('.select-all input') as HTMLInputElement;

    all.click();
    await settle();

    expect(all.checked).toBeTrue();
    expect(all.indeterminate).toBeFalse();
  });

  it('Shift+clique marca o intervalo desde o último clicado', async () => {
    const host = await mount();
    checkboxes(host)[0]!.click();
    await settle();

    checkboxes(host)[3]!.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    await settle();

    expect(host.querySelector('.bulk-bar')!.textContent).toContain('4 selecionados');
  });

  it('Shift+clique desmarcando limpa o intervalo inteiro', async () => {
    const host = await mount();
    const all = host.querySelector('.select-all input') as HTMLInputElement;
    all.click();
    await settle();
    expect(host.querySelector('.bulk-bar')!.textContent).toContain('8 selecionados');

    checkboxes(host)[0]!.click();
    await settle();
    checkboxes(host)[3]!.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    await settle();

    expect(host.querySelector('.bulk-bar')!.textContent).toContain('4 selecionados');
  });

  it('Esc limpa a seleção com a barra de lote aberta', async () => {
    const host = await mount();
    checkboxes(host)[0]!.click();
    await settle();
    expect(host.querySelector('.bulk-bar')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();

    expect(host.querySelector('.bulk-bar')).toBeNull();
  });

  it('a barra de lote anuncia a contagem para leitor de tela', async () => {
    const host = await mount();
    checkboxes(host)[0]!.click();
    await settle();

    const bar = host.querySelector('.bulk-bar')!;
    expect(bar.getAttribute('aria-live')).toBe('polite');
    expect(bar.textContent).toContain('1 selecionado');
  });

  it('avisa que a seleção foi limpa quando o filtro muda', async () => {
    const host = await mount();
    checkboxes(host)[0]!.click();
    await settle();

    await clickTab(host, 'Ativos');

    expect(host.textContent).toContain('Seleção limpa');
  });

  it('não avisa nada quando não havia seleção para limpar', async () => {
    const host = await mount();
    await clickTab(host, 'Ativos');
    expect(host.textContent).not.toContain('Seleção limpa');
  });
});
