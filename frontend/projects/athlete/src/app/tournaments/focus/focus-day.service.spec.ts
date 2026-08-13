import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/auth.service';
import { type FocusDayTarget } from './focus-day';
import { FocusDayService } from './focus-day.service';

/** 14:00 em São Paulo (UTC-3) no dia 29/08/2026 — mesma referência de `focus-day.spec.ts`. */
const TODAY = new Date('2026-08-29T17:00:00Z');
const TARGET: FocusDayTarget = { tournamentId: 't1', matchId: 'm1' };

/** Só o que `FocusDayService` de fato lê de `AuthService`. */
type FakeUser = { uid: string } | null;

function setup(): { service: FocusDayService; userSignal: WritableSignal<FakeUser> } {
  const userSignal = signal<FakeUser>(null);
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { user: userSignal } },
    ],
  });
  return { service: TestBed.inject(FocusDayService), userSignal };
}

/** Troca a leitura real do Firestore (`load`, privado) por um dublê — o que estes testes
 *  cobrem é a orquestração de `resolve()` (a marca de "já oferecido"), não a leitura em si, que
 *  já é exercitada por `focus-day.spec.ts` via `focusDayTargetOf`. */
function stubLoad(service: FocusDayService, result: FocusDayTarget | null): jasmine.Spy {
  const withLoad = service as unknown as {
    load(uid: string | null, now: Date): Promise<FocusDayTarget | null>;
  };
  return spyOn(withLoad, 'load').and.resolveTo(result);
}

describe('FocusDayService.resolve', () => {
  // A marca de "já oferecido" em memória é a ÚNICA trava desde que o silêncio até o dia seguinte
  // saiu: `router.navigate()` empilha uma entrada de histórico, então voltar (ou sair pelo "×",
  // que devolve o atleta ao painel) remonta o painel e chamaria `resolve()` de novo. Sem ela, o
  // mesmo alvo seria reoferecido e o atleta ficaria preso no Focus.
  it('resolve() duas vezes no mesmo dia: alvo na primeira, null na segunda — sem reler', async () => {
    const { service, userSignal } = setup();
    userSignal.set({ uid: 'userA' });
    const load = stubLoad(service, TARGET);

    expect(await service.resolve(TODAY)).toEqual(TARGET);
    expect(await service.resolve(TODAY)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  // O silêncio "até amanhã" (`dismissForToday`, que gravava em `localStorage`) foi REMOVIDO: no
  // dia de jogo o Focus abre sempre. Uma sessão nova — recarregar a página é o gesto real — tem
  // `offeredKey` zerado e volta a oferecer, mesmo que o atleta já tenha saído do Focus antes.
  it('sessão nova no mesmo dia volta a oferecer o Focus', async () => {
    const primeira = setup();
    primeira.userSignal.set({ uid: 'userA' });
    stubLoad(primeira.service, TARGET);
    expect(await primeira.service.resolve(TODAY)).toEqual(TARGET);
    expect(await primeira.service.resolve(TODAY)).toBeNull();

    // Um reload é uma instância nova do serviço, com a memória zerada.
    TestBed.resetTestingModule();
    const recarregada = setup();
    recarregada.userSignal.set({ uid: 'userA' });
    stubLoad(recarregada.service, TARGET);

    expect(await recarregada.service.resolve(TODAY)).toEqual(TARGET);
  });

  // O signal `target` é o caminho manual de volta do painel ("Entrar no Focus") depois que o
  // atleta sai — ele não pode sumir quando a entrada automática já foi consumida no dia.
  it('a segunda chamada devolve null mas mantém `target` — é o botão manual do painel', async () => {
    const { service, userSignal } = setup();
    userSignal.set({ uid: 'userA' });
    stubLoad(service, TARGET);

    expect(await service.resolve(TODAY)).toEqual(TARGET);
    expect(await service.resolve(TODAY)).toBeNull();

    expect(service.target()).toEqual(TARGET);
  });

  // Mesmo dispositivo, troca de conta na mesma sessão (mesma instância do serviço): a marca de
  // "já oferecido" do atleta A não pode silenciar a oferta do atleta B no mesmo dia.
  it('outro atleta no mesmo dispositivo/dia: a marca de quem já foi oferecido não silencia o outro', async () => {
    const { service, userSignal } = setup();
    userSignal.set({ uid: 'userA' });
    const load = stubLoad(service, TARGET);
    expect(await service.resolve(TODAY)).toEqual(TARGET);

    userSignal.set({ uid: 'userB' });
    expect(await service.resolve(TODAY)).toEqual(TARGET);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('leitura do Firestore falha: degrada para null em vez de lançar', async () => {
    const { service, userSignal } = setup();
    userSignal.set({ uid: 'userA' });
    // Sem stub de `load`: exercita o try/catch real. Um `db` inválido faz o SDK do Firestore
    // lançar dentro da leitura, sem precisar de rede de verdade.
    (service as unknown as { db: unknown }).db = {};

    await expectAsync(service.resolve(TODAY)).toBeResolvedTo(null);
  });
});
