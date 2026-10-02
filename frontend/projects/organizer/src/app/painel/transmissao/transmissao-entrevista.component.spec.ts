import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_BROADCAST_CONTROL, interviewWithDefaults } from '../data/broadcast-control';
import { EMPTY_INTERVIEW_QUEUE, type InterviewQueue } from '../data/interview-queue';
import { FakeTransmissaoData } from './transmissao-data.fake';
import { TransmissaoDataService } from './transmissao-data.service';
import { TransmissaoEntrevistaComponent } from './transmissao-entrevista.component';

const FILA: InterviewQueue = {
  ...EMPTY_INTERVIEW_QUEUE,
  items: [
    { id: 'atleta:ta:u1', kind: 'atleta', teamId: 'ta', uid: 'u1', label: 'Ana Souza', photoUrl: null, questions: ['Como foi a final?', 'E o saque?'] },
    { id: 'dupla:tb', kind: 'dupla', teamId: 'tb', uid: null, label: 'Carla Dias / Dani Ávila', photoUrl: null, questions: [] },
  ],
  reporter: { role: 'Repórter', name: 'Carla Mendes' },
};

async function mount(fake = new FakeTransmissaoData()) {
  TestBed.configureTestingModule({
    imports: [TransmissaoEntrevistaComponent],
    providers: [provideZonelessChangeDetection(), { provide: TransmissaoDataService, useValue: fake }],
  });
  const fixture = TestBed.createComponent(TransmissaoEntrevistaComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const stable = () => fixture.whenStable();
  return { fixture, fake, el, stable };
}

function botao(el: HTMLElement, texto: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim().startsWith(texto));
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b as HTMLButtonElement;
}

function porRotulo(el: HTMLElement, label: string): HTMLElement {
  const x = el.querySelector(`[aria-label="${label}"]`);
  if (!x) throw new Error(`"${label}" não encontrado`);
  return x as HTMLElement;
}

function digitar(input: HTMLElement, valor: string): void {
  (input as HTMLInputElement).value = valor;
  input.dispatchEvent(new Event('change'));
}

/** Fila escalada e a Ana posta no ar pelo próprio botão — o dublê devolve a tarja no controle,
 *  como o snapshot faria. */
async function anaNoAr() {
  const fake = new FakeTransmissaoData();
  fake.queue.set(FILA);
  const m = await mount(fake);
  botao(m.el, 'Pôr no ar: Ana Souza').click();
  await m.stable();
  const noAr = fake.aired.at(-1)!.interview!;
  fake.aired.length = 0;
  return { ...m, noAr };
}

