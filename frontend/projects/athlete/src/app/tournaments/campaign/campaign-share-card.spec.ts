import { CAMPAIGN_ROWS_COMFORT, CAMPAIGN_ROWS_MAX } from './campaign-share';
import { CAMPAIGN_HERO_BOTTOM, CAMPAIGN_PANEL_GAP, campaignPanelLayoutOf } from './campaign-share-card';

/**
 * O painel de trajetória é ancorado no rodapé e cresce PRA CIMA, então cada linha a mais empurra
 * o topo dele em direção às fotos do atleta. Estes testes são o que amarra `CAMPAIGN_ROWS_COMFORT`
 * e `CAMPAIGN_ROWS_MAX` à geometria real do card.
 *
 * Não é teste teórico: a primeira versão desta entrega trazia 7 e 9, e nos dois casos o painel
 * passava por cima das fotos — 7 linhas no passo largo e 9 no apertado. Ninguém veria isso até um
 * atleta com campanha longa gerar a imagem.
 */
describe('campaignPanelLayoutOf', () => {
  it('nunca deixa o painel invadir as fotos, de 1 linha até o teto', () => {
    for (let rows = 1; rows <= CAMPAIGN_ROWS_MAX; rows++) {
      const { top } = campaignPanelLayoutOf(rows);
      expect(top)
        .withContext(`${rows} linhas: topo do painel em ${top}, fotos terminam em ${CAMPAIGN_HERO_BOTTOM}`)
        .toBeGreaterThanOrEqual(CAMPAIGN_HERO_BOTTOM + CAMPAIGN_PANEL_GAP);
    }
  });

  it('usa o passo largo até o limite confortável e aperta depois', () => {
    const comfort = campaignPanelLayoutOf(CAMPAIGN_ROWS_COMFORT).pitch;
    const tight = campaignPanelLayoutOf(CAMPAIGN_ROWS_COMFORT + 1).pitch;
    expect(tight).toBeLessThan(comfort);
  });

  it('cresce pra cima: mais linhas, topo mais alto', () => {
    expect(campaignPanelLayoutOf(6).top).toBeLessThan(campaignPanelLayoutOf(3).top);
  });

  // O teto não pode ser folgado a ponto de sobrar espaço morto: se mais uma linha ainda coubesse,
  // `CAMPAIGN_ROWS_MAX` está cortando campanha à toa.
  it('não desperdiça espaço: uma linha além do teto realmente não cabe', () => {
    expect(campaignPanelLayoutOf(CAMPAIGN_ROWS_MAX + 1).top).toBeLessThan(CAMPAIGN_HERO_BOTTOM + CAMPAIGN_PANEL_GAP);
  });
});
