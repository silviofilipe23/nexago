import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FieldValue, serverTimestamp } from 'firebase/firestore';
import { DEFAULT_BROADCAST_CONTROL, interviewWithDefaults } from '../data/broadcast-control';
import { INTERVALO_PRESETS } from '../data/broadcast-intervalo';
import type { EventosCard } from '../data/broadcast-eventos';
import type { BroadcastPrejogo } from '../data/broadcast-prejogo';
import type { TournamentMatch } from '../data/matches-repository';
import { FakeTransmissaoData as FakeData, PARTIDA, torneio } from './transmissao-data.fake';
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

/** Linha da lista "Gráficos" pelo nome. */
function linha(el: HTMLElement, nome: string): HTMLElement {
  const l = [...el.querySelectorAll<HTMLElement>('.og-tx-row')].find((r) => r.querySelector('.og-tx-row-nome')?.textContent?.trim().startsWith(nome));
  if (!l) throw new Error(`linha "${nome}" não encontrada`);
  return l;
}

function switchDe(el: HTMLElement, nome: string): HTMLButtonElement {
  return linha(el, nome).querySelector('button[role="switch"]') as HTMLButtonElement;
}

function selecionar(el: HTMLElement, nome: string): void {
  (linha(el, nome).querySelector('.og-tx-row-main') as HTMLButtonElement).click();
}

