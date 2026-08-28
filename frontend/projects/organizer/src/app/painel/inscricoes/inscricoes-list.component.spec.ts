import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OgInscricoesListComponent } from './inscricoes-list.component';
import {
  normalizeSearch,
  type InscricaoAction,
  type InscricaoAthlete,
  type InscricaoRow,
} from './inscricoes.model';

function athlete(over: Partial<InscricaoAthlete> = {}): InscricaoAthlete {
  return {
    uid: 'u1',
    name: 'Ana Paula',
    photoUrl: null,
    lgpdAccepted: true,
    phone: '',
    sharePaid: false,
    organizerConfirmedShare: false,
    ...over,
  };
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
    canRevertPayment: false,
    partialPayment: false,
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

  /** Reverter é a contraparte de "Confirmar pagamento": só existe na baixa que o organizador
   *  lançou. Dinheiro recebido pela plataforma está numa conta e sai por estorno — oferecer o
   *  botão ali seria prometer um desfazer que o servidor recusa. */
  describe('reverter pagamento', () => {
    async function actionsOf(over: Partial<InscricaoRow>): Promise<string[]> {
      fixture.componentRef.setInput('rows', [row(over)]);
      fixture.componentRef.setInput('openId', 'i1');
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      return [...el.querySelectorAll('.og-insc-actions button')].map((b) => b.textContent?.trim() ?? '');
    }

    it('aparece na baixa lançada pelo organizador', async () => {
      expect(await actionsOf({ canRevertPayment: true })).toContain('Reverter pagamento');
    });

    it('não aparece quando o pagamento veio pela plataforma', async () => {
      expect(await actionsOf({ canRevertPayment: false })).not.toContain('Reverter pagamento');
    });

    it('não aparece em quem ainda não está pago — lá o botão é o de confirmar', async () => {
      const acoes = await actionsOf({ pay: 'pendente', canRevertPayment: true });

      expect(acoes).not.toContain('Reverter pagamento');
      expect(acoes).toContain('Confirmar pagamento');
    });

    it('emite a ação com a linha da gaveta', async () => {
      const emitted: InscricaoAction[] = [];
      fixture.componentInstance.action.subscribe((a) => emitted.push(a));
      await actionsOf({ canRevertPayment: true });
      const el = fixture.nativeElement as HTMLElement;
      const button = [...el.querySelectorAll('.og-insc-actions button')].find(
        (b) => b.textContent?.trim() === 'Reverter pagamento',
      ) as HTMLButtonElement;

      button.click();

      expect(emitted.map((a) => a.kind)).toEqual(['revert-payment']);
      expect(emitted[0].row.id).toBe('i1');
    });
  });

  /** Confirmar/desfazer por atleta é a correção do bug real: o organizador confirmava a dupla
   *  inteira mesmo quando só um atleta tinha pago. Só existe enquanto a dupla/equipe não fechou
   *  — "pago"/"conferir" já resolveram todo mundo, então a ação por atleta some. */
  describe('pagamento por atleta', () => {
    async function openWith(over: Partial<InscricaoRow>): Promise<HTMLElement> {
      fixture.componentRef.setInput('rows', [row({ pay: 'pendente', ...over })]);
      fixture.componentRef.setInput('openId', 'i1');
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    }

    it('oferece confirmar o atleta que ainda não pagou', async () => {
      const el = await openWith({
        athletes: [athlete({ uid: 'ana', name: 'Ana Paula' }), athlete({ uid: 'bia', name: 'Beatriz Costa' })],
      });
      const items = [...el.querySelectorAll('.og-insc-athletes li')];

      expect(items[0].querySelector('.pay-status')?.textContent).toContain('Pagamento pendente');
      expect(items[0].querySelector('.pay-row button')?.textContent?.trim()).toBe('Confirmar pagamento');
    });

    /** O caso real que motivou a funcionalidade: o atleta já declarou "Já paguei" (Pix direto
     *  pro organizador), mas ninguém confirmou que o dinheiro realmente caiu. O organizador
     *  precisa de um botão pra isso — um selo estático deixava a conferência sem ação nenhuma. */
    it('atleta declarado por si só pede conferência do organizador', async () => {
      const el = await openWith({
        athletes: [
          athlete({ uid: 'ana', sharePaid: true, organizerConfirmedShare: false }),
          athlete({ uid: 'bia', name: 'Beatriz Costa' }),
        ],
      });
      const item = el.querySelectorAll('.og-insc-athletes li')[0];

      expect(item.querySelector('.pay-status')?.textContent).toContain('Declarado pelo atleta');
      expect(item.querySelector('.pay-status')?.textContent).toContain('aguardando conferência');
      expect(item.querySelector('.pay-row button')?.textContent?.trim()).toBe('Confirmar recebimento');
    });

    it('confirmar recebimento de quem já declarou emite a mesma ação de confirmar', async () => {
      const emitted: InscricaoAction[] = [];
      fixture.componentInstance.action.subscribe((a) => emitted.push(a));
      const el = await openWith({
        athletes: [
          athlete({ uid: 'ana', sharePaid: true, organizerConfirmedShare: false }),
          athlete({ uid: 'bia', name: 'Beatriz Costa' }),
        ],
      });
      const button = el.querySelectorAll('.og-insc-athletes li')[0].querySelector('.pay-row button') as HTMLButtonElement;

      button.click();

      expect(emitted).toEqual([{ kind: 'confirm', row: jasmine.objectContaining({ id: 'i1' }), athleteUid: 'ana' }]);
    });

    it('atleta confirmado pelo organizador ganha botão de desfazer', async () => {
      const el = await openWith({
        athletes: [
          athlete({ uid: 'ana', sharePaid: true, organizerConfirmedShare: true }),
          athlete({ uid: 'bia', name: 'Beatriz Costa' }),
        ],
      });
      const item = el.querySelectorAll('.og-insc-athletes li')[0];

      expect(item.querySelector('.pay-status')?.textContent).toContain('Confirmado por você');
      expect(item.querySelector('.pay-row button')?.textContent?.trim()).toBe('Desfazer');
    });

    it('some em dupla que já fechou (paga ou a conferir) e em inscrição solo', async () => {
      const paga = await openWith({ pay: 'pago' });
      expect(paga.querySelector('.pay-row')).toBeNull();

      const conferir = await openWith({ pay: 'conferir' });
      expect(conferir.querySelector('.pay-row')).toBeNull();

      const solo = await openWith({ athletes: [athlete({ uid: 'ana' })] });
      expect(solo.querySelector('.pay-row')).toBeNull();
    });

    it('confirmar emite a ação com o uid do atleta clicado, não a inscrição inteira', async () => {
      const emitted: InscricaoAction[] = [];
      fixture.componentInstance.action.subscribe((a) => emitted.push(a));
      const el = await openWith({
        athletes: [athlete({ uid: 'ana' }), athlete({ uid: 'bia', name: 'Beatriz Costa' })],
      });
      const button = el.querySelectorAll('.og-insc-athletes li')[0].querySelector('.pay-row button') as HTMLButtonElement;

      button.click();

      expect(emitted).toEqual([{ kind: 'confirm', row: jasmine.objectContaining({ id: 'i1' }), athleteUid: 'ana' }]);
    });

    it('desfazer emite a ação com o uid do atleta, não a inscrição inteira', async () => {
      const emitted: InscricaoAction[] = [];
      fixture.componentInstance.action.subscribe((a) => emitted.push(a));
      const el = await openWith({
        athletes: [
          athlete({ uid: 'ana', sharePaid: true, organizerConfirmedShare: true }),
          athlete({ uid: 'bia', name: 'Beatriz Costa' }),
        ],
      });
      const button = el.querySelectorAll('.og-insc-athletes li')[0].querySelector('.pay-row button') as HTMLButtonElement;

      button.click();

      expect(emitted).toEqual([{ kind: 'revert-payment', row: jasmine.objectContaining({ id: 'i1' }), athleteUid: 'ana' }]);
    });

    /** O botão "confirmar a inscrição inteira" some quando já tem pagamento parcial — clicar
     *  nele marcaria como pago quem ainda não pagou, reabrindo o mesmo bug corrigido pela
     *  confirmação por atleta. Só a lista acima, atleta a atleta, fecha o que falta. */
    it('some o botão de confirmar a inscrição inteira quando o pagamento é parcial', async () => {
      const el = await openWith({ partialPayment: true });
      const actions = el.querySelector('.og-insc-actions')!;

      expect([...actions.querySelectorAll('button')].map((b) => b.textContent?.trim())).not.toContain(
        'Confirmar pagamento',
      );
      expect(actions.querySelector('.og-insc-partial-hint')?.textContent).toContain('Pagamento parcial');
    });

    it('confirmar a inscrição inteira continua disponível sem pagamento parcial', async () => {
      const el = await openWith({ partialPayment: false });
      const actions = el.querySelector('.og-insc-actions')!;

      expect([...actions.querySelectorAll('button')].map((b) => b.textContent?.trim())).toContain(
        'Confirmar pagamento',
      );
      expect(actions.querySelector('.og-insc-partial-hint')).toBeNull();
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
