import { promotableLevelOptions } from './athlete-level-promotion';

describe('athlete-level-promotion', () => {
  describe('promotableLevelOptions', () => {
    it('lista só os degraus ACIMA do atual, em ordem crescente', () => {
      const options = promotableLevelOptions('intermediario_1');

      expect(options.map((o) => o.code)).toEqual(['intermediario_2', 'avancado_1', 'avancado_2', 'open']);
    });

    it('aceita label legado (não só o código canônico) — mesmo vocabulário de levelRankOf', () => {
      const options = promotableLevelOptions('Intermediário 2');

      expect(options.map((o) => o.code)).toEqual(['avancado_1', 'avancado_2', 'open']);
    });

    it('vazio quando o atleta já está no topo (Open) — não há pra onde promover', () => {
      expect(promotableLevelOptions('open')).toEqual([]);
    });

    it('vazio quando o atleta não tem nível declarado no esporte — nada pra promover sem ponto de partida', () => {
      expect(promotableLevelOptions(null)).toEqual([]);
      expect(promotableLevelOptions('')).toEqual([]);
    });

    it('vazio pra valor não reconhecido (nem código nem label válido)', () => {
      expect(promotableLevelOptions('lixo-qualquer')).toEqual([]);
    });

    it('do primeiro degrau (Iniciante 1), lista os 6 acima', () => {
      expect(promotableLevelOptions('iniciante_1').map((o) => o.code)).toEqual([
        'iniciante_2',
        'intermediario_1',
        'intermediario_2',
        'avancado_1',
        'avancado_2',
        'open',
      ]);
    });
  });
});