function tecla(key: string, alvo: EventTarget = document): void {
  alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const CARD = { a: { names: ['Ana'] }, b: { names: ['Carla'] } };

/** `escopo` restringe a busca a um grupo (aria-label): outros cards da tela — Grade do dia,
 *  Multi-quadras — também listam as categorias do torneio com os mesmos nomes. */
function botao(el: HTMLElement, texto: string, escopo?: string): HTMLButtonElement {
  const raiz = escopo ? el.querySelector(`[aria-label="${escopo}"]`)! : el;
  const b = [...raiz.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim().startsWith(texto));
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

  describe('lista de gráficos', () => {
    it('agrupa os gráficos na ordem da tela, com a linha de cada um', async () => {
      const { el } = await mount();
      const grupos = [...el.querySelectorAll('.og-tx-lista .og-tx-grupo')].map((g) => g.textContent?.trim());
      expect(grupos).toEqual(['Partida', 'Apresentação', 'Entrevista', 'Encerramento', 'Patrocínio']);
      const nomes = [...el.querySelectorAll('.og-tx-lista .og-tx-row-nome')].map((n) => {
        const c = n.cloneNode(true) as HTMLElement;
        c.querySelector('kbd')?.remove(); // tira a etiqueta do atalho (1–9, A, B…)
        return c.textContent?.trim();
      });
      expect(nomes).toEqual([
        'Placar',
        'Multi-quadras',
        'Pré-jogo',
        'Ranking Top 10',
        'Grade do dia',
        'Intervalo',
        'Tabela do grupo',
        'Chaves',
        'Próximos eventos',
        'Entrevista',
        'Campeões',
        'Resumo da partida',
        'Patrocinadores',
        'Doação PIX',
      ]);
    });

    it('cada linha traz o resumo do estado', async () => {
      const fake = new FakeData();
      fake.control.set({ ...fake.control(), multi: { on: true, mode: 'full', focusCourtId: null } });
      const { el } = await mount(fake);
      expect(linha(el, 'Placar').textContent).toContain('Canto inferior esquerdo');
      expect(linha(el, 'Multi-quadras').textContent).toContain('Tela cheia · destaque: Nenhuma');
      expect(linha(el, 'Campeões').textContent).toContain('Pódio quando a final termina');
      expect(linha(el, 'Entrevista').textContent).toContain('Fila · 0');
    });

    it('Intervalo: "Desligado" fora do ar; modo e duração quando no ar', async () => {
      const fake = new FakeData();
      const { el, fixture } = await mount(fake);
      expect(linha(el, 'Intervalo').textContent).toContain('Desligado');
      fake.control.set({ ...fake.control(), intervalo: { ...fake.control().intervalo, on: true } });
      await fixture.whenStable();
      expect(linha(el, 'Intervalo').textContent).toContain('Intervalo · 5:00');
      fake.control.set({ ...fake.control(), intervalo: { ...fake.control().intervalo, mode: 'pausa', durationSec: 0 } });
      await fixture.whenStable();
      expect(linha(el, 'Intervalo').textContent).toContain('Pausa · sem contagem');
    });

    it('sem categoria KOTC, o grupo King of the Court não aparece', async () => {
      const { el } = await mount();
      expect(el.textContent).not.toContain('King of the Court');
      expect(el.textContent).toContain('Placar');
    });

    it('com categoria KOTC, aparecem as linhas e a escolha do fim de rodada', async () => {
      const fake = new FakeData();
      fake.tournament.set(torneio(['king_of_court']));
      const { el, fixture } = await mount(fake);
      expect(el.textContent).toContain('Faixa da rodada');
      selecionar(el, 'Fim de rodada');
      await fixture.whenStable();
      expect(el.textContent).toContain('Classificadas');
      botao(el, 'Resultado', 'Configurações').click();
      expect(fake.saved).toEqual([{ kocRoundEndScreen: 'resultado' }]);
    });

    it('conta quantos gráficos estão no ar', async () => {
      const fake = new FakeData();
      const { el, fixture } = await mount(fake);
      // padrão do torneio sem KOTC: Placar, Campeões, Patrocinadores e Doação PIX
      expect(el.querySelector('.og-tx-count')?.textContent?.trim()).toBe('4 NO AR');
      fake.control.set({ ...fake.control(), multi: { on: true, mode: 'full', focusCourtId: null }, summaryOn: true });
      await fixture.whenStable();
      expect(el.querySelector('.og-tx-count')?.textContent?.trim()).toBe('6 NO AR');
    });

    it('desligar o placar grava só a chave dele', async () => {
      const { el, fake } = await mount();
      (el.querySelector('button[role="switch"][aria-label="Placar"]') as HTMLButtonElement).click();
      expect(fake.saved).toEqual([{ graphics: { scoreboard: false } }]);
    });

    it('o switch não seleciona a linha; clicar na linha seleciona', async () => {
      const { el, fixture } = await mount();
      switchDe(el, 'Multi-quadras').click();
      await fixture.whenStable();
      expect(el.querySelector('.og-tx-cfg h2')?.textContent).toContain('Placar');
      selecionar(el, 'Multi-quadras');
      await fixture.whenStable();
      expect(el.querySelector('.og-tx-cfg h2')?.textContent).toContain('Multi-quadras');
      expect(linha(el, 'Multi-quadras').classList).toContain('sel');
    });

    it('multi-quadras liga pelo switch com o resto do estado preservado', async () => {
      const { el, fake } = await mount();
      switchDe(el, 'Multi-quadras').click();
      expect(fake.saved).toEqual([{ multi: { on: true, mode: 'full', focusCourtId: null } }]);
    });
  });

  describe('itens travados', () => {
    it('Pré-jogo e Ranking sem card: amarelos, "Monte o card primeiro" e switch travado', async () => {
      const { el, fake } = await mount();
      for (const nome of ['Pré-jogo', 'Ranking Top 10']) {
        const l = linha(el, nome);
        expect(l.textContent).toContain('Monte o card primeiro');
        expect(l.classList).toContain('warn');
        const sw = switchDe(el, nome);
        expect(sw.disabled).toBeTrue();
        sw.click();
      }
      expect(fake.saved).toEqual([]);
    });

    it('com o card montado o switch libera e liga com o card preservado', async () => {
      const fake = new FakeData();
      const prejogo = { on: false, card: CARD } as unknown as BroadcastPrejogo;
      fake.control.set({ ...fake.control(), prejogo });
      const { el } = await mount(fake);
      expect(switchDe(el, 'Pré-jogo').disabled).toBeFalse();
      expect(linha(el, 'Pré-jogo').textContent).toContain('Ana × Carla');
      switchDe(el, 'Pré-jogo').click();
      expect(fake.saved).toEqual([{ prejogo: { on: true, card: CARD } }] as never);
    });

    it('dígito de item travado não faz nada', async () => {
      const { fake, fixture } = await mount();
      tecla('3'); // Pré-jogo
      await fixture.whenStable();
      expect(fake.saved).toEqual([]);
    });
  });

  describe('coluna Configurações', () => {
    it('mostra as opções do gráfico selecionado', async () => {
      const { el, fixture } = await mount();
      const visivel = (tag: string) => !(el.querySelector(tag) as HTMLElement).hidden;
      expect(visivel('og-tx-multi')).toBeFalse();
      selecionar(el, 'Multi-quadras');
      await fixture.whenStable();
      expect(visivel('og-tx-multi')).toBeTrue();
      expect(visivel('og-tx-entrevista')).toBeFalse();
      selecionar(el, 'Entrevista');
      await fixture.whenStable();
      expect(visivel('og-tx-entrevista')).toBeTrue();
      expect(visivel('og-tx-multi')).toBeFalse();
      selecionar(el, 'Grade do dia');
      await fixture.whenStable();
      expect(visivel('og-tx-grade')).toBeTrue();
    });

    it('sem moldura nem chave "No ar" duplicada dentro dos cards', async () => {
      const { el } = await mount();
      expect(el.querySelector('og-tx-multi button[aria-label="Multi-quadras no ar"]')).toBeNull();
      expect(el.querySelector('og-tx-grade button[aria-label="Grade do dia no ar"]')).toBeNull();
      expect(el.querySelector('og-tx-multi .og-card-title')).toBeNull();
    });

    it('o "No ar" do cabeçalho tem o mesmo efeito do switch da lista', async () => {
      const { el, fixture, fake } = await mount();
      selecionar(el, 'Grade do dia');
      await fixture.whenStable();
      (el.querySelector('.og-tx-cfg button[aria-label="Grade do dia no ar"]') as HTMLButtonElement).click();
      expect(fake.saved).toEqual([{ grade: { on: true, categoryId: null } }]);
    });
  });

  describe('Tabela do grupo', () => {
    const base = DEFAULT_BROADCAST_CONTROL.grupo;
    const partida = (categoryId: string, round: string) => ({ ...PARTIDA, id: `${categoryId}-${round}`, categoryId, round }) as unknown as TournamentMatch;
    const comGrupos = () => {
      const fake = new FakeData();
      fake.tournament.set(torneio(['groups', 'groups', 'single_elimination']));
      fake.matches.set([partida('cat1', 'Grupo A'), partida('cat1', 'Grupo B'), partida('cat2', 'Grupo C'), partida('cat3', 'Rodada 1')]);
      return fake;
    };

    it('resumo: desligado, um grupo e todos os grupos', async () => {
      const fake = comGrupos();
      const { el, fixture } = await mount(fake);
      expect(linha(el, 'Tabela do grupo').textContent).toContain('Desligado');
      fake.control.set({ ...fake.control(), grupo: { on: true, categoryId: 'cat1', mode: 'um', group: 'B' } });
      await fixture.whenStable();
      expect(linha(el, 'Tabela do grupo').textContent).toContain('Grupo B · Feminina B');
      fake.control.set({ ...fake.control(), grupo: { on: true, categoryId: null, mode: 'todos', group: null } });
      await fixture.whenStable();
      expect(linha(el, 'Tabela do grupo').textContent).toContain('Todos os grupos · Feminina B');
    });

    it('switch da lista e "No ar" do cabeçalho gravam o objeto completo', async () => {
      const { el, fixture, fake } = await mount(comGrupos());
      switchDe(el, 'Tabela do grupo').click();
      expect(fake.saved).toEqual([{ grupo: { ...base, on: true } }]);
      selecionar(el, 'Tabela do grupo');
      await fixture.whenStable();
      (el.querySelector('.og-tx-cfg button[aria-label="Tabela do grupo no ar"]') as HTMLButtonElement).click();
      expect(fake.saved.at(-1)).toEqual({ grupo: { ...base, on: true } });
      expect(el.querySelector('og-tx-grupo button[aria-label="Tabela do grupo no ar"]')).toBeNull();
    });

    it('chips: só categorias com grupos; categoria, modo e grupo gravam o objeto completo', async () => {
      const { el, fixture, fake } = await mount(comGrupos());
      selecionar(el, 'Tabela do grupo');
      await fixture.whenStable();
      const categorias = [...el.querySelectorAll('[aria-label="Categoria da tabela"] button')].map((b) => b.textContent?.trim());
      expect(categorias).toEqual(['Automática', 'Feminina B', 'C1']);
      botao(el, 'C1', 'Categoria da tabela').click();
      expect(fake.saved.at(-1)).toEqual({ grupo: { ...base, categoryId: 'cat2' } });
      botao(el, 'Todos os grupos', 'Modo da tabela').click();
      expect(fake.saved.at(-1)).toEqual({ grupo: { ...base, mode: 'todos' } });
      const letras = [...el.querySelectorAll('[aria-label="Grupo da tabela"] button')].map((b) => b.textContent?.trim());
      expect(letras).toEqual(['Primeiro', 'A', 'B']);
      botao(el, 'B', 'Grupo da tabela').click();
      expect(fake.saved.at(-1)).toEqual({ grupo: { ...base, group: 'B' } });
    });

    it('sem categoria com grupos, avisa', async () => {
      const { el } = await mount();
      expect(el.querySelector('og-tx-grupo')?.textContent).toContain('Nenhuma categoria deste torneio tem fase de grupos');
    });

    it('atalho numérico liga a tabela', async () => {
      const { fake } = await mount(comGrupos());
      tecla('7');
      expect(fake.saved).toEqual([{ grupo: { ...base, on: true } }]);
    });
  });

  describe('Chaves', () => {
    const base = DEFAULT_BROADCAST_CONTROL.chave;
    const partida = (categoryId: string, matchType: string) => ({ ...PARTIDA, id: `${categoryId}-${matchType}`, categoryId, matchType }) as unknown as TournamentMatch;
    const comChaves = () => {
      const fake = new FakeData();
      fake.tournament.set(torneio(['single_elimination', 'groups', 'double_elimination']));
      fake.matches.set([partida('cat1', 'knockout'), partida('cat2', 'group'), partida('cat3', 'WB')]);
      return fake;
    };

    it('resumo: desligado, categoria e automática', async () => {
      const fake = comChaves();
      const { el, fixture } = await mount(fake);
      expect(linha(el, 'Chaves').textContent).toContain('Desligado');
      fake.control.set({ ...fake.control(), chave: { on: true, categoryId: 'cat3' } });
      await fixture.whenStable();
      expect(linha(el, 'Chaves').textContent).toContain('C2');
      fake.control.set({ ...fake.control(), chave: { on: true, categoryId: null } });
      await fixture.whenStable();
      expect(linha(el, 'Chaves').textContent).toContain('Automática');
    });

    it('switch da lista e "No ar" do cabeçalho gravam o objeto completo', async () => {
      const { el, fixture, fake } = await mount(comChaves());
      switchDe(el, 'Chaves').click();
      expect(fake.saved).toEqual([{ chave: { ...base, on: true } }]);
      selecionar(el, 'Chaves');
      await fixture.whenStable();
      (el.querySelector('.og-tx-cfg button[aria-label="Chaves no ar"]') as HTMLButtonElement).click();
      expect(fake.saved.at(-1)).toEqual({ chave: { ...base, on: true } });
      expect(el.querySelector('og-tx-chave button[aria-label="Chaves no ar"]')).toBeNull();
    });

    it('chips: só categorias com chave; escolher grava o objeto completo', async () => {
      const { el, fixture, fake } = await mount(comChaves());
      selecionar(el, 'Chaves');
      await fixture.whenStable();
      const categorias = [...el.querySelectorAll('[aria-label="Categoria da chave"] button')].map((b) => b.textContent?.trim());
      expect(categorias).toEqual(['Automática', 'Feminina B', 'C2']);
      botao(el, 'C2', 'Categoria da chave').click();
      expect(fake.saved.at(-1)).toEqual({ chave: { ...base, categoryId: 'cat3' } });
    });

    it('sem categoria com chave, avisa', async () => {
      const fake = new FakeData();
      fake.matches.set([]);
      const { el } = await mount(fake);
      expect(el.querySelector('og-tx-chave')?.textContent).toContain('Nenhuma categoria deste torneio tem chave eliminatória');
    });

    it('atalho numérico liga a chave', async () => {
      const { fake } = await mount(comChaves());
      tecla('8');
      expect(fake.saved).toEqual([{ chave: { ...base, on: true } }]);
    });

    it('no ar, aparece na prévia como CHAVES e o chip × desliga', async () => {
      const fake = comChaves();
      fake.control.set({ ...fake.control(), chave: { on: true, categoryId: 'cat1' } });
      const { el } = await mount(fake);
      expect(el.querySelector('.og-tx-preview')?.textContent).toContain('CHAVES');
      (el.querySelector('button[aria-label="Tirar Chaves do ar"]') as HTMLButtonElement).click();
      expect(fake.saved).toEqual([{ chave: { on: false, categoryId: 'cat1' } }]);
    });
  });

  describe('Próximos eventos', () => {
    const CARD_EVENTOS: EventosCard = {
      key: 'ev:1',
      season: 'Circuito NexaGO 2026',
      items: [
        {
          id: 'e1',
          name: 'Etapa Jeri',
          startMs: Date.UTC(2026, 10, 20, 12),
          endMs: Date.UTC(2026, 10, 21, 12),
          venue: null,
          city: null,
          state: null,
          coverUrl: null,
          categories: [],
          prizeCents: null,
          filled: null,
          total: null,
          status: 'abertas',
          url: 'https://nexago.com.br/torneios/etapa-jeri-e1',
        },
      ],
    };
    const comCard = (over: Partial<typeof DEFAULT_BROADCAST_CONTROL.eventos> = {}) => {
      const fake = new FakeData();
      fake.control.set({ ...fake.control(), eventos: { on: false, mode: 'full', card: CARD_EVENTOS, ...over } });
      return fake;
    };

    it('sem card: item travado e amarelo, "Monte o card primeiro"', async () => {
      const { el } = await mount();
      const l = linha(el, 'Próximos eventos');
      expect(l.textContent).toContain('Monte o card primeiro');
      expect(l.classList).toContain('warn');
      expect(switchDe(el, 'Próximos eventos').disabled).toBeTrue();
    });

    it('com card: "Desligado" e, no ar, modo e quantidade', async () => {
      const fake = comCard();
      const { el, fixture } = await mount(fake);
      expect(linha(el, 'Próximos eventos').textContent).toContain('Desligado');
      expect(switchDe(el, 'Próximos eventos').disabled).toBeFalse();
      fake.control.set({ ...fake.control(), eventos: { on: true, mode: 'full', card: CARD_EVENTOS } });
      await fixture.whenStable();
      expect(linha(el, 'Próximos eventos').textContent).toContain('Tela cheia · 1 evento');
    });

    it('o switch da lista e o "No ar" do cabeçalho gravam o objeto completo', async () => {
      const { el, fake, fixture } = await mount(comCard());
      switchDe(el, 'Próximos eventos').click();
      expect(fake.saved).toEqual([{ eventos: { on: true, mode: 'full', card: CARD_EVENTOS } }]);
      selecionar(el, 'Próximos eventos');
      await fixture.whenStable();
      (el.querySelector('.og-tx-cfg-noar ~ button[role="switch"]') as HTMLButtonElement).click();
      expect(fake.saved.at(-1)).toEqual({ eventos: { on: true, mode: 'full', card: CARD_EVENTOS } });
    });

    it('trocar o modo grava o objeto completo', async () => {
      const { el, fake } = await mount(comCard({ on: true }));
      botao(el, 'Faixa', 'Modo dos eventos').click();
      expect(fake.saved).toEqual([{ eventos: { on: true, mode: 'strip', card: CARD_EVENTOS } }]);
    });

    it('editar a temporada regrava o card com o novo nome, sem mudar a key', async () => {
      const { el, fake } = await mount(comCard());
      const campo = el.querySelector('input[aria-label="Temporada"]') as HTMLInputElement;
      expect(campo.value).toBe('Circuito NexaGO 2026');
      campo.value = 'Copa Verão';
      campo.dispatchEvent(new Event('input'));
      campo.dispatchEvent(new Event('blur'));
      expect(fake.saved).toEqual([{ eventos: { on: false, mode: 'full', card: { ...CARD_EVENTOS, season: 'Copa Verão' } } }]);
    });

    it('no ar, aparece na prévia e o Esc desliga na mesma escrita', async () => {
      const { el, fake } = await mount(comCard({ on: true }));
      expect(el.querySelector('.og-tx-preview')?.textContent).toContain('PRÓXIMOS EVENTOS');
      tecla('Escape');
      expect(fake.saved.length).toBe(1);
      expect(fake.saved[0].eventos).toEqual({ on: false, mode: 'full', card: CARD_EVENTOS });
    });

    it('atalho numérico liga o item (9º da lista)', async () => {
      const { fake } = await mount(comCard());
      tecla('9');
      expect(fake.saved).toEqual([{ eventos: { on: true, mode: 'full', card: CARD_EVENTOS } }]);
    });
  });

  describe('Intervalo', () => {
    const base = DEFAULT_BROADCAST_CONTROL.intervalo;

    it('o switch da lista e o "No ar" do cabeçalho gravam o objeto completo', async () => {
      const { el, fixture, fake } = await mount();
      switchDe(el, 'Intervalo').click();
      expect(fake.saved).toEqual([{ intervalo: { ...base, on: true } }]);
      selecionar(el, 'Intervalo');
      await fixture.whenStable();
      (el.querySelector('.og-tx-cfg button[aria-label="Intervalo no ar"]') as HTMLButtonElement).click();
      expect(fake.saved.at(-1)).toEqual({ intervalo: { ...base, on: true } });
    });

    it('trocar o modo aplica o preset e mantém o resto', async () => {
      const { el, fixture, fake } = await mount();
      selecionar(el, 'Intervalo');
      await fixture.whenStable();
      botao(el, 'Pausa', 'Modo do intervalo').click();
      expect(fake.saved).toEqual([
        { intervalo: { ...base, mode: 'pausa', line1: 'Pausa para', line2: 'o almoço', subtitle: INTERVALO_PRESETS.pausa.subtitle, durationSec: 300 } },
      ]);
    });

    it('texto grava ao sair do campo, não a cada tecla', async () => {
      const { el, fixture, fake } = await mount();
      const campo = el.querySelector('#og-iv-line1') as HTMLInputElement;
      campo.value = 'Voltamos em';
      campo.dispatchEvent(new Event('input'));
      expect(fake.saved).toEqual([]);
      campo.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      expect(fake.saved).toEqual([{ intervalo: { ...base, line1: 'Voltamos em' } }]);
    });

    it('duração em chips', async () => {
      const { el, fake } = await mount();
      botao(el, '10 min', 'Duração da contagem').click();
      expect(fake.saved).toEqual([{ intervalo: { ...base, durationSec: 600 } }]);
    });

    it('iniciar contagem grava o carimbo do servidor; parar grava null', async () => {
      const { el, fixture, fake } = await mount();
      botao(el, 'Iniciar contagem').click();
      const patch = fake.saved[0].intervalo!;
      expect(patch.startedAt instanceof FieldValue).toBeTrue();
      expect((patch.startedAt as FieldValue).isEqual(serverTimestamp())).toBeTrue();
      expect({ ...patch, startedAt: null } as unknown).toEqual(base);

      const inicio = new Date(Date.now() - 60_000);
      fake.control.set({ ...fake.control(), intervalo: { ...base, startedAt: inicio } });
      await fixture.whenStable();
      expect(botao(el, 'Reiniciar')).toBeTruthy();
      botao(el, 'Parar contagem').click();
      expect(fake.saved.at(-1)).toEqual({ intervalo: { ...base, startedAt: null } });
    });

    it('editar com a contagem rolando regrava o mesmo início', async () => {
      const fake = new FakeData();
      const inicio = new Date(Date.now() - 60_000);
      fake.control.set({ ...fake.control(), intervalo: { ...base, startedAt: inicio } });
      const { el } = await mount(fake);
      botao(el, '15 min', 'Duração da contagem').click();
      expect(fake.saved).toEqual([{ intervalo: { ...base, durationSec: 900, startedAt: inicio } }]);
    });
  });

  it('escolher a quadra grava courtId', async () => {
    const { el, fake } = await mount();
    botao(el, 'Quadra 2').click();
    expect(fake.saved).toEqual([{ courtId: 'q2' }]);
  });

  it('copia o link do OBS', async () => {
    const copiar = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    const { el } = await mount();
    botao(el, 'Copiar').click();
    expect(copiar).toHaveBeenCalledWith(`${location.origin}/transmissao/t1`);
  });

  it('o "?" mostra a instrução do OBS', async () => {
    const { el, fixture } = await mount();
    expect(el.querySelector('[role="note"]')).toBeNull();
    (el.querySelector('button[aria-label="Como usar no OBS"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('[role="note"]')?.textContent).toContain('1920×1080');
  });

  describe('"Agora"', () => {
    it('fica desabilitado com a chave desligada', async () => {
      const fake = new FakeData();
      fake.control.set({ ...DEFAULT_BROADCAST_CONTROL, graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, donation: false } });
      const { el } = await mount(fake);
      expect((linha(el, 'Doação PIX').querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeTrue();
      expect((linha(el, 'Patrocinadores').querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeFalse();
    });

    it('torneio sem patrocinador: desabilitado e o painel diz onde cadastrar', async () => {
      const fake = new FakeData();
      fake.tournament.set({ ...torneio(['single_elimination']), sponsors: [] });
      const { el, fixture } = await mount(fake);
      const patro = linha(el, 'Patrocinadores');
      expect((patro.querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeTrue();
      selecionar(el, 'Patrocinadores');
      await fixture.whenStable();
      const cfg = el.querySelector('.og-tx-cfg')!;
      expect(cfg.textContent).toContain('Nenhum patrocinador cadastrado');
      expect(cfg.querySelector('a')?.getAttribute('href')).toBe('/eventos/t1');
      expect((cfg.querySelector('.og-tx-agora-cfg') as HTMLButtonElement).disabled).toBeTrue();
    });

    it('com patrocinador, nada de aviso de cadastro', async () => {
      const { el, fixture } = await mount();
      selecionar(el, 'Patrocinadores');
      await fixture.whenStable();
      expect(el.querySelector('.og-tx-cfg')!.textContent).not.toContain('Nenhum patrocinador cadastrado');
    });

    it('grava o carimbo do comando', async () => {
      const { el, fake } = await mount();
      (linha(el, 'Patrocinadores').querySelector('.og-tx-agora') as HTMLButtonElement).click();
      expect(typeof fake.saved[0]?.commands?.sponsorsNowAt).toBe('number');
      (linha(el, 'Doação PIX').querySelector('.og-tx-agora') as HTMLButtonElement).click();
      expect(typeof fake.saved[1]?.commands?.donationNowAt).toBe('number');
    });

    it('fica desabilitado com a tarja no ar — a tarja toma a tela', async () => {
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
  });

  describe('categoria do pódio', () => {
    const FINAL_FEM = {
      id: 'f1',
      tournamentId: 't1',
      categoryId: 'cat1',
      courtId: 'q2',
      status: 'completed',
      matchType: 'Final',
      teamAId: 'ta',
      teamBId: 'tb',
      winnerSide: 1,
      sets: [{ a: 21, b: 18 }],
      team1Label: 'Ana / Bia',
      team2Label: 'Carla / Dani',
      matchStartedAt: null,
      matchEndedAt: null,
      scheduledAt: null,
    } as unknown as TournamentMatch;

    function chips(el: HTMLElement): string[] {
      const grupo = el.querySelector('[aria-label="Categoria do pódio"]')!;
      return [...grupo.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim() + (b.classList.contains('active') ? ' ✓' : ''));
    }

    it('automático por padrão, com cada categoria do torneio pra escolher', async () => {
      const fake = new FakeData();
      fake.tournament.set(torneio(['single_elimination', 'king_of_court']));
      const { el, fixture } = await mount(fake);
      selecionar(el, 'Campeões');
      await fixture.whenStable();
      expect(chips(el)).toEqual(['Automático ✓', 'Feminina B', 'C1']);
      expect(el.textContent).toContain('Segue a final que termina na quadra transmitida');
    });

    it('escolher grava a categoria; Automático volta pra null', async () => {
      const fake = new FakeData();
      const { el, fixture } = await mount(fake);
      selecionar(el, 'Campeões');
      await fixture.whenStable();
      botao(el, 'Feminina B', 'Categoria do pódio').click();
      expect(fake.saved).toEqual([{ championsCategoryId: 'cat1' }]);
      fake.control.set({ ...fake.control(), championsCategoryId: 'cat1' });
      await fixture.whenStable();
      botao(el, 'Automático', 'Categoria do pódio').click();
      expect(fake.saved.at(-1)).toEqual({ championsCategoryId: null });
    });

    it('final da categoria ainda não decidida: o painel avisa que nada vai ao ar', async () => {
      const fake = new FakeData();
      fake.control.set({ ...fake.control(), championsCategoryId: 'cat1' });
      const { el, fixture } = await mount(fake);
      selecionar(el, 'Campeões');
      await fixture.whenStable();
      expect(chips(el)).toContain('Feminina B ✓');
      expect(el.textContent).toContain('A final de Feminina B ainda não terminou');
    });

    it('final decidida: o painel diz que o pódio vai ao ar', async () => {
      const fake = new FakeData();
      fake.control.set({ ...fake.control(), championsCategoryId: 'cat1' });
      fake.matches.set([FINAL_FEM]);
      const { el, fixture } = await mount(fake);
      selecionar(el, 'Campeões');
      await fixture.whenStable();
      expect(el.textContent).toContain('Pódio de Feminina B no ar');
    });
  });

  it('Grande final grava o modo escolhido', async () => {
    const { el, fake, fixture } = await mount();
    selecionar(el, 'Campeões');
    await fixture.whenStable();
    botao(el, 'Ligado', 'Configurações').click();
    expect(fake.saved).toEqual([{ finalMode: 'on' }]);
  });

  it('Resumo da partida liga pela lista', async () => {
    const { el, fake } = await mount();
    switchDe(el, 'Resumo da partida').click();
    expect(fake.saved).toEqual([{ summaryOn: true }]);
  });

  describe('No ar', () => {
    it('a prévia mostra uma caixa por gráfico ligado, e a marca N', async () => {
      const fake = new FakeData();
      fake.control.set({ ...fake.control(), multi: { on: true, mode: 'strip', focusCourtId: null } });
      const { el } = await mount(fake);
      const caixas = [...el.querySelectorAll('.og-tx-preview .og-tx-pv')].map((c) => c.textContent?.trim());
      expect(caixas).toEqual(['Placar', 'Multi-quadras', 'Campeões', 'Oferecimento', 'Doação PIX']);
      expect(el.querySelector('.og-tx-pv-strip')?.textContent).toContain('Multi-quadras');
      expect(el.querySelector('.og-tx-pv-mark')?.textContent).toBe('N');
    });

    it('"Ativos agora" lista o que está no ar e o × desliga', async () => {
      const { el, fake } = await mount();
      const chips = [...el.querySelectorAll('.og-tx-ativo')].map((c) => c.textContent?.replace('×', '').trim());
      expect(chips).toEqual(['Placar', 'Campeões', 'Patrocinadores', 'Doação PIX']);
      (el.querySelector('button[aria-label="Tirar Doação PIX do ar"]') as HTMLButtonElement).click();
      expect(fake.saved).toEqual([{ graphics: { donation: false } }]);
    });

    it('o × da entrevista tira a tarja', async () => {
      const fake = new FakeData();
      fake.control.set({
        ...fake.control(),
        interview: interviewWithDefaults({ name: 'Ana Souza', photoUrl: null, partnerName: null, categoryName: null, durationSec: null, shownAt: Date.now() }),
      });
      const { el } = await mount(fake);
      (el.querySelector('button[aria-label="Tirar Entrevista do ar"]') as HTMLButtonElement).click();
      expect(fake.aired).toEqual([{ interview: null, queue: null }]);
    });

    it('lista os atalhos', async () => {
      const { el } = await mount();
      const t = el.querySelector('.og-tx-atalhos')!.textContent!;
      expect(t).toContain('1–9');
      expect(t).toContain('A–Z');
      expect(t).toContain('Liga/desliga o gráfico da lista');
      expect(t).toContain('Navega entre gráficos');
      expect(t).toContain('Tira tudo do ar, menos o placar');
    });
  });

  describe('atalhos de teclado', () => {
    it('os itens depois do 9º ganham letras (A, B, C…), mostradas na lista', async () => {
      const { el } = await mount();
      const badges = Array.from(el.querySelectorAll('.og-tx-row-nome kbd')).map((k) => k.textContent?.trim());
      expect(badges.slice(0, 9)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
      expect(badges.slice(9, 14)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('uma letra liga/desliga o item correspondente, maiúscula ou minúscula', async () => {
      const { fake } = await mount();
      tecla('b'); // 11º: Campeões
      expect(fake.saved.at(-1)).toEqual({ graphics: { champions: false } });
      tecla('D'); // 13º: Patrocinadores
      expect(fake.saved.at(-1)).toEqual({ graphics: { sponsors: false } });
      tecla('z'); // além da lista: nada
      expect(fake.saved.length).toBe(2);
    });

    it('um dígito liga/desliga o N-ésimo item da lista', async () => {
      const { fake, fixture } = await mount();
      tecla('1');
      expect(fake.saved).toEqual([{ graphics: { scoreboard: false } }]);
      tecla('2');
      expect(fake.saved.at(-1)).toEqual({ multi: { on: true, mode: 'full', focusCourtId: null } });
      await fixture.whenStable();
    });

    it('↑ ↓ movem a seleção', async () => {
      const { el, fixture } = await mount();
      tecla('ArrowDown');
      await fixture.whenStable();
      expect(el.querySelector('.og-tx-cfg h2')?.textContent).toContain('Multi-quadras');
      tecla('ArrowUp');
      tecla('ArrowUp');
      await fixture.whenStable();
      expect(el.querySelector('.og-tx-cfg h2')?.textContent).toContain('Placar');
    });

    it('Esc tira tudo do ar, menos o placar', async () => {
      const fake = new FakeData();
      const prejogo = { on: true, card: CARD } as unknown as BroadcastPrejogo;
      fake.control.set({
        ...fake.control(),
        multi: { on: true, mode: 'strip', focusCourtId: null },
        grade: { on: true, categoryId: 'cat1' },
        intervalo: { ...DEFAULT_BROADCAST_CONTROL.intervalo, on: true },
        grupo: { on: true, categoryId: 'cat1', mode: 'todos', group: 'A' },
        chave: { on: true, categoryId: 'cat1' },
        prejogo,
        summaryOn: true,
        interview: interviewWithDefaults({ name: 'Ana Souza', photoUrl: null, partnerName: null, categoryName: null, durationSec: null, shownAt: Date.now() }),
      });
      const { fixture } = await mount(fake);
      tecla('Escape');
      await fixture.whenStable();
      expect(fake.saved.length).toBe(1);
      const patch = fake.saved[0];
      expect(patch.graphics).toEqual({ champions: false, sponsors: false, donation: false });
      expect(patch.multi).toEqual({ on: false, mode: 'strip', focusCourtId: null });
      expect(patch.grade).toEqual({ on: false, categoryId: 'cat1' });
      expect(patch.intervalo).toEqual({ ...DEFAULT_BROADCAST_CONTROL.intervalo, on: false });
      expect(patch.grupo).toEqual({ on: false, categoryId: 'cat1', mode: 'todos', group: 'A' });
      expect(patch.chave).toEqual({ on: false, categoryId: 'cat1' });
      expect(patch.prejogo).toEqual({ on: false, card: CARD } as never);
      expect(patch.summaryOn).toBeFalse();
      expect(fake.aired).toEqual([{ interview: null, queue: null }]);
    });

    it('Esc sem tarja no ar não mexe na tarja', async () => {
      const { fake } = await mount();
      tecla('Escape');
      expect(fake.aired).toEqual([]);
    });

    it('ignora as teclas com o foco num campo de texto', async () => {
      const { el, fake } = await mount();
      const campo = el.querySelector('input[aria-label="Nome do repórter"]') as HTMLInputElement;
      tecla('1', campo);
      tecla('ArrowDown', campo);
      tecla('Escape', campo);
      expect(fake.saved).toEqual([]);
      expect(fake.aired).toEqual([]);
    });

    it('ignora com modificador', async () => {
      const { fake } = await mount();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true }));
      expect(fake.saved).toEqual([]);
    });
  });

  it('erro de escrita aparece na tela', async () => {
    const fake = new FakeData();
    fake.saveError.set(true);
    const { el } = await mount(fake);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Não deu pra salvar');
  });
});
