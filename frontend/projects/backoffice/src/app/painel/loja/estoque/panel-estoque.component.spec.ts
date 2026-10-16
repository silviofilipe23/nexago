import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { StoreBadgesService } from '../../data/store-badges.service';
import type { StockRow } from './data/stock';
import { StockRepository, type StockSnapshot } from './data/stock.repository';
import { PanelEstoqueComponent } from './panel-estoque.component';

const row = (over: Partial<StockRow>): StockRow => ({
  productId: 'p', productName: 'Produto', skuId: 's', skuCode: 'NX-P', barcode: '', variantLabel: 'único',
  category: 'vestuario', imageUrl: null, byLocation: {}, total: 0, reserved: 0, threshold: 3, costCents: null, ...over,
});

const SNAPSHOT: StockSnapshot = {
  locations: [
    { id: 'cd', name: 'CD Goiânia', type: 'cd' },
    { id: 'arena-cfc', name: 'Arena CFC', type: 'arena' },
  ],
  rows: [
    row({ skuId: 'bola', productName: 'Bola Pro', byLocation: { cd: 52, 'arena-cfc': 12 }, total: 64, costCents: 1000 }),
    row({ skuId: 'cam', productName: 'Camiseta Dry', variantLabel: 'Branco areia · M', byLocation: { cd: 1, 'arena-cfc': 0 }, total: 1 }),
    row({ skuId: 'moch', productName: 'Mochila', category: 'acessorios', byLocation: {}, total: 0 }),
  ],
  movements: [
    { id: 'm1', type: 'ajuste', title: 'Ajuste manual na tela do produto', itemsLabel: '−2 Camiseta', placeLabel: 'CD Goiânia', createdAt: null },
  ],
};

describe('PanelEstoqueComponent', () => {
  async function mount(snapshot: StockSnapshot | 'fail' = SNAPSHOT): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PanelEstoqueComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: StockRepository,
          useValue: { load: () => (snapshot === 'fail' ? Promise.reject(new Error('x')) : Promise.resolve(snapshot)) },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelEstoqueComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const names = (host: HTMLElement) => [...host.querySelectorAll('.row:not(.head-row) .name')].map((e) => e.textContent!.trim());

  it('lista um SKU por linha, com estoque baixo primeiro', async () => {
    const host = await mount();
    expect(names(host)).toEqual(['Camiseta Dry', 'Mochila', 'Bola Pro']);
  });

  it('colunas vêm dos locais cadastrados', async () => {
    const host = await mount();
    const head = [...host.querySelectorAll('.head-row span')].map((e) => e.textContent!.trim());
    expect(head).toEqual(['SKU', 'CD Goiânia', 'Arena CFC', 'Total', 'Reservado', '']);
  });

  it('KPIs, selo de SKUs baixos e badge da sidebar', async () => {
    const host = await mount();
    const values = [...host.querySelectorAll('.kpi-value')].map((e) => e.textContent!.trim());
    expect(values[0]).toBe('65');
    expect(values[1]).toContain('640');
    expect(host.querySelector('.head bo-pill')!.textContent!.trim()).toBe('2 SKUs baixos');
    expect(TestBed.inject(StoreBadgesService).lowStock()).toBe(2);
  });

  it('cores e ação: zero vermelho, baixo amarelo; Repor abaixo do alerta', async () => {
    const host = await mount();
    const cam = host.querySelectorAll('.row:not(.head-row)')[0]!;
    expect(cam.querySelectorAll('.qty')[0]!.classList).toContain('tone-low');
    expect(cam.querySelectorAll('.qty')[1]!.classList).toContain('tone-zero');
    expect(cam.querySelector('.action')!.textContent!.trim()).toBe('Repor');
    const bola = host.querySelectorAll('.row:not(.head-row)')[2]!;
    expect(bola.querySelector('.action')!.textContent!.trim()).toBe('Transferir');
  });

  it('filtro de local mostra só a coluna dele', async () => {
    const host = await mount();
    const select = host.querySelector('select[aria-label="Local"]') as HTMLSelectElement;
    select.value = 'arena-cfc';
    select.dispatchEvent(new Event('change'));
    await TestBed.inject(ApplicationRef).whenStable();
    const head = [...host.querySelectorAll('.head-row span')].map((e) => e.textContent!.trim());
    expect(head).toEqual(['SKU', 'Arena CFC', 'Total', 'Reservado', '']);
  });

  it('busca sem resultado mostra o estado vazio com limpar', async () => {
    const host = await mount();
    const input = host.querySelector('.search input') as HTMLInputElement;
    input.value = 'xyz';
    input.dispatchEvent(new Event('input'));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(host.querySelector('.empty')!.textContent).toContain('Nenhum SKU com essa busca');
  });

  it('mostra as movimentações e o vazio do catálogo', async () => {
    let host = await mount();
    expect(host.querySelector('.move-title')!.textContent).toContain('Ajuste manual');
    TestBed.resetTestingModule();
    host = await mount({ locations: [], rows: [], movements: [] });
    expect(host.querySelector('.empty')!.textContent).toContain('Nenhum SKU cadastrado');
    expect(host.querySelector('.moves-empty')).not.toBeNull();
  });

  it('erro na leitura mostra o aviso com tentar de novo', async () => {
    const host = await mount('fail');
    expect(host.querySelector('.bo-alert')!.textContent).toContain('Tentar de novo');
  });
});
