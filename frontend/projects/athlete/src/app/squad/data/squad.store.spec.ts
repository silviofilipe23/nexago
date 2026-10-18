import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/auth.service';
import { ambassadorView, callableResponses, candidateView } from '../../../testing/squad-fixtures';
import { SQUAD_API, type SquadApi } from './squad-api';
import type { SquadAthleteView } from './squad-view';
import { SquadStore } from './squad.store';

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('SquadStore', () => {
  const user = signal<{ uid: string } | null>({ uid: 'joao' });
  /** Uma leitura por item; as três callables da mesma leitura respondem juntas. */
  let loads: Array<(v: SquadAthleteView) => void>;

  function setup(): SquadStore {
    user.set({ uid: 'joao' });
    loads = [];
    let current: Promise<SquadAthleteView> = Promise.resolve(candidateView());
    const api: SquadApi = {
      fetchMySquad: () => {
        current = new Promise<SquadAthleteView>((resolve) => loads.push(resolve));
        return current.then((v) => callableResponses(v).mySquad);
      },
      fetchPortalInfo: () => current.then((v) => callableResponses(v).portal),
      fetchRanking: () =>
        current.then((v) => {
          const r = callableResponses(v).ranking;
          if (!r) throw Object.assign(new Error('permission'), { code: 'functions/permission-denied' });
          return r;
        }),
      submitApplication: async () => {},
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        SquadStore,
        { provide: AuthService, useValue: { user } },
        { provide: SQUAD_API, useValue: api },
      ],
    });
    return TestBed.inject(SquadStore);
  }

  it('junta as três leituras; trocar de aba não relê; outra conta começa do zero', async () => {
    const store = setup();
    store.ensureLoaded();
    loads[0]!(ambassadorView());
    await flush();
    expect(store.ambassador()?.member.code).toBe('JOAO10');
    expect(store.ambassador()?.ranking?.entries.length).toBe(3);
    expect(store.ambassador()?.extras.signups).toBe(74);

    store.ensureLoaded();
    expect(loads.length).toBe(1);

    user.set({ uid: 'caio' });
    store.ensureLoaded();
    expect(store.view()).toBeNull();
    expect(loads.length).toBe(2);
    // Candidato: o ranking recusa (permission-denied) e isso não vira erro de tela.
    loads[1]!(candidateView());
    await flush();
    expect(store.candidate()?.join.profile?.name).toBe('Caio Teixeira');
    expect(store.error()).toBeNull();
  });

  it('a resposta atrasada da conta anterior é descartada', async () => {
    const store = setup();
    store.ensureLoaded();
    user.set({ uid: 'caio' });
    store.ensureLoaded();
    loads[1]!(candidateView());
    await flush();
    loads[0]!(ambassadorView());
    await flush();
    expect(store.view()?.kind).toBe('candidate');
    expect(store.loading()).toBeFalse();
  });
});
