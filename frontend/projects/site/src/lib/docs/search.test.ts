import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalize, searchDocs } from './search.ts';
import type { SearchDoc } from './types.ts';

function doc(over: Partial<SearchDoc> = {}): SearchDoc {
  return {
    audience: 'atletas',
    audienceLabel: 'Atletas',
    id: 'inscricao-em-torneios',
    title: 'Inscrição — solo, dupla e equipe',
    summary: 'A vaga é reservada assim que você confirma.',
    haystack: normalize('Inscrição solo dupla equipe convite parceiro pagamento pix'),
    ...over,
  };
}

describe('normalize', () => {
  it('remove acentos e baixa a caixa', () => {
    assert.equal(normalize('Inscrição'), 'inscricao');
    assert.equal(normalize('CHAVE — Eliminatória'), 'chave — eliminatoria');
  });
});

describe('searchDocs', () => {
  const index: SearchDoc[] = [
    doc(),
    doc({
      id: 'chaves-e-grupos',
      audience: 'organizadores',
      audienceLabel: 'Organizadores',
      title: 'Chaves e grupos',
      summary: 'Sorteio com cabeças de chave.',
      haystack: normalize('Chaves grupos sorteio cabeça de chave eliminatória inscrição confirmada'),
    }),
  ];

  it('encontra sem acento', () => {
    const results = searchDocs(index, 'inscricao');
    assert.equal(results.length, 2);
  });

  it('pesa o título acima do corpo', () => {
    const results = searchDocs(index, 'chave');
    assert.equal(results[0].id, 'chaves-e-grupos');
  });

  it('exige todos os termos', () => {
    const results = searchDocs(index, 'chave parceiro');
    assert.equal(results.length, 0);
  });

  it('ignora consultas curtas demais', () => {
    assert.equal(searchDocs(index, 'a').length, 0);
    assert.equal(searchDocs(index, '').length, 0);
  });

  it('respeita o limite', () => {
    const many = Array.from({ length: 20 }, (_, i) => doc({ id: `f${i}` }));
    assert.equal(searchDocs(many, 'inscricao', 5).length, 5);
  });
});
