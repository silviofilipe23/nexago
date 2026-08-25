import { watchStaffArenaDocs } from './arena-staff-docs';

/** Fake de `onSnapshot` por doc: guarda o callback de cada arena pra o teste emitir doc/erro
 *  quando quiser, e conta os cancelamentos. */
function fakeSubscriber() {
  const listeners = new Map<string, (data: Record<string, unknown> | null) => void>();
  const unsubscribed: string[] = [];

  return {
    unsubscribed,
    subscribedIds: (): string[] => [...listeners.keys()],
    emit(arenaId: string, data: Record<string, unknown> | null): void {
      listeners.get(arenaId)?.(data);
    },
    subscribe(arenaId: string, onDoc: (data: Record<string, unknown> | null) => void) {
      listeners.set(arenaId, onDoc);
      return () => {
        listeners.delete(arenaId);
        unsubscribed.push(arenaId);
      };
    },
  };
}

function collector() {
  const calls: { docs: Map<string, Record<string, unknown>>; settled: boolean }[] = [];
  return {
    calls,
    last: () => calls[calls.length - 1]!,
    listener: (docs: Map<string, Record<string, unknown>>, settled: boolean) => calls.push({ docs, settled }),
  };
}

describe('watchStaffArenaDocs', () => {
  it('assina cada arena e reporta os docs conforme chegam', () => {
    const fake = fakeSubscriber();
    const out = collector();
    const watcher = watchStaffArenaDocs(fake.subscribe, out.listener);

    watcher.sync(['a1', 'a2']);
    expect(fake.subscribedIds()).toEqual(['a1', 'a2']);

    fake.emit('a1', { name: 'Arena a1' });
    fake.emit('a2', { name: 'Arena a2' });

    expect(out.last().docs.get('a1')).toEqual({ name: 'Arena a1' });
    expect(out.last().docs.get('a2')).toEqual({ name: 'Arena a2' });
  });

  it('só fica `settled` quando todas as arenas já reportaram', () => {
    const fake = fakeSubscriber();
    const out = collector();
    watchStaffArenaDocs(fake.subscribe, out.listener).sync(['a1', 'a2']);

    expect(out.last().settled).toBe(false);

    fake.emit('a1', { name: 'Arena a1' });
    expect(out.last().settled).toBe(false);

    fake.emit('a2', { name: 'Arena a2' });
    expect(out.last().settled).toBe(true);
  });

  it('não fica `settled` na resposta imediata de uma arena com as outras pendentes', () => {
    // Firestore pode responder do cache dentro do próprio `subscribe` — se o pendente fosse
    // marcado arena a arena, a primeira resposta síncrona zeraria a fila e liberaria o guard.
    const out = collector();
    const watcher = watchStaffArenaDocs((arenaId, onDoc) => {
      if (arenaId === 'a1') onDoc({ name: 'do cache' });
      return () => undefined;
    }, out.listener);

    watcher.sync(['a1', 'a2']);

    expect(out.calls.every((c) => !c.settled)).toBe(true);
  });

  it('mantém as outras arenas quando uma falha (erro reporta doc nulo)', () => {
    const fake = fakeSubscriber();
    const out = collector();
    watchStaffArenaDocs(fake.subscribe, out.listener).sync(['a1', 'a2']);

    fake.emit('a1', { name: 'Arena a1' });
    fake.emit('a2', null);

    expect(out.last().docs.size).toBe(1);
    expect(out.last().docs.has('a1')).toBe(true);
    expect(out.last().settled).toBe(true);
  });

  it('reflete atualização ao vivo do mesmo doc — é o ponto de ser listener', () => {
    const fake = fakeSubscriber();
    const out = collector();
    watchStaffArenaDocs(fake.subscribe, out.listener).sync(['a1']);

    fake.emit('a1', { name: 'Antes' });
    fake.emit('a1', { name: 'Depois' });

    expect(out.last().docs.get('a1')).toEqual({ name: 'Depois' });
  });

  it('sync só assina o que entrou e cancela o que saiu', () => {
    const fake = fakeSubscriber();
    const out = collector();
    const watcher = watchStaffArenaDocs(fake.subscribe, out.listener);

    watcher.sync(['a1', 'a2']);
    fake.emit('a1', { name: 'Arena a1' });
    fake.emit('a2', { name: 'Arena a2' });

    watcher.sync(['a2', 'a3']);

    expect(fake.unsubscribed).toEqual(['a1']);
    expect(fake.subscribedIds()).toEqual(['a2', 'a3']);
    expect(out.last().docs.has('a1')).toBe(false);
    expect(out.last().docs.get('a2')).toEqual({ name: 'Arena a2' });
  });

  it('não reassina arena que continua na lista', () => {
    const fake = fakeSubscriber();
    const subscribe = jasmine.createSpy('subscribe').and.callFake(fake.subscribe);
    const watcher = watchStaffArenaDocs(subscribe, collector().listener);

    watcher.sync(['a1']);
    watcher.sync(['a1']);

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('lista vazia não assina nada e já reporta resolvido', () => {
    const subscribe = jasmine.createSpy('subscribe');
    const out = collector();

    watchStaffArenaDocs(subscribe, out.listener).sync([]);

    expect(subscribe).not.toHaveBeenCalled();
    expect(out.last().docs.size).toBe(0);
    expect(out.last().settled).toBe(true);
  });

  it('stop cancela tudo e esvazia o mapa — troca de conta não pode herdar arena', () => {
    const fake = fakeSubscriber();
    const out = collector();
    const watcher = watchStaffArenaDocs(fake.subscribe, out.listener);

    watcher.sync(['a1', 'a2']);
    fake.emit('a1', { name: 'Arena a1' });

    watcher.stop();

    expect(fake.unsubscribed.sort()).toEqual(['a1', 'a2']);
    expect(out.last().docs.size).toBe(0);
  });
});
