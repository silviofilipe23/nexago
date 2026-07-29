import { levelBucketOf, levelRankOf } from './public-profiles-repository';

describe('levelRankOf (vocabulário canônico via @nexago/levels)', () => {
  it('rankeia os 5 códigos canônicos (ranks 0,1,2,3,5 — rank 4 sem uso)', () => {
    expect(levelRankOf('iniciante_1')).toBe(0);
    expect(levelRankOf('iniciante_2')).toBe(1);
    expect(levelRankOf('intermediario_1')).toBe(2);
    expect(levelRankOf('intermediario_2')).toBe(3);
    expect(levelRankOf('open')).toBe(5);
  });

  it('aceita labels e legados (degrau inferior do split)', () => {
    expect(levelRankOf('Intermediário 2')).toBe(3);
    expect(levelRankOf('iniciante')).toBe(0);
    expect(levelRankOf('basico')).toBe(0);
    expect(levelRankOf('intermediario')).toBe(2);
    expect(levelRankOf('livre')).toBe(5);
    expect(levelRankOf('xpto')).toBeNull();
    expect(levelRankOf(null)).toBeNull();
  });
});

describe('levelBucketOf', () => {
  // Regressão do bug de thresholds `<=`: com ranks 0,1,2,3,5, os níveis do
  // meio eram deslocados um degrau pra baixo (intermediario_1 → "Iniciante 2").
  it('mapeia cada rank EXATAMENTE pro seu label', () => {
    expect(levelBucketOf('iniciante_1')).toBe('Iniciante 1');
    expect(levelBucketOf('iniciante_2')).toBe('Iniciante 2');
    expect(levelBucketOf('intermediario_1')).toBe('Intermediário 1');
    expect(levelBucketOf('intermediario_2')).toBe('Intermediário 2');
    expect(levelBucketOf('open')).toBe('Open');
  });

  it('legados caem no label do degrau inferior do split', () => {
    expect(levelBucketOf('iniciante')).toBe('Iniciante 1');
    expect(levelBucketOf('intermediario')).toBe('Intermediário 1');
    expect(levelBucketOf('livre')).toBe('Open');
    expect(levelBucketOf(null)).toBeNull();
  });
});
