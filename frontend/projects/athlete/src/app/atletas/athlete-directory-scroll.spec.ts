import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AthleteDirectoryComponent } from './athlete-directory.component';
import type { AthleteDirectoryEntry } from './athlete-directory.models';
import { AthleteDirectoryStore } from './athlete-directory.store';

/**
 * Ir a um perfil e voltar destrói e recria `AthleteDirectoryComponent` (as rotas
 * `/atletas` e `/atletas/:handle` são irmãs, sem componente-pai comum). O que o
 * atleta espera é reencontrar a MESMA lista, no MESMO ponto do scroll — e não a
 * primeira página recarregada do zero. Quem sustenta isso é o
 * `AthleteDirectoryStore`, que sobrevive à troca de rota.
 *
 * O seam: `environment.firebase.apiKey` vazio faz `createFirestore()` devolver
 * null, então nenhum teste aqui abre Firestore de verdade — o estado "já
 * carreguei N páginas" é semeado direto no store.
 */
describe('AthleteDirectoryComponent — memória da listagem', () => {
  const firebase = environment.firebase as { apiKey: string };
  /** Filtros default da tela (busca vazia, nível e cidade em "todos"). */
  const DEFAULT_SIGNATURE = AthleteDirectoryStore.signatureOf('', 'all', 'all');
  let realApiKey: string;
  let store: AthleteDirectoryStore;
  let fixture: ComponentFixture<AthleteDirectoryComponent> | undefined;

  function entries(count: number): AthleteDirectoryEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `atleta-${i}`,
      handle: `atleta-${i}`,
      nickname: null,
      fullName: `Atleta ${i}`,
      city: 'Goiânia',
      sport: 'beachTennis' as const,
      level: null,
      rankingPosition: i + 1,
      avatarUrl: null,
    }));
  }

  function fakeAuth() {
    return { user: signal(null), devEmail: signal(null) };
  }

  /** Faz o papel do perfil público na rota irmã — sem tocar Firestore. */
  @Component({ template: '<p>perfil</p>' })
  class StubAthleteProfileComponent {}

  /** Estado de quem já rolou a listagem e está prestes a abrir um perfil. */
  function seedBrowsedList(count: number, scrollTop: number): void {
    store.allAthletes.set(entries(count));
    store.loading.set(false);
    store.markLoaded(DEFAULT_SIGNATURE);
    store.scrollTop = scrollTop;
  }

  /** Monta a tela como o router faz ao entrar em `/atletas`. */
  async function visit(): Promise<ComponentFixture<AthleteDirectoryComponent>> {
    const f = TestBed.createComponent(AthleteDirectoryComponent);
    await f.whenStable();
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  function scrollerOf(f: ComponentFixture<AthleteDirectoryComponent>): HTMLElement {
    const el = (f.nativeElement as HTMLElement).querySelector<HTMLElement>('.at-main');
    if (!el) throw new Error('.at-main não encontrado — o shell mudou de estrutura');
    return el;
  }

  function rowCountOf(f: ComponentFixture<AthleteDirectoryComponent>): number {
    return (f.nativeElement as HTMLElement).querySelectorAll('.ad-row').length;
  }

  beforeEach(async () => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
    await TestBed.configureTestingModule({
      imports: [AthleteDirectoryComponent],
      providers: [
        provideZonelessChangeDetection(),
        // Espelha as rotas reais: `/atletas` e `/atletas/:handle` são irmãs.
        provideRouter([
          { path: 'atletas', component: AthleteDirectoryComponent },
          { path: 'atletas/:handle', component: StubAthleteProfileComponent },
        ]),
        { provide: AuthService, useValue: fakeAuth() },
      ],
    }).compileComponents();
    store = TestBed.inject(AthleteDirectoryStore);
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    firebase.apiKey = realApiKey;
  });

  it('volta do perfil com a lista inteira e no mesmo ponto do scroll', async () => {
    seedBrowsedList(60, 900);

    fixture = await visit();

    expect(rowCountOf(fixture)).toBe(60);
    expect(scrollerOf(fixture).scrollTop).toBe(900);
    // Nada de spinner: a volta reexibe o cache, não recarrega a primeira página.
    expect(store.loading()).toBeFalse();
  });

  it('rolar a listagem grava a posição para a próxima visita', async () => {
    seedBrowsedList(60, 0);

    fixture = await visit();
    const scroller = scrollerOf(fixture);
    scroller.scrollTop = 640;
    scroller.dispatchEvent(new Event('scroll'));

    expect(store.scrollTop).toBe(640);
  });

  /** Round-trip de rota de verdade: `/atletas` → perfil → `/atletas`. Prova que o
   *  router realmente destrói a listagem e que é o store que a devolve inteira. */
  it('abrir o perfil pelo router e voltar não recarrega nem sobe a lista', async () => {
    seedBrowsedList(60, 0);
    const harness = await RouterTestingHarness.create();

    const listed = await harness.navigateByUrl('/atletas', AthleteDirectoryComponent);
    expect(listed).toBeInstanceOf(AthleteDirectoryComponent);
    harness.detectChanges();

    const scroller = harness.fixture.nativeElement.querySelector('.at-main') as HTMLElement;
    scroller.scrollTop = 780;
    scroller.dispatchEvent(new Event('scroll'));
    const leftAt = scroller.scrollTop;
    expect(leftAt).toBeGreaterThan(0);

    await harness.navigateByUrl('/atletas/atleta-7');
    harness.detectChanges();
    expect(harness.fixture.nativeElement.querySelectorAll('.ad-row').length).toBe(0);

    await harness.navigateByUrl('/atletas', AthleteDirectoryComponent);
    harness.detectChanges();
    await harness.fixture.whenStable();

    const backScroller = harness.fixture.nativeElement.querySelector('.at-main') as HTMLElement;
    expect(harness.fixture.nativeElement.querySelectorAll('.ad-row').length).toBe(60);
    expect(backScroller.scrollTop).toBe(leftAt);
    expect(store.loading()).toBeFalse();
  });

  it('trocar de filtro descarta o cache e a lista recomeça do topo', async () => {
    seedBrowsedList(60, 900);
    fixture = await visit();

    store.cityFilter.set('Goiânia');
    await fixture.whenStable();

    expect(store.isWarmFor(DEFAULT_SIGNATURE)).toBeFalse();
    expect(store.scrollTop).toBe(0);
  });
});
