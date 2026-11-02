import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_BROADCAST_LANCES, type LanceTipo } from '../data/broadcast-lances';
import { PARTIDA } from '../transmissao/transmissao-data.fake';
import type { TelaoTeamDisplay } from './telao-data.service';
import { TelaoLedSoloComponent } from './telao-led-solo.component';

const time = (short: string, nomes: string[]): TelaoTeamDisplay => ({
  label: short,
  short,
  sub: null,
  players: nomes.map(() => ({ initials: '', photoUrl: null })),
  playerNames: nomes,
});

describe('TelaoLedSoloComponent · lances', () => {
  async function mount(tipo: LanceTipo, lado: 0 | 1, atleta: 0 | 1) {
    TestBed.configureTestingModule({ imports: [TelaoLedSoloComponent], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TelaoLedSoloComponent);
    fixture.componentRef.setInput('match', PARTIDA);
    fixture.componentRef.setInput('teamA', time('Ana / Bia', ['Ana Souza', 'Bia Lima']));
    fixture.componentRef.setInput('teamB', time('Carla / Dani', ['Carla Dias', 'Dani Ávila']));
    fixture.componentRef.setInput('lances', {
      lances: { ...DEFAULT_BROADCAST_LANCES, seq: 1, tipo, lado, atleta, at: new Date() },
      transmissaoCourtId: 'q1',
      telaoCourtId: 'q1',
    });
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('Fireball: bola com rastro, chão em fogo, o nome de quem fez e a dupla', async () => {
    const el = await mount('fire', 0, 1);
    const tela = el.querySelector('.og-tls-lance.fire')!;
    expect(tela.querySelector('.og-tls-lance-bola .bola')).not.toBeNull();
    expect(tela.querySelector('.og-tls-lance-calor')).not.toBeNull();
    expect(tela.querySelector('.og-tls-lance-fogo')?.textContent).toBe('Fireball');
    expect(tela.querySelector('.og-tls-lance-nome')?.textContent?.trim()).toBe('Bia Lima');
    expect(tela.querySelector('.og-tls-lance-sub')?.textContent).toContain('Ana / Bia');
  });

  it('Cachorra: trilhas de patas e "{quem levou} levou · Bola de cobertura"', async () => {
    const el = await mount('cachorra', 1, 0);
    const tela = el.querySelector('.og-tls-lance.cachorra')!;
    expect(tela.querySelectorAll('.og-tls-pata').length).toBe(36);
    expect(tela.querySelector('.og-tls-lance-cachorra')?.textContent).toBe('Cachorra!');
    expect(tela.querySelector('.og-tls-lance-nome')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Carla Dias levou');
    expect(tela.querySelector('.og-tls-lance-sub')?.textContent).toContain('Bola de cobertura');
  });
});