describe('TransmissaoEntrevistaComponent', () => {
  describe('escalar', () => {
    it('atalhos da quadra; "Pôr no ar agora" escala, vira o da vez e vai ao ar com o card completo', async () => {
      const { el, fake, stable } = await mount();
      botao(el, 'Ana Souza').click();
      await stable();
      botao(el, 'Pôr no ar agora').click();

      const { interview, queue } = fake.aired[0]!;
      expect(interview?.key).toBe('atleta:ta:u1');
      expect(interview?.subtitle).toBe('Dupla com Bia Lima');
      expect(interview?.chips).toEqual([{ label: 'Cidade', value: 'Goiânia/GO' }]);
      expect(interview?.durationSec).toBeNull();
      expect(queue?.items.map((i) => i.id)).toEqual(['atleta:ta:u1']);
      expect(queue?.current).toBe(0);
    });

    it('escolher um atleta começa a carregar o ranking geral', async () => {
      const { el, fake } = await mount();
      expect(fake.rankingRequests).toBe(0);
      botao(el, 'Ana Souza').click();
      expect(fake.rankingRequests).toBe(1);
    });

    it('fila já escalada (painel recarregado) também carrega o ranking — "Pôr no ar" não pode sair sem ele', async () => {
      const fake = new FakeTransmissaoData();
      fake.queue.set(FILA);
      await mount(fake);
      expect(fake.rankingRequests).toBe(1);
    });

    it('a dupla inteira entra na fila com o nome da dupla, e a escolha some', async () => {
      const { el, fake, stable } = await mount();
      botao(el, 'Ana Souza').click();
      await stable();
      botao(el, 'Dupla').click();
      await stable();
      botao(el, 'Adicionar à fila').click();
      await stable();

      expect(fake.savedQueues.at(-1)?.items).toEqual([
        { id: 'dupla:ta', kind: 'dupla', teamId: 'ta', uid: null, label: 'Ana Souza / Bia Lima', photoUrl: null, questions: [] },
      ]);
      expect(el.textContent).not.toContain('Adicionar à fila');
      expect(fake.aired).toEqual([]);
    });

    it('trocar de atleta volta a escolha pra "atleta"', async () => {
      const { el, fake, stable } = await mount();
      botao(el, 'Ana Souza').click();
      await stable();
      botao(el, 'Dupla').click();
      botao(el, 'Carla Dias').click();
      await stable();
      botao(el, 'Adicionar à fila').click();
      expect(fake.savedQueues.at(-1)?.items[0]?.id).toBe('atleta:tb:u3');
    });
  });

  describe('fila', () => {
    it('lista na ordem, com tipo e quantas perguntas', async () => {
      const fake = new FakeTransmissaoData();
      fake.queue.set(FILA);
      const { el } = await mount(fake);
      const linhas = [...el.querySelectorAll('.og-tx-fila-item')].map((l) => l.querySelector('.og-tx-fila-sub')?.textContent);
      expect(linhas).toEqual(['Atleta · 2 perguntas', 'Dupla · sem pauta']);
    });

    it('fora do ar, "Chamar" só move o cursor', async () => {
      const fake = new FakeTransmissaoData();
      fake.queue.set(FILA);
      const { el } = await mount(fake);
      botao(el, 'Próximo').click();
      expect(fake.savedQueues.at(-1)?.current).toBe(1);
      expect(fake.aired).toEqual([]);
    });

    it('editar a pauta grava uma pergunta por linha', async () => {
      const fake = new FakeTransmissaoData();
      fake.queue.set(FILA);
      const { el, stable } = await mount(fake);
      botao(el, 'Carla Dias / Dani Ávila').click();
      await stable();
      digitar(porRotulo(el, 'Pauta de Carla Dias / Dani Ávila'), 'Primeira\n\nSegunda ');
      expect(fake.savedQueues.at(-1)?.items[1]?.questions).toEqual(['Primeira', 'Segunda']);
    });

    it('subir, descer e tirar da fila', async () => {
      const fake = new FakeTransmissaoData();
      fake.queue.set(FILA);
      const { el, stable } = await mount(fake);
      (el.querySelectorAll('[aria-label="Subir"]')[1] as HTMLButtonElement).click();
      await stable();
      expect(fake.queue().items.map((i) => i.id)).toEqual(['dupla:tb', 'atleta:ta:u1']);
      (el.querySelectorAll('[aria-label="Tirar da fila"]')[0] as HTMLButtonElement).click();
      expect(fake.queue().items.map((i) => i.id)).toEqual(['atleta:ta:u1']);
    });

    it('repórter grava na fila', async () => {
      const { el, fake } = await mount();
      digitar(porRotulo(el, 'Nome do repórter'), ' Júlia Reis ');
      expect(fake.savedQueues.at(-1)?.reporter).toEqual({ role: 'Repórter', name: 'Júlia Reis' });
    });

    it('elenco ainda não hidratado: "Pôr no ar" espera', async () => {
      const fake = new FakeTransmissaoData();
      fake.queue.set(FILA);
      fake.rosters.set(new Map());
      const { el } = await mount(fake);
      expect(botao(el, 'Pôr no ar: Ana Souza').disabled).toBeTrue();
    });
  });

  describe('no ar', () => {
    it('"Pôr no ar" leva a pergunta da vez e o repórter', async () => {
      const { noAr } = await anaNoAr();
      expect(noAr.question).toBe('Como foi a final?');
      expect(noAr.reporter).toEqual({ role: 'Repórter', name: 'Carla Mendes' });
    });

    it('mostra quem está no ar e "Tirar do ar" grava null', async () => {
      const { el, fake } = await anaNoAr();
      expect(el.textContent).toContain('No ar: Ana Souza');
      botao(el, 'Tirar do ar').click();
      expect(fake.aired).toEqual([{ interview: null, queue: null }]);
    });

    it('próxima pergunta regrava o card com o MESMO carimbo', async () => {
      const { el, fake, noAr } = await anaNoAr();
      porRotulo(el, 'Próxima pergunta').click();
      const { interview, queue } = fake.aired[0]!;
      expect(interview?.question).toBe('E o saque?');
      expect(interview?.shownAt).toBe(noAr.shownAt);
      expect(queue?.questionIndex).toBe(1);
    });

    it('Próximo troca o entrevistado no ar com carimbo novo', async () => {
      const { el, fake, noAr } = await anaNoAr();
      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(noAr.shownAt + 5_000));
        botao(el, 'Próximo').click();
      } finally {
        jasmine.clock().uninstall();
      }
      const { interview, queue } = fake.aired[0]!;
      expect(interview?.key).toBe('dupla:tb');
      expect(interview?.shownAt).toBeGreaterThan(noAr.shownAt);
      expect(interview?.question).toBeNull();
      expect(queue?.current).toBe(1);
    });

    for (const [chave, campo, valor] of [
      ['Pauta', 'question', null],
      ['Repórter', 'reporter', null],
      ['Campanha no torneio', 'showCampaign', false],
    ] as const) {
      it(`chave "${chave}" no ar regrava o card sem reiniciar a duração`, async () => {
        const { el, fake, noAr } = await anaNoAr();
        porRotulo(el, chave).click();
        const { interview } = fake.aired[0]!;
        expect(interview?.[campo]).toBe(valor);
        expect(interview?.shownAt).toBe(noAr.shownAt);
      });
    }

    it('trocar o repórter no ar atualiza a tarja', async () => {
      const { el, fake, noAr } = await anaNoAr();
      digitar(porRotulo(el, 'Nome do repórter'), 'Júlia Reis');
      expect(fake.aired[0]?.interview?.reporter).toEqual({ role: 'Repórter', name: 'Júlia Reis' });
      expect(fake.aired[0]?.interview?.shownAt).toBe(noAr.shownAt);
    });

    it('com outro entrevistado no ar (de fora da fila), mexer na fila não troca o ar', async () => {
      const fake = new FakeTransmissaoData();
      fake.queue.set(FILA);
      fake.control.set({
        ...DEFAULT_BROADCAST_CONTROL,
        interview: {
          ...interviewWithDefaults({ name: 'Outro', photoUrl: null, partnerName: null, categoryName: null, durationSec: null, shownAt: Date.now() }),
          key: 'atleta:tz:u9',
        },
      });
      const { el } = await mount(fake);
      porRotulo(el, 'Pauta').click();
      expect(fake.aired).toEqual([]);
      expect(fake.savedQueues.at(-1)?.show.question).toBeFalse();
    });
  });
});
