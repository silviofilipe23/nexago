import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OgInscricoesListComponent } from './inscricoes-list.component';
import { normalizeSearch, type InscricaoAthlete, type InscricaoRow } from './inscricoes.model';

function athlete(over: Partial<InscricaoAthlete> = {}): InscricaoAthlete {
  return { name: 'Ana Paula', photoUrl: null, lgpdAccepted: true, phone: '', ...over };
}

function row(over: Partial<InscricaoRow> = {}): InscricaoRow {
  return {
    id: 'i1',
    name: 'Ana Paula / Beatriz Costa',
    athletes: [athlete(), athlete({ name: 'Beatriz Costa' })],
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
    const el = await render([row(), row({ id: 'i2', athletes: [athlete({ name: 'Solo' })] })]);
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
      row({ athletes: [athlete(), athlete({ name: 'Beatriz Costa', lgpdAccepted: false })] }),
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

  /** O telefone é PII: fica na gaveta, nunca na linha que o organizador varre de olho — e cada
   *  botão tem de apontar pro número certo do atleta certo. */
  describe('contato do atleta', () => {
    async function openDrawerWith(athletes: InscricaoAthlete[]): Promise<HTMLElement> {
      fixture.componentRef.setInput('rows', [row({ athletes })]);
      fixture.componentRef.setInput('openId', 'i1');
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    }

    it('monta WhatsApp e ligação a partir do telefone do atleta', async () => {
      const el = await openDrawerWith([athlete({ phone: '(62) 98240-6456' })]);
      const links = [...el.querySelectorAll('.og-insc-athletes .contact a')] as HTMLAnchorElement[];

      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        'https://wa.me/5562982406456',
        'tel:+5562982406456',
      ]);
      expect(links[1].textContent?.trim()).toBe('(62) 98240-6456');
      // O WhatsApp abre fora do painel — o organizador não pode perder a tela de inscrições.
      expect(links[0].target).toBe('_blank');
      expect(links[0].rel).toContain('noopener');
    });

    it('cada atleta recebe o próprio número', async () => {
      const el = await openDrawerWith([
        athlete({ name: 'Ana Paula', phone: '+5562982406456' }),
        athlete({ name: 'Beatriz Costa', phone: '62 3241-0000' }),
      ]);
      const tel = [...el.querySelectorAll('.og-insc-athletes .contact a[href^="tel:"]')];

      expect(tel.map((a) => a.getAttribute('href'))).toEqual(['tel:+5562982406456', 'tel:+556232410000']);
    });

    it('sem telefone cadastrado não há botão pra clicar', async () => {
      const el = await openDrawerWith([athlete({ phone: '' })]);

      expect(el.querySelector('.og-insc-athletes .contact')).toBeNull();
      expect(el.querySelector('.og-insc-athletes .contact-none')?.textContent).toContain(
        'Sem telefone cadastrado',
      );
    });

    it('número quebrado no perfil aparece como está, sem virar link', async () => {
      const el = await openDrawerWith([athlete({ phone: 'ramal 204' })]);

      expect(el.querySelector('.og-insc-athletes .contact')).toBeNull();
      expect(el.querySelector('.og-insc-athletes .contact-none')?.textContent).toContain('ramal 204');
    });

    it('copiar leva o número formatado e marca só o botão daquele atleta', async () => {
      const written: string[] = [];
      spyOn(navigator.clipboard, 'writeText').and.callFake((t: string) => {
        written.push(t);
        return Promise.resolve();
      });
      const el = await openDrawerWith([
        athlete({ name: 'Ana Paula', phone: '+5562982406456' }),
        athlete({ name: 'Beatriz Costa', phone: '62 3241-0000' }),
      ]);
      const buttons = [...el.querySelectorAll('.og-insc-athletes .contact button')] as HTMLButtonElement[];

      buttons[1].click();
      await fixture.whenStable();

      expect(written).toEqual(['(62) 3241-0000']);
      expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Copiar', 'Copiado']);
    });

    /** Sem área de transferência (contexto inseguro, permissão negada) o botão não pode dizer
     *  que copiou — o organizador coloca a mão no bolso achando que tem o número. */
    it('área de transferência indisponível não vira "Copiado" mentiroso', async () => {
      spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject(new Error('denied')));
      const el = await openDrawerWith([athlete({ phone: '62982406456' })]);
      const button = el.querySelector('.og-insc-athletes .contact button') as HTMLButtonElement;

      button.click();
      await fixture.whenStable();

      expect(button.textContent?.trim()).toBe('Copiar');
    });

    it('o telefone não vaza pra linha da lista', async () => {
      fixture.componentRef.setInput('rows', [row({ athletes: [athlete({ phone: '62982406456' })] })]);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.og-insc-drawer')).toBeNull();
      expect((el.querySelector('.og-insc-row') as HTMLElement).textContent).not.toContain('98240');
    });
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
