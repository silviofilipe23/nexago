import { LEVEL_CODES } from '@nexago/levels';
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

    // Regra do backend (planOrganizerPromotionDirection, athlete-level-admin.ts): currentRank
    // null não é violação, é "sem degrau anterior pra descer" — organizador pode SEMEAR o 1º
    // nível daquele esporte. É o caso mais comum da calibração inicial (atleta que ainda não
    // preencheu o próprio nível); esconder a ação aqui empurraria de volta pro backoffice.
    it('os 7 degraus inteiros quando o atleta não tem nível declarado no esporte — organizador semeia o 1º', () => {
      expect(promotableLevelOptions(null).map((o) => o.code)).toEqual(LEVEL_CODES);
      expect(promotableLevelOptions(undefined).map((o) => o.code)).toEqual(LEVEL_CODES);
      expect(promotableLevelOptions('').map((o) => o.code)).toEqual(LEVEL_CODES);
    });

    it('os 7 degraus inteiros pra valor não reconhecido (nem código nem label válido) — mesmo caminho de "sem nível"', () => {
      expect(promotableLevelOptions('lixo-qualquer').map((o) => o.code)).toEqual(LEVEL_CODES);
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

    // Aliases legados sem sufixo de degrau (levelRankOf: escada de 3 aliasada pro degrau
    // inferior do split) — cada um tinha o comportamento correto (traçado pelos testes de cima),
    // mas nenhum caso próprio cobria a leitura desses valores crus específicos.
    it('aceita os aliases legados nus (escada de 3, sem sufixo _1/_2)', () => {
      expect(promotableLevelOptions('iniciante').map((o) => o.code)).toEqual([
        'iniciante_2',
        'intermediario_1',
        'intermediario_2',
        'avancado_1',
        'avancado_2',
        'open',
      ]);
      expect(promotableLevelOptions('intermediario').map((o) => o.code)).toEqual(['intermediario_2', 'avancado_1', 'avancado_2', 'open']);
      expect(promotableLevelOptions('livre')).toEqual([]);
      expect(promotableLevelOptions('Open / federado')).toEqual([]);
    });
  });
});
