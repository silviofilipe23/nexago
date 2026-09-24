import { ledPanelHref } from './led-link';

describe('ledPanelHref', () => {
  it('monta o link do painel da quadra', () => {
    expect(ledPanelHref('t1', 'q2')).toBe('/led/t1/quadra/q2');
  });

  it('escapa id com caractere de URL', () => {
    expect(ledPanelHref('t 1', 'q/2')).toBe('/led/t%201/quadra/q%2F2');
  });

  it('não monta link sem quadra — a partida pode ainda não ter sido agendada', () => {
    expect(ledPanelHref('t1', '')).toBe('');
    expect(ledPanelHref('t1', '   ')).toBe('');
  });

  it('não monta link sem torneio', () => {
    expect(ledPanelHref('', 'q2')).toBe('');
  });
});
