import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_BROADCAST_CONTROL, interviewWithDefaults } from '../data/broadcast-control';
import { FakeTransmissaoData as FakeData, torneio } from './transmissao-data.fake';
import { TransmissaoDataService } from './transmissao-data.service';
import { TransmissaoComponent } from './transmissao.component';

async function mount(fake = new FakeData()) {
  TestBed.overrideComponent(TransmissaoComponent, {
    set: { providers: [{ provide: TransmissaoDataService, useValue: fake }] },
  });
  const fixture = TestBed.createComponent(TransmissaoComponent);
  fixture.componentRef.setInput('id', 't1');
  await fixture.whenStable();
  return { fixture, fake, el: fixture.nativeElement as HTMLElement };
}

function botao(el: HTMLElement, texto: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim().startsWith(texto));
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b as HTMLButtonElement;
}

describe('TransmissaoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransmissaoComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('passa o id da rota pro serviço', async () => {
    const { fake } = await mount();
    expect(fake.tournamentId()).toBe('t1');
  });

  it('sem categoria KOTC, o grupo King of the Court não aparece', async () => {
    const { el } = await mount();
    expect(el.textContent).not.toContain('King of the Court');
    expect(el.textContent).toContain('Placar');
  });

  it('com categoria KOTC, aparecem as linhas e a escolha do fim de rodada', async () => {
    const fake = new FakeData();
    fake.tournament.set(torneio(['king_of_court']));
    const { el } = await mount(fake);
    expect(el.textContent).toContain('Faixa da rodada');
    expect(el.textContent).toContain('Classificadas');
  });

  it('desligar o placar grava só a chave dele', async () => {
    const { el, fake } = await mount();
    (el.querySelector('button[role="switch"][aria-label="Placar"]') as HTMLButtonElement).click();
    expect(fake.saved).toEqual([{ graphics: { scoreboard: false } }]);
  });

  it('escolher a quadra grava courtId', async () => {
    const { el, fake } = await mount();
    botao(el, 'Quadra 2').click();
    expect(fake.saved).toEqual([{ courtId: 'q2' }]);
  });

  it('"Mostrar agora" fica desabilitado com a chave desligada', async () => {
    const fake = new FakeData();
    fake.control.set({ ...DEFAULT_BROADCAST_CONTROL, graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, donation: false } });
    const { el } = await mount(fake);
    const linhas = [...el.querySelectorAll('.og-toggle-row')];
    const doacao = linhas.find((l) => l.textContent?.includes('Doação PIX'))!;
    const patro = linhas.find((l) => l.textContent?.includes('Patrocinadores'))!;
    expect((doacao.querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeTrue();
    expect((patro.querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeFalse();
  });

  it('torneio sem patrocinador: "Mostrar agora" desabilitado e o painel diz onde cadastrar', async () => {
    const fake = new FakeData();
    fake.tournament.set({ ...torneio(['single_elimination']), sponsors: [] });
    const { el } = await mount(fake);
    const patro = [...el.querySelectorAll('.og-toggle-row')].find((l) => l.textContent?.includes('Patrocinadores'))!;
    expect((patro.querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeTrue();
    expect(patro.textContent).toContain('Nenhum patrocinador cadastrado');
    expect(patro.querySelector('a')?.getAttribute('href')).toBe('/eventos/t1');
  });

  it('com patrocinador, a linha mostra a descrição de sempre', async () => {
    const { el } = await mount();
    const patro = [...el.querySelectorAll('.og-toggle-row')].find((l) => l.textContent?.includes('Patrocinadores'))!;
    expect(patro.textContent).not.toContain('Nenhum patrocinador cadastrado');
  });

  it('"Mostrar agora" grava o carimbo do comando', async () => {
    const { el, fake } = await mount();
    const patro = [...el.querySelectorAll('.og-toggle-row')].find((l) => l.textContent?.includes('Patrocinadores'))!;
    (patro.querySelector('.og-tx-agora') as HTMLButtonElement).click();
    expect(typeof fake.saved[0]?.commands?.sponsorsNowAt).toBe('number');
  });

  it('"Mostrar agora" fica desabilitado com a tarja no ar — a tarja toma a tela', async () => {
    const fake = new FakeData();
    fake.control.set({
      ...DEFAULT_BROADCAST_CONTROL,
      interview: interviewWithDefaults({ name: 'Ana Souza', photoUrl: null, partnerName: null, categoryName: null, durationSec: null, shownAt: Date.now() }),
    });
    const { el } = await mount(fake);
    const agora = [...el.querySelectorAll('.og-tx-agora')] as HTMLButtonElement[];

    expect(agora.length).toBe(2);
    expect(agora.every((b) => b.disabled)).toBeTrue();
  });

  it('Grande final grava o modo escolhido', async () => {
    const { el, fake } = await mount();
    botao(el, 'Ligado').click();
    expect(fake.saved).toEqual([{ finalMode: 'on' }]);
  });

  it('erro de escrita aparece na tela', async () => {
    const fake = new FakeData();
    fake.saveError.set(true);
    const { el } = await mount(fake);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Não deu pra salvar');
  });
});
