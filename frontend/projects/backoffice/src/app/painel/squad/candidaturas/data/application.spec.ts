import {
  applicationFromDoc,
  byColumn,
  cardFacts,
  cardNote,
  compactCount,
  highlight,
  inviteFromDoc,
  isHot,
  matchesApplication,
} from './application';

const NOW = new Date('2026-10-17T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function app(over: Record<string, unknown> = {}) {
  return applicationFromDoc('a1', {
    athleteId: 'u1',
    athleteName: 'Felipe Cardoso',
    stage: 'new',
    suggestedTier: 'cap',
    suggestedBy: 'auto',
    answers: { instagram: 'felipe.bt', city: 'Goiânia', leadsGroup: '10to30', why: 'Treino 3 turmas.' },
    snapshot: { city: 'Goiânia', arenaName: 'Arena CFC', tournaments: 18, referredCount: 22, elo: 'Competidor II', rankingPosition: 3 },
    notes: [],
    ...over,
  });
}

describe('tela 04 · candidaturas', () => {
  it('fatos do card seguem a sugestão', () => {
    expect(cardFacts(app(), null, null)).toEqual([
      { label: 'Indicou', value: '22 atletas' },
      { label: 'Torneios', value: '18' },
    ]);
    expect(cardFacts(app({ suggestedTier: 'pro', social: { followers: 61_000 } }), null, null)).toEqual([
      { label: 'Ranking', value: '#3' },
      { label: 'Seguidores', value: '61 mil' },
    ]);
    expect(cardFacts(app({ suggestedTier: 'ath' }), null, null)).toEqual([
      { label: 'Torneios', value: '18' },
      { label: 'Elo', value: 'Competidor II' },
    ]);
  });

  it('sem fonte mostra "—", nunca número inventado', () => {
    const a = app({ suggestedTier: 'amb', snapshot: {} });
    expect(cardFacts(a, null, null)).toEqual([
      { label: 'Torneios', value: '—' },
      { label: 'Seguidores', value: '—' },
    ]);
  });

  it('contrato enviado mostra período e comissão do convite', () => {
    const invite = inviteFromDoc('i1', { tier: 'amb', periodStart: '2026-10-17', periodEnd: '2027-01-15', status: 'opened' });
    expect(cardFacts(app({ stage: 'contract', suggestedTier: 'amb' }), invite, 10)).toEqual([
      { label: 'Período', value: '90 dias' },
      { label: 'Comissão', value: '10%' },
    ]);
  });

  it('nota automática do convite; senão a última nota do time', () => {
    const invite = inviteFromDoc('i1', { status: 'sent', sentAt: new Date(NOW.getTime() - 3 * DAY) });
    expect(cardNote(app({ stage: 'invited' }), invite, NOW)).toBe('Convite enviado há 3 dias · ainda não abriu');
    expect(cardNote(app({ notes: [{ text: 'Checar conduta', by: { name: 'Lia' } }] }), null, NOW)).toBe('Checar conduta');
  });

  it('borda hot: Captain com ≥ 20 indicados', () => {
    expect(isHot(app())).toBeTrue();
    expect(isHot(app({ snapshot: { referredCount: 19 } }))).toBeFalse();
  });

  it('busca por nome, @ ou cidade, com destaque sem acento', () => {
    expect(matchesApplication(app(), '@felipe.bt')).toBeTrue();
    expect(matchesApplication(app(), 'goiania')).toBeTrue();
    expect(matchesApplication(app(), 'brasília')).toBeFalse();
    expect(highlight('Goiânia · Arena CFC', 'goia')).toEqual([
      { text: 'Goiâ', hit: true },
      { text: 'nia · Arena CFC', hit: false },
    ]);
  });

  it('colunas ignoram arquivadas', () => {
    const cols = byColumn([app(), app({ stage: 'review' }), app({ stage: 'archived', archivedReason: 'waitlist' })]);
    expect(cols.new.length).toBe(1);
    expect(cols.review.length).toBe(1);
    expect(cols.invited.length + cols.contract.length).toBe(0);
  });

  it('formata contagem compacta', () => {
    expect(compactCount(61_000)).toBe('61 mil');
    expect(compactCount(8_500)).toBe('8,5 mil');
    expect(compactCount(null)).toBe('—');
  });
});
