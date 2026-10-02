import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { interviewWithDefaults, type BroadcastInterview } from '../../painel/data/broadcast-control';
import { INTERVIEW_EXIT_MS, INTERVIEW_SWAP_MS } from './overlay-interview';
import { OverlayInterviewComponent } from './overlay-interview.component';
import type { OverlayPatroItem } from './overlay-nx';

/** Tarja v1 — o que o painel de 01/10 grava. */
const TARJA: BroadcastInterview = interviewWithDefaults({
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000,
});

const CAMPANHA = {
  title: 'Campanha no torneio',
  summary: '1V · 1D',
  rows: [
    { mark: 'V', won: true, opponent: 'Carla / Dani', phase: 'Grupo A', score: '21–15' },
    { mark: 'D', won: false, opponent: 'Eva / Fê', phase: 'Semifinal', score: '1–2' },
  ],
};

const DUPLA: BroadcastInterview = {
  ...TARJA,
  name: 'Ana Souza / Bia Lima',
  kind: 'dupla',
  key: 'dupla:t1',
  names: ['Ana Souza', 'Bia Lima'],
  photos: [null, null],
  badge: 'DUPLA',
  context: 'Feminina B · Semifinal',
  subtitle: null,
  chips: [
    { label: 'Ranking', value: '7º' },
    { label: 'Pontos', value: '880' },
  ],
  rankingPos: 7,
  campaign: CAMPANHA,
};

const EQUIPE: BroadcastInterview = {
  ...TARJA,
  name: 'Equipe Sol',
  kind: 'equipe',
  key: 'equipe:t2',
  names: ['Equipe Sol'],
  photos: [],
  members: [
    { name: 'Eva', photoUrl: null },
    { name: 'Fê', photoUrl: null },
    { name: 'Gabi', photoUrl: null },
  ],
  badge: 'EQUIPE',
  subtitle: null,
};

