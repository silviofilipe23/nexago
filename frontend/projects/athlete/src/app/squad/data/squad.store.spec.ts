import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/auth.service';
import { ambassadorView, candidateView } from '../../../testing/squad-fixtures';
import { SQUAD_API, type SquadApi } from './squad-api';
import type { SquadAthleteView } from './squad-view';
import { SquadStore } from './squad.store';

describe('SquadStore', () => {
  const user = signal<{ uid: string } | null>({ uid: 'joao' });
  let calls: Array<(v: SquadAthleteView) => void>;

  function setup(): SquadStore {
    user.set({ uid: 'joao' });
    calls = [];
    const api: SquadApi = {
      fetchView: () => new Promise<unknown>((resolve) => calls.push(resolve)),
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

  it('trocar de aba não relê; outra conta começa do zero', async () => {
    const store = setup();
    store.ensureLoaded();
    calls[0]!(ambassadorView());
    await Promise.resolve();
    expect(store.ambassador()?.contract.code).toBe('JOAO10');

    store.ensureLoaded();
    expect(calls.length).toBe(1);

    user.set({ uid: 'caio' });
    store.ensureLoaded();
    expect(store.view()).toBeNull();
    expect(calls.length).toBe(2);
    calls[1]!(candidateView());
    await Promise.resolve();
    expect(store.candidate()?.profile?.name).toBe('Caio Teixeira');
  });

  it('a resposta atrasada da conta anterior é descartada', async () => {
    const store = setup();
    store.ensureLoaded();
    user.set({ uid: 'caio' });
    store.ensureLoaded();
    calls[1]!(candidateView());
    await Promise.resolve();
    calls[0]!(ambassadorView());
    await Promise.resolve();
    expect(store.view()?.kind).toBe('candidate');
    expect(store.loading()).toBeFalse();
  });
});
