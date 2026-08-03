import { autoSchedulePayload } from './organizer-ops.service';

const BASE = { tournamentId: 't1', dayKey: '2026-10-24' };

describe('autoSchedulePayload', () => {
  it('manda só as quadras selecionadas', () => {
    const payload = autoSchedulePayload({ ...BASE, courtIds: ['Q1', 'Q3'] });
    expect(payload['courtIds']).toEqual(['Q1', 'Q3']);
  });

  it('omite courtIds quando nenhuma quadra foi passada (= todas, como o app)', () => {
    expect('courtIds' in autoSchedulePayload(BASE)).toBeFalse();
    expect('courtIds' in autoSchedulePayload({ ...BASE, courtIds: [] })).toBeFalse();
    expect('courtIds' in autoSchedulePayload({ ...BASE, courtIds: ['  ', ''] })).toBeFalse();
  });

  it('manda a categoria só quando há uma', () => {
    expect(autoSchedulePayload({ ...BASE, categoryId: 'femB' })['categoryId']).toBe('femB');
    expect('categoryId' in autoSchedulePayload({ ...BASE, categoryId: null })).toBeFalse();
    expect('categoryId' in autoSchedulePayload({ ...BASE, categoryId: '  ' })).toBeFalse();
  });

  it('leva hora inicial e switches', () => {
    const payload = autoSchedulePayload({
      ...BASE,
      preview: false,
      dayStart: '08:30',
      avoidAthleteConflict: false,
      respectBracketDeps: false,
    });
    expect(payload['dayStart']).toBe('08:30');
    expect(payload['preview']).toBeFalse();
    expect(payload['avoidAthleteConflict']).toBeFalse();
    expect(payload['respectBracketDeps']).toBeFalse();
  });

  it('assume prévia e as duas travas ligadas por padrão', () => {
    const payload = autoSchedulePayload(BASE);
    expect(payload['preview']).toBeTrue();
    expect(payload['avoidAthleteConflict']).toBeTrue();
    expect(payload['respectBracketDeps']).toBeTrue();
  });
});
