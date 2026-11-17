import type { AthleteProfileSummary } from '../bookings/bookings-repository';
import { RecurringAthleteProfiles } from './recurring-athlete-profiles';

const ANA: AthleteProfileSummary = { name: 'Ana Souza', photoUrl: 'https://foto/ana.jpg' };
const BETO: AthleteProfileSummary = { name: 'Beto Lima', photoUrl: null };

function fakeResolver(profiles: Record<string, AthleteProfileSummary>) {
  const calls: string[] = [];
  const resolve = async (id: string): Promise<AthleteProfileSummary> => {
    calls.push(id);
    const profile = profiles[id];
    if (!profile) throw new Error('offline');
    return profile;
  };
  return { calls, resolve };
}

describe('RecurringAthleteProfiles — nome e foto do atleta do horário fixo', () => {
  it('resolve nome e foto de quem está vinculado à série', async () => {
    const { resolve } = fakeResolver({ ana: ANA });
    const profiles = new RecurringAthleteProfiles(resolve);

    await profiles.load([{ athleteId: 'ana', customerName: null }]);

    expect(profiles.names().get('ana')).toBe('Ana Souza');
    expect(profiles.photoOf('ana')).toBe('https://foto/ana.jpg');
  });

  it('série avulsa (sem atleta) não dispara leitura', async () => {
    const { resolve, calls } = fakeResolver({});
    const profiles = new RecurringAthleteProfiles(resolve);

    await profiles.load([{ athleteId: null, customerName: 'João' }]);

    expect(calls).toEqual([]);
    expect(profiles.photoOf(null)).toBeNull();
  });

  it('lê cada atleta uma vez só, mesmo repetido e em snapshots seguidos', async () => {
    const { resolve, calls } = fakeResolver({ ana: ANA, beto: BETO });
    const profiles = new RecurringAthleteProfiles(resolve);
    const list = [
      { athleteId: 'ana', customerName: null },
      { athleteId: 'ana', customerName: null },
      { athleteId: 'beto', customerName: null },
    ];

    await Promise.all([profiles.load(list), profiles.load(list)]);
    await profiles.load(list);

    expect(calls.sort()).toEqual(['ana', 'beto']);
  });

  it('turma de professor (com customerName) também ganha a foto', async () => {
    const { resolve } = fakeResolver({ ana: ANA });
    const profiles = new RecurringAthleteProfiles(resolve);

    await profiles.load([{ athleteId: 'ana', customerName: 'Professor · Turma' }]);

    expect(profiles.photoOf('ana')).toBe('https://foto/ana.jpg');
  });

  it('falha numa leitura não derruba as outras e tenta de novo no próximo snapshot', async () => {
    const source: Record<string, AthleteProfileSummary> = { ana: ANA };
    const { resolve, calls } = fakeResolver(source);
    const profiles = new RecurringAthleteProfiles(resolve);
    const list = [
      { athleteId: 'ana', customerName: null },
      { athleteId: 'beto', customerName: null },
    ];

    await profiles.load(list);
    expect(profiles.names().get('ana')).toBe('Ana Souza');
    expect(profiles.names().has('beto')).toBeFalse();

    source['beto'] = BETO;
    await profiles.load(list);
    expect(profiles.names().get('beto')).toBe('Beto Lima');
    expect(calls.filter((id) => id === 'beto').length).toBe(2);
  });
});
