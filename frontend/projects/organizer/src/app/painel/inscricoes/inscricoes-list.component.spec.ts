import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OgInscricoesListComponent } from './inscricoes-list.component';
import { normalizeSearch, type InscricaoRow } from './inscricoes.model';

function row(over: Partial<InscricaoRow> = {}): InscricaoRow {
  return {
    id: 'i1',
    name: 'Ana Paula / Beatriz Costa',
    athletes: [
      { name: 'Ana Paula', photoUrl: null, lgpdAccepted: true },
      { name: 'Beatriz Costa', photoUrl: null, lgpdAccepted: true },
    ],
    categoriaId: 'c1',
    categoria: 'Feminina B',
    pay: 'pago',
    payNote: null,
    payTitle: '',
    roster: null,
    cancelPending: false,
    cancelReason: '',
    lgpd: 'aceito',
    lgpdMissing: [],
    date: '12 ago',
    dateLong: '12 de agosto de 2026',
    createdAt: null,
    search: '',
    ...over,
  };
}

/** O que quebrou o layout antigo: cabeçalho e linha declaravam as colunas em dois lugares
 *  diferentes (flex/width inline), então nunca batiam — e a coluna de avatares, que mudava de
 *  largura entre solo e dupla, ainda desalinhava linha a linha. Estes testes travam o contrato
 *  novo: uma grade só, e sinal na linha só por exceção. */
describe('OgInscricoesListComponent', () => {
  let fixture: ComponentFixture<OgInscricoesListComponent>;

  beforeEach(async () => {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OgInscricoesListComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(OgInscricoesListComponent);
  });

  async function render(rows: InscricaoRow[]): Promise<HTMLElement> {
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('cabeçalho e linha usam a mesma grade — as colunas não podem sair do lugar', async () => {
    const el = await render([row(), row({ id: 'i2', athletes: [{ name: 'Solo', photoUrl: null, lgpdAccepted: true }] })]);
    const cols = (node: Element) => getComputedStyle(node).gridTemplateColumns;

    const head = el.querySelector('.og-insc-head')!;
    const mains = [...el.querySelectorAll('.og-insc-main')];

    expect(mains.length).toBe(2);
    // dupla e solo têm de cair na MESMA grade do cabeçalho
    for (const main of mains) expect(cols(main)).toBe(cols(head));
  });

  it('só marca a linha quando a inscrição depende de uma decisão do organizador', async () => {
    const el = await render([
      row({ id: 'pago' }),
      row({ id: 'pendente', pay: 'pendente' }),
      row({ id: 'conferir', pay: 'conferir' }),
      row({ id: 'cancelamento', cancelPending: true }),
    ]);
    const rows = [...el.querySelectorAll('.og-insc-row')];

    expect(rows.map((r) => r.classList.contains('needs-check'))).toEqual([false, false, true, false]);
    expect(rows.map((r) => r.classList.contains('needs-decision'))).toEqual([false, false, false, true]);
  });

  it('mostra o aviso de termo de imagem só quando falta aceite', async () => {
    const el = await render([
      row({ id: 'ok' }),
      row({ id: 'parcial', lgpd: 'parcial', lgpdMissing: ['Beatriz Costa'] }),
    ]);
    const flags = [...el.querySelectorAll('.og-insc-row')].map((r) => r.querySelector('.og-insc-flag.warn'));

    expect(flags[0]).toBeNull();
    expect(flags[1]?.textContent?.trim()).toContain('Termo de imagem parcial');
    expect(flags[1]?.getAttribute('title')).toContain('Beatriz Costa');
  });

  it('a gaveta abre só na linha pedida e traz o LGPD atleta a atleta', async () => {
    fixture.componentRef.setInput('rows', [
      row({ athletes: [
        { name: 'Ana Paula', photoUrl: null, lgpdAccepted: true },
        { name: 'Beatriz Costa', photoUrl: null, lgpdAccepted: false },
      ] }),
      row({ id: 'i2' }),
    ]);
    fixture.componentRef.setInput('openId', 'i1');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const drawers = el.querySelectorAll('.og-insc-drawer');
    expect(drawers.length).toBe(1);
    expect(drawers[0].id).toBe('insc-drawer-i1');

    const lgpd = [...drawers[0].querySelectorAll('.og-insc-athletes .lgpd')];
    expect(lgpd.map((n) => n.classList.contains('ok'))).toEqual([true, false]);
  });

  it('sem linhas, o vazio explica e oferece limpar filtros quando há filtro ativo', async () => {
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('emptyTitle', 'Nenhuma inscrição em “Pendentes”');
    fixture.componentRef.setInput('canClear', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.og-insc-empty .t')?.textContent).toContain('Pendentes');
    expect(el.querySelector('.og-insc-empty button')).not.toBeNull();
  });
});

describe('normalizeSearch', () => {
  it('acha nome acentuado escrito sem acento', () => {
    expect(normalizeSearch('Isabela Gonçalves')).toBe('isabela goncalves');
    expect(normalizeSearch('  MISTA A  ')).toBe('mista a');
  });
});
