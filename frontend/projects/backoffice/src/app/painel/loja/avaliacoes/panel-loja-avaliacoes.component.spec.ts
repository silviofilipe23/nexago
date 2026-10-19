import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { rowsFromDoc, type ReviewRow } from './data/reviews';
import { ReviewsRepository } from './data/reviews.repository';
import { PanelLojaAvaliacoesComponent } from './panel-loja-avaliacoes.component';

const at = (iso: string) => ({ toDate: () => new Date(iso) });

const order = (id: string, number: string, day: number, items: Record<string, unknown>[], over: Record<string, unknown> = {}) =>
  rowsFromDoc(id, { number, authorName: 'Rafaela M.', anonymous: false, updatedAt: at(`2026-10-${day}T12:00:00Z`), items, ...over });

const LIST: ReviewRow[] = [
  ...order('ord-3', 'NX-4790', 19, [{ productId: 'cam', name: 'Camiseta Dry', rating: 1, comment: 'Rasgou na primeira lavagem' }]),
  ...order('ord-2', 'NX-4780', 18, [{ productId: 'vis', name: 'Viseira Pro', rating: 5, comment: '' }], { anonymous: true, authorName: 'Atleta NexaGO' }),
  ...order('ord-1', 'NX-4770', 17, [{
    productId: 'bola', name: 'Bola Pro', rating: 2, comment: 'Murchou',
    hiddenAt: at('2026-10-18T09:00:00Z'), hiddenBy: { uid: 'adm', name: 'Ana Souza' }, hiddenReason: 'Spam',
  }]),
];

describe('PanelLojaAvaliacoesComponent', () => {
  let moderate: jasmine.Spy;
  let reread: jasmine.Spy;

  async function mount(list = LIST): Promise<HTMLElement> {
    moderate = jasmine.createSpy('moderate').and.resolveTo({ hidden: true, changed: true });
    reread = jasmine.createSpy('order').and.callFake(async (orderId: string) =>
      order(orderId, 'NX-4790', 19, [{
        productId: 'cam', name: 'Camiseta Dry', rating: 1, comment: 'Rasgou na primeira lavagem',
        hiddenAt: at('2026-10-19T13:00:00Z'), hiddenBy: { name: 'Ana Souza' }, hiddenReason: 'Ofensivo',
      }]));
    await TestBed.configureTestingModule({
      imports: [PanelLojaAvaliacoesComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        { provide: ReviewsRepository, useValue: { list: () => Promise.resolve({ rows: list, cursor: null }), order: reread, moderate } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelLojaAvaliacoesComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const products = (host: HTMLElement) => [...host.querySelectorAll('.tr:not(.th) .item .name')].map((e) => e.textContent!.trim());
  const tabs = (host: HTMLElement) => [...host.querySelectorAll('.tabs button')].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());
  const chip = (host: HTMLElement, label: string) => [...host.querySelectorAll('.filters .bo-chip')].find((b) => b.textContent!.includes(label)) as HTMLElement;
  const dialog = (host: HTMLElement, title: string) => [...host.querySelectorAll('dialog')].find((d) => d.textContent!.includes(title))!;

  it('publicadas primeiro, da edição mais recente; anônima marcada; escondida fica na outra aba', async () => {
    const host = await mount();
    expect(tabs(host)).toEqual(['Publicadas 2', 'Escondidas 1']);
    expect(products(host)).toEqual(['Camiseta Dry', 'Viseira Pro']);
    const row = host.querySelectorAll('.tr:not(.th)')[1];
    expect(row.textContent).toContain('Atleta NexaGO');
    expect(row.textContent).toContain('anônima');
    expect(row.textContent).toContain('Sem comentário');
    expect(host.querySelector('.detail .d-title')!.textContent).toContain('Camiseta Dry');
  });

  it('filtros se somam e a contagem das abas acompanha', async () => {
    const host = await mount();
    chip(host, 'Com comentário ou foto').click();
    await settle();
    expect(products(host)).toEqual(['Camiseta Dry']);
    chip(host, 'Nota até 2').click();
    await settle();
    expect(tabs(host)).toEqual(['Publicadas 1', 'Escondidas 1']);
    expect(chip(host, 'Nota até 2').getAttribute('aria-pressed')).toBe('true');
  });

  it('esconder pede motivo no diálogo, chama a callable e a próxima avaliação assume o painel', async () => {
    const host = await mount();
    (host.querySelector('.detail .actions button') as HTMLElement).click();
    await settle();
    const d = dialog(host, 'Esconder avaliação?');
    expect(d.open).toBeTrue();
    const confirm = [...d.querySelectorAll('button')].find((b) => b.textContent!.includes('Esconder')) as HTMLButtonElement;
    expect(confirm.disabled).toBeTrue();
    const area = d.querySelector('textarea')!;
    area.value = '  Ofensivo ';
    area.dispatchEvent(new Event('input'));
    await settle();
    expect(confirm.disabled).toBeFalse();
    confirm.click();
    await settle();
    expect(moderate).toHaveBeenCalledWith({ orderId: 'ord-3', productId: 'cam', hidden: true, reason: 'Ofensivo' });
    expect(reread).toHaveBeenCalledWith('ord-3');
    expect(tabs(host)).toEqual(['Publicadas 1', 'Escondidas 2']);
    expect(host.querySelector('.detail .d-title')!.textContent).toContain('Viseira Pro');
    expect(host.querySelector('.bo-feedback')!.textContent).toContain('Avaliação de Camiseta Dry escondida');
    expect(d.open).toBeFalse();
  });

  it('escondida mostra quem, quando e o motivo; reexibir confirma antes', async () => {
    const host = await mount();
    (host.querySelectorAll('.tabs button')[1] as HTMLElement).click();
    await settle();
    expect(host.querySelector('.hidden-box')!.textContent).toContain('por Ana Souza');
    expect(host.querySelector('.hidden-box p')!.textContent).toContain('Spam');
    (host.querySelector('.detail .actions button') as HTMLElement).click();
    await settle();
    const d = dialog(host, 'Reexibir avaliação?');
    ([...d.querySelectorAll('button')].find((b) => b.textContent!.includes('Reexibir')) as HTMLElement).click();
    await settle();
    expect(moderate).toHaveBeenCalledWith({ orderId: 'ord-1', productId: 'bola', hidden: false });
  });

  it('erro da callable fica no diálogo, que continua aberto', async () => {
    const host = await mount();
    moderate.and.rejectWith({ code: 'functions/not-found', message: 'x' });
    (host.querySelector('.detail .actions button') as HTMLElement).click();
    await settle();
    const d = dialog(host, 'Esconder avaliação?');
    const area = d.querySelector('textarea')!;
    area.value = 'Spam';
    area.dispatchEvent(new Event('input'));
    await settle();
    ([...d.querySelectorAll('button')].find((b) => b.textContent!.includes('Esconder')) as HTMLElement).click();
    await settle();
    expect(d.open).toBeTrue();
    expect(d.textContent).toContain('Avaliação não encontrada. Recarregue a lista.');
  });
});
