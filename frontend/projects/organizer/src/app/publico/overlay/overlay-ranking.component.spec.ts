import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RankingAthlete, RankingCard } from '../../painel/data/broadcast-ranking';
import { OverlayRankingComponent } from './overlay-ranking.component';

const ath = (id: string, pos: number): RankingAthlete => ({
  id,
  name: id.toUpperCase(),
  photo: null,
  names: [],
  photos: [],
  sub: null,
  posBefore: pos,
  posAfter: pos,
  ptsBefore: 100,
  ptsAfter: 120,
  gain: 20,
});

const card: RankingCard = {
  kind: 'atleta',
  key: 'k',
  categoryLabel: 'MASCULINO',
  stageName: 'Etapa',
  updated: true,
  before: [ath('a', 1)],
  after: [ath('a', 1)],
  leader: { name: 'A', photo: null, photos: [], points: 120, keeps: true },
  climber: null,
  topGain: null,
};

describe('OverlayRankingComponent', () => {
  it('sem foto: iniciais no avatar (atleta e cada atleta da dupla)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(OverlayRankingComponent);
    const dupla: RankingAthlete = { ...ath('t1', 1), name: 'Berger / Hölting Nilsson', names: ['Berger', 'Hölting Nilsson'], photos: [null, null] };
    fixture.componentRef.setInput('card', { ...card, kind: 'dupla', before: [dupla], after: [dupla] });
    await fixture.whenStable();
    const ini = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.row .foto span')).map((e) => e.textContent?.trim());
    expect(ini).toEqual(['BE', 'HN']);
  });

  it('dupla: duas fotos por linha, nomes unidos e rótulos no plural', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(OverlayRankingComponent);
    const dupla: RankingAthlete = { ...ath('t1', 1), name: 'Berger / Hölting Nilsson', names: ['Berger', 'Hölting Nilsson'], photos: ['http://x/1.jpg', null], gain: null };
    fixture.componentRef.setInput('card', {
      ...card,
      kind: 'dupla',
      before: [dupla],
      after: [dupla],
      leader: { name: dupla.name, photo: null, photos: ['http://x/1.jpg', null], points: 120, keeps: false },
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.row .foto').length).toBe(2);
    expect(el.querySelector('.row .nome')?.textContent).toContain('Berger / Hölting Nilsson');
    expect(el.querySelector('.top')?.textContent).toContain('Duplas');
    expect(el.querySelector('.card--lider .k')?.textContent).toContain('Dupla líder');
    expect(el.querySelectorAll('.card--lider .foto').length).toBe(2);
  });


  it('mostra o Oferecimento com os patrocinadores (até 3)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(OverlayRankingComponent);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('sponsors', [
      { nome: 'S1', logo: '' },
      { nome: 'S2', logo: 'http://x/2.png' },
      { nome: 'S3', logo: '' },
      { nome: 'S4', logo: '' },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.patro')).not.toBeNull();
    expect(el.querySelectorAll('.patro .logo').length).toBe(3);
  });

  it('sem patrocinadores a faixa não existe', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(OverlayRankingComponent);
    fixture.componentRef.setInput('card', card);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.patro')).toBeNull();
  });

  it('GEOMETRIA: o Oferecimento cabe dentro do canvas 1920×1080 e não fica sob outro bloco', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(OverlayRankingComponent);
    const host = fixture.nativeElement as HTMLElement;
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px';
    document.body.appendChild(stage);
    stage.appendChild(host);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('sponsors', [{ nome: 'S1', logo: '' }]);
    await fixture.whenStable();
    const patro = host.querySelector('.patro') as HTMLElement;
    const r = patro.getBoundingClientRect();
    const cards = (host.querySelector('.cards') as HTMLElement).getBoundingClientRect();
    console.log('PATRO', JSON.stringify(r), 'CARDS', JSON.stringify(cards), getComputedStyle(patro).opacity, getComputedStyle(patro).display);
    expect(r.bottom).toBeLessThanOrEqual(1080);
    expect(r.top).toBeGreaterThan(cards.bottom);
    stage.remove();
  });
});
