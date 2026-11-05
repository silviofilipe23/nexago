import {
  formatDuration,
  formatPercent,
  metricCards,
  metricsWindow,
  postResultRows,
  variation,
  type BlogWindowMetrics,
} from './blog-metrics';

const WINDOW: BlogWindowMetrics = {
  reads: 8420,
  prevReads: 7518,
  avgSeconds: 168.4,
  finished: 5136,
  ctaClicks: 412,
  readers: 3106,
  returningReaders: 1180,
};

describe('blog · métricas', () => {
  it('janela: últimos 30 dias e os 30 antes', () => {
    const now = new Date('2026-11-05T15:00:00Z');
    const { start, prevStart } = metricsWindow(now);
    expect(start.toISOString()).toBe('2026-10-06T15:00:00.000Z');
    expect(prevStart.toISOString()).toBe('2026-09-06T15:00:00.000Z');
  });

  it('duração: "2m 48s", segundos sozinhos e horas', () => {
    expect(formatDuration(168.4)).toBe('2m 48s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(60)).toBe('1m 0s');
    expect(formatDuration(3725)).toBe('1h 2m');
    expect(formatDuration(-3)).toBe('0s');
  });

  it('percentual com uma casa só abaixo de 10%', () => {
    expect(formatPercent(0.049)).toBe('4,9%');
    expect(formatPercent(0.05)).toBe('5%');
    expect(formatPercent(0.003)).toBe('0,3%');
    expect(formatPercent(0.3842)).toBe('38%');
    expect(formatPercent(0.0996)).toBe('10%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('variação com seta e texto; sem base = primeiros 30 dias', () => {
    expect(variation(8420, 7518)).toEqual({ text: '▲ 12% vs. 30 dias antes', trend: 'up' });
    expect(variation(90, 100)).toEqual({ text: '▼ 10% vs. 30 dias antes', trend: 'down' });
    expect(variation(103, 100)).toEqual({ text: '▲ 3% vs. 30 dias antes', trend: 'up' });
    expect(variation(1000, 1001)).toEqual({ text: '▼ 0,1% vs. 30 dias antes', trend: 'down' });
    expect(variation(100, 100)).toEqual({ text: '= igual aos 30 dias antes', trend: 'flat' });
    expect(variation(50, 0)).toEqual({ text: 'primeiros 30 dias', trend: null });
  });

  it('os 4 cards com as linhas de baixo da spec', () => {
    expect(metricCards(WINDOW)).toEqual([
      { label: 'Leituras · 30 dias', value: '8.420', note: '▲ 12% vs. 30 dias antes', trend: 'up' },
      { label: 'Leitores únicos', value: '3.106', note: '38% já liam antes', trend: null },
      { label: 'Tempo médio de leitura', value: '2m 48s', note: 'lido até o fim: 61%', trend: null },
      { label: 'Cliques nas chamadas', value: '412', note: '4,9% das leituras', trend: null },
    ]);
  });

  it('sem leitura na janela: "—" e "sem leituras no app ainda"; carregando/erro: só "—"', () => {
    const empty = metricCards({ ...WINDOW, reads: 0, avgSeconds: null, finished: 0, ctaClicks: 0, readers: 0, returningReaders: 0 });
    expect(empty.map((c) => [c.value, c.note])).toEqual(Array(4).fill(['—', 'sem leituras no app ainda']));
    expect(metricCards(null).map((c) => [c.value, c.note])).toEqual(Array(4).fill(['—', '']));
    expect(metricCards({ ...WINDOW, prevReads: 0 })[0]!.note).toBe('primeiros 30 dias');
  });

  it('resultado do post: cliques só com chamada; sem leitura vira traço', () => {
    const rows = postResultRows(
      { reads: 2140, avgSeconds: 151, finished: 1284, ctaClicks: 96 },
      { hasCta: true, helpfulCount: 80, readCount: 1910 },
    );
    expect(rows).toEqual([
      { label: 'Leituras no app', value: '2.140' },
      { label: 'Tempo médio', value: '2m 31s' },
      { label: 'Lido até o fim', value: '60%' },
      { label: 'Cliques na chamada', value: '96 · 4,5%' },
      { label: '“Ajudou”', value: '80' },
      { label: 'Leitores', value: '1.910' },
    ]);
    const none = postResultRows({ reads: 0, avgSeconds: null, finished: 0, ctaClicks: 0 }, { hasCta: false, helpfulCount: 0, readCount: 0 });
    expect(none.map((r) => r.label)).not.toContain('Cliques na chamada');
    expect(none.find((r) => r.label === 'Tempo médio')!.value).toBe('—');
    expect(none.find((r) => r.label === 'Lido até o fim')!.value).toBe('—');
  });
});