describe('OverlayInterviewComponent', () => {
  let fixture: ComponentFixture<OverlayInterviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayInterviewComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(OverlayInterviewComponent);
  });

  async function show(data: BroadcastInterview | null, extra: { eventName?: string; sponsors?: OverlayPatroItem[] } = {}) {
    fixture.componentRef.setInput('data', data);
    if (extra.eventName != null) fixture.componentRef.setInput('eventName', extra.eventName);
    if (extra.sponsors != null) fixture.componentRef.setInput('sponsors', extra.sponsors);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  it('fora do ar não desenha nada', async () => {
    const el = await show(null);
    expect(el.querySelector('.bug')).toBeNull();
    expect(el.querySelector('og-overlay-interview-card')).toBeNull();
  });

  it('bug do topo: Entrevista, Ao vivo e o nome do torneio', async () => {
    const el = await show(TARJA, { eventName: 'Copa VH' });
    expect(text(el, '.bug .tag')).toBe('Entrevista');
    expect(text(el, '.bug .live')).toBe('Ao vivo');
    expect(text(el, '.bug .evento')).toBe('Copa VH');
  });

  it('tarja v1 vira o card de atleta: nome, categoria no contexto e parceiro no subtítulo', async () => {
    const el = await show(TARJA);
    expect(text(el, '.nome')).toBe('Ana Souza');
    expect(text(el, '.selo')).toBe('ATLETA');
    expect(text(el, '.ctx')).toBe('Feminina B');
    expect(text(el, '.sub')).toBe('Dupla com Bia Lima');
    expect(el.textContent).toContain('AS');
  });

  it('dupla: dois avatares e os nomes separados por barra', async () => {
    const el = await show(DUPLA);
    expect(el.querySelectorAll('.foto og-avatar').length).toBe(2);
    expect(text(el, '.nome')).toBe('Ana Souza/Bia Lima');
    expect(el.querySelector('.nome .sep')).not.toBeNull();
    expect(el.querySelector('.sub')).toBeNull();
  });

  it('equipe: monograma no lugar da foto e o elenco em pílulas', async () => {
    const el = await show(EQUIPE);
    expect(text(el, '.monograma')).toBe('ES');
    expect([...el.querySelectorAll('.membro-nome')].map((n) => n.textContent)).toEqual(['Eva', 'Fê', 'Gabi']);
  });

  it('chips "rótulo valor"', async () => {
    const el = await show(DUPLA);
    expect([...el.querySelectorAll('.chip')].map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Ranking7º', 'Pontos880']);
  });

  it('fora do pódio fica laranja e sem indicador', async () => {
    const el = await show(DUPLA);
    expect(el.querySelector('og-overlay-interview-card')!.hasAttribute('data-tone')).toBeFalse();
    expect(el.querySelector('.podio')).toBeNull();
  });

  it('pódio do ranking pinta o card e mostra "Nº no ranking"', async () => {
    const el = await show({ ...DUPLA, rankingPos: 1 });
    expect(el.querySelector('og-overlay-interview-card')!.getAttribute('data-tone')).toBe('ouro');
    expect(text(el, '.podio')).toBe('1º no ranking');
  });

  it('campanha com resumo e uma linha por partida', async () => {
    const el = await show(DUPLA);
    expect(text(el, '.campanha .titulo')).toBe('Campanha no torneio');
    expect(text(el, '.campanha .resumo')).toBe('1V · 1D');
    expect(el.querySelectorAll('.campanha .linha').length).toBe(2);
    expect(el.querySelector('.campanha .linha .marca')!.classList).toContain('venceu');
  });

  it('sem campanha, ou com a chave desligada, o bloco não aparece', async () => {
    expect((await show(TARJA)).querySelector('.campanha')).toBeNull();
    fixture = TestBed.createComponent(OverlayInterviewComponent);
    expect((await show({ ...DUPLA, showCampaign: false })).querySelector('.campanha')).toBeNull();
  });

  it('marca nexaGO sempre; "Oferecimento" só com patrocinador', async () => {
    let el = await show(TARJA);
    expect(text(el, '.nexa')).toBe('NEXAGO');
    expect(el.querySelector('.oferecimento')).toBeNull();
    el = await show(TARJA, { sponsors: [{ nome: 'Arena Sol', logo: '' }] });
    expect(text(el, '.oferecimento')).toBe('Oferecimento');
    expect(text(el, '.slot')).toBe('Arena Sol');
  });

  describe('com relógio', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('troca de entrevistado: o atual sai, e o próximo só entra depois de 520 ms', async () => {
      let el = await show(TARJA);
      el = await show(DUPLA);
      expect(text(el, '.nome')).toBe('Ana Souza');
      expect(el.querySelector('.terco')!.getAttribute('data-phase')).toBe('swap');
      // Bug e marca não saem numa troca.
      expect(el.querySelector('.bug')!.getAttribute('data-phase')).toBe('swap');

      jasmine.clock().tick(INTERVIEW_SWAP_MS);
      await fixture.whenStable();
      expect(text(el, '.nome')).toBe('Ana Souza/Bia Lima');
      expect(el.querySelector('.terco')!.getAttribute('data-phase')).toBe('in');
    });

    it('chave da campanha desligada no ar: a campanha sai e o card fica', async () => {
      let el = await show(DUPLA);
      el = await show({ ...DUPLA, showCampaign: false });
      expect(el.querySelector('.campanha')!.getAttribute('data-phase')).toBe('out');
      expect(el.querySelector('.terco')!.getAttribute('data-phase')).toBe('in');
      jasmine.clock().tick(INTERVIEW_EXIT_MS);
      await fixture.whenStable();
      expect(el.querySelector('.campanha')).toBeNull();
      expect(el.querySelector('og-overlay-interview-card')).not.toBeNull();
    });

    it('tirar do ar: tudo sai e desmonta depois da saída escalonada', async () => {
      let el = await show(DUPLA);
      el = await show(null);
      expect(el.querySelector('.bug')!.getAttribute('data-phase')).toBe('out');
      jasmine.clock().tick(INTERVIEW_EXIT_MS);
      await fixture.whenStable();
      expect(el.querySelector('.bug')).toBeNull();
      expect(el.querySelector('.campanha')).toBeNull();
    });

    it('patrocinadores revezam a cada 8 s', async () => {
      const el = await show(TARJA, {
        sponsors: [
          { nome: 'Arena Sol', logo: '' },
          { nome: 'Coco Bom', logo: '' },
        ],
      });
      expect(text(el, '.logo.atual')).toBe('Arena Sol');
      jasmine.clock().tick(8_000);
      await fixture.whenStable();
      expect(text(el, '.logo.atual')).toBe('Coco Bom');
      expect(text(el, '.logo.saindo')).toBe('Arena Sol');
      jasmine.clock().tick(700);
      await fixture.whenStable();
      expect(el.querySelector('.logo.saindo')).toBeNull();
    });
  });
});
