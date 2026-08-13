import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { TournamentLiveStore } from './tournament-live.store';

/**
 * Fixação do bug do round 1 de review da seção Agora: o reconhecimento da chamada de quadra
 * (`acknowledgeCall`/`acknowledgedCall`) precisa morar no store — que vive no provider de
 * `torneios/:id` e sobrevive à troca de seção dentro do Focus — e não num signal local de
 * `FocusNowComponent`, que é recriado a cada navegação entre `agora`/`trajetória`/`grupo` (rotas
 * irmãs sem `RouteReuseStrategy` customizada). Este spec instancia a classe real via `TestBed`
 * (necessário porque `TournamentLiveStore` é `@Injectable()`, não uma função pura) e prova que o
 * valor sobrevive a uma releitura simulando outra instância da seção lendo o mesmo store — se
 * alguém reverter o reconhecimento para um signal do componente, `store.acknowledgeCall` deixa
 * de existir e este spec quebra na compilação.
 */
describe('TournamentLiveStore — reconhecimento da chamada de quadra', () => {
  function setup(): TournamentLiveStore {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TournamentLiveStore,
        // Só `user` importa: `acknowledgeCall`/`acknowledgedCall` não tocam auth nem Firestore.
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    });
    return TestBed.inject(TournamentLiveStore);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('começa sem nenhuma chamada reconhecida', () => {
    expect(setup().acknowledgedCall).toBeNull();
  });

  it('sobrevive a uma releitura — como a que `FocusNowComponent` faria se fosse recriado pela troca de rota', () => {
    const store = setup();
    store.acknowledgeCall('m1');

    // "Releitura simulada": nenhuma seção guarda esse estado, então uma segunda leitura
    // independente de `acknowledgedCall` (equivalente a uma nova instância da seção Agora lendo
    // o mesmo store injetado por `torneios/:id`) precisa ver o mesmo valor.
    expect(store.acknowledgedCall).toBe('m1');
    expect(store.acknowledgedCall).toBe('m1');
  });

  it('reconhecer uma partida nova substitui o id anterior', () => {
    const store = setup();
    store.acknowledgeCall('m1');
    store.acknowledgeCall('m2');
    expect(store.acknowledgedCall).toBe('m2');
  });
});
