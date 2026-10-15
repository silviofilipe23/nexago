import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
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
});
