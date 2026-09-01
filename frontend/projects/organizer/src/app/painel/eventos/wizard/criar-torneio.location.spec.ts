import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BR_STATES, BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../../../auth/auth.service';
import { emptyTournamentDraft } from '../../data/tournament-create.model';
import { CriarTorneioComponent } from './criar-torneio.component';

/** Dublê do serviço de UF/cidade: a lista de municípios é um `fetch` no app real, então o
 *  teste precisa poder soltá-la DEPOIS da primeira renderização — é exatamente nessa janela
 *  que o `<select>` de cidade abria em branco. */
class FakeBrLocationsService {
  readonly states = BR_STATES;
  private readonly citiesByUf = signal<Record<string, string[]> | null>(null);
  readonly loaded = () => this.citiesByUf() !== null;

  citiesFor(uf: string): string[] {
    return this.citiesByUf()?.[uf.trim().toUpperCase()] ?? [];
  }

  resolve(data: Record<string, string[]>): void {
    this.citiesByUf.set(data);
  }
}

/** O passo "Local" (passo 2) abre pré-preenchido na edição (`?editar=`). Quem renderiza um
 *  `<select>` já com valor tem que garantir que a `<option>` correspondente nasça marcada:
 *  a atribuição de `value` no elemento acontece antes de o `@for` criar as opções, e o browser
 *  descarta valor sem opção. Estes testes prendem o comportamento visível — o que o organizador
 *  vê selecionado — em vez do detalhe de como o binding foi escrito. */
describe('CriarTorneioComponent · passo Local (edição)', () => {
  let fixture: ComponentFixture<CriarTorneioComponent>;
  let brLocations: FakeBrLocationsService;

  beforeEach(async () => {
    brLocations = new FakeBrLocationsService();
    // O portal roda zoneless: sem este provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [CriarTorneioComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // Sem uid o wizard não busca as regras padrão do organizador — a tela não faz I/O.
        { provide: AuthService, useValue: { user: () => null } },
        { provide: BrLocationsService, useValue: brLocations },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CriarTorneioComponent);
  });

  /** Reproduz a entrada por edição: o rascunho já chega preenchido e o passo Local é o primeiro
   *  a ser renderizado (na tela real o formulário fica escondido atrás do `editLoading`). */
  async function openLocationWith(state: string, city: string): Promise<void> {
    const component = fixture.componentInstance;
    component['draft'].set({ ...emptyTournamentDraft(), tournamentId: 't1', state, city });
    component['step'].set('location');
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function selects(): HTMLSelectElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>('select.og-select-el')];
  }

  it('abre com a UF do torneio já selecionada', async () => {
    brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
    await openLocationWith('GO', 'Goiânia');

    expect(selects()[0].value).toBe('GO');
  });

  it('abre com a cidade do torneio já selecionada', async () => {
    brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
    await openLocationWith('GO', 'Goiânia');

    expect(selects()[1].value).toBe('Goiânia');
  });

  it('marca a cidade quando a lista de municípios chega depois da tela', async () => {
    await openLocationWith('GO', 'Anápolis');

    brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(selects()[1].value).toBe('Anápolis');
  });
});
