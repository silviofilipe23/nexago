import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { OrganizerPublicProfileSource } from '../data/organizer-public-profile-repository';
import {
  organizerEventFromDoc,
  organizerPublicProfileFromDoc,
  type OrganizerEvent,
  type OrganizerPublicProfile,
} from '../data/organizer-public-profiles';
import { NxToastService } from '../shared/feedback';
import { OrganizerProfileStore } from './organizer-profile.store';

function ts(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

function event(id: string, over: Record<string, unknown> = {}): OrganizerEvent {
  return organizerEventFromDoc(id, {
    name: id,
    listingStatus: 'open',
    startAt: ts('2099-01-10T03:00:00Z'),
    categories: [{ id: 'c1', maxTeams: 16, entryFee: 100 }],
    ...over,
  })!;
}

function completed(id: string, ymd: string, champion: string): OrganizerEvent {
  return event(id, { listingStatus: 'completed', startAt: ts(`${ymd}T03:00:00Z`), categoryOps: { c1: { championTeamId: champion } } });
}

const PROFILE = organizerPublicProfileFromDoc('org-1', { name: 'Liga Amadora', isOrganizer: true, followersCount: 10 });

function fakeSource(over: Partial<Record<keyof OrganizerPublicProfileSource, unknown>> = {}) {
  const calls = { enrolled: [] as string[][], teams: [] as string[][], follow: [] as [string, string, boolean][] };
  const source = {
    fetchProfile: () => Promise.resolve<OrganizerPublicProfile | null>(PROFILE),
    fetchEvents: () => Promise.resolve<OrganizerEvent[]>([]),
    fetchReputation: () => Promise.resolve(null),
    fetchReviewSummaries: () => Promise.resolve([]),
    fetchEnrolledCounts: (ids: readonly string[]) => {
      calls.enrolled.push([...ids]);
      return Promise.resolve(new Map(ids.map((id) => [id, 7])));
    },
    fetchTeamNames: (ids: readonly string[]) => {
      calls.teams.push([...ids]);
      return Promise.resolve(new Map(ids.map((id) => [id, `Nome ${id}`])));
    },
    isFollowing: () => Promise.resolve(false),
    setFollowing: (viewer: string, organizer: string, follow: boolean) => {
      calls.follow.push([viewer, organizer, follow]);
      return Promise.resolve();
    },
    ...over,
  };
  return { source, calls };
}

describe('OrganizerProfileStore', () => {
  let toasts: jasmine.SpyObj<NxToastService>;

  function setup(source: unknown, uid: string | null = 'me'): OrganizerProfileStore {
    toasts = jasmine.createSpyObj<NxToastService>('NxToastService', ['success', 'error']);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        OrganizerProfileStore,
        { provide: OrganizerPublicProfileSource, useValue: source },
        { provide: AuthService, useValue: { user: signal(uid ? { uid } : null) } },
        { provide: NxToastService, useValue: toasts },
      ],
    });
    return TestBed.inject(OrganizerProfileStore);
  }

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

  afterEach(() => TestBed.resetTestingModule());

  it('sem doc: não encontrado', async () => {
    const store = setup(fakeSource({ fetchProfile: () => Promise.resolve(null) }).source);
    await store.load('org-1');
    expect(store.status()).toBe('not-found');
  });

  it('doc sem identidade (só números ou só o contador) também é não encontrado', async () => {
    const statsOnly = organizerPublicProfileFromDoc('org-1', { uid: 'org-1', stats: { listedEvents: 3 }, listed: false });
    const store = setup(fakeSource({ fetchProfile: () => Promise.resolve(statsOnly) }).source);
    await store.load('org-1');
    expect(store.status()).toBe('not-found');
  });

  it('erro de rede: estado de erro com a mensagem real, e "Tentar de novo" recarrega', async () => {
    let fail = true;
    const store = setup(
      fakeSource({
        fetchProfile: () => (fail ? Promise.reject(new Error('Firebase: Missing or insufficient permissions.')) : Promise.resolve(PROFILE)),
      }).source,
    );
    await store.load('org-1');
    expect(store.status()).toBe('error');
    expect(store.errorDetail()).toBe('Missing or insufficient permissions.');
    fail = false;
    await store.retry();
    expect(store.status()).toBe('ready');
  });

  it('reputação que falha não derruba a página', async () => {
    const store = setup(fakeSource({ fetchReputation: () => Promise.reject(new Error('x')) }).source);
    await store.load('org-1');
    expect(store.status()).toBe('ready');
    expect(store.reputation()).toBeNull();
  });

  it('carrega já os detalhes dos próximos e dos 3 últimos realizados; o resto sob demanda e sem repetir', async () => {
    const events = [
      event('next'),
      completed('d1', '2026-01-10', 'tA'),
      completed('d2', '2026-02-10', 'tB'),
      completed('d3', '2026-03-10', 'tC'),
      completed('d4', '2026-04-10', 'tD'),
    ];
    const { source, calls } = fakeSource({ fetchEvents: () => Promise.resolve(events) });
    const store = setup(source);
    await store.load('org-1');
    await flush();
    expect(calls.enrolled).toEqual([['next', 'd4', 'd3', 'd2']]);
    expect(calls.teams).toEqual([['tD', 'tC', 'tB']]);
    expect(store.enrolled().get('d4')).toBe(7);
    expect(store.teamNames().get('tD')).toBe('Nome tD');

    await store.ensureAllDetails();
    expect(calls.enrolled[1]).toEqual(['d1']);
    expect(calls.teams[1]).toEqual(['tA']);
    await store.ensureAllDetails();
    expect(calls.enrolled.length).toBe(2);
  });

  it('seguir: otimista, grava e soma 1 no contador', async () => {
    const { source, calls } = fakeSource();
    const store = setup(source);
    await store.load('org-1');
    TestBed.tick();
    await flush();
    expect(store.canFollow()).toBeTrue();
    await store.toggleFollow();
    expect(calls.follow).toEqual([['me', 'org-1', true]]);
    expect(store.following()).toBeTrue();
    expect(store.followersCount()).toBe(11);
    expect(toasts.success).toHaveBeenCalled();
  });

  it('seguir que falha desfaz e avisa', async () => {
    const store = setup(fakeSource({ setFollowing: () => Promise.reject(new Error('denied')) }).source);
    await store.load('org-1');
    TestBed.tick();
    await flush();
    await store.toggleFollow();
    expect(store.following()).toBeFalse();
    expect(store.followersCount()).toBe(10);
    expect(toasts.error).toHaveBeenCalledWith('Não foi possível seguir', jasmine.any(String));
  });

  it('lê se já sigo e deixar de seguir apaga', async () => {
    const { source, calls } = fakeSource({ isFollowing: () => Promise.resolve(true) });
    const store = setup(source);
    await store.load('org-1');
    TestBed.tick();
    await flush();
    expect(store.following()).toBeTrue();
    await store.toggleFollow();
    expect(calls.follow).toEqual([['me', 'org-1', false]]);
    expect(store.followersCount()).toBe(9);
  });

  it('no próprio perfil e sem sessão não dá pra seguir', async () => {
    const self = setup(fakeSource().source, 'org-1');
    await self.load('org-1');
    expect(self.isSelf()).toBeTrue();
    expect(self.canFollow()).toBeFalse();
    TestBed.resetTestingModule();

    const anon = setup(fakeSource().source, null);
    await anon.load('org-1');
    expect(anon.canFollow()).toBeFalse();
  });
});
