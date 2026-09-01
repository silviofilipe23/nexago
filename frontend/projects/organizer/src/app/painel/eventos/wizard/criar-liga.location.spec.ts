import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BR_STATES, BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../../../auth/auth.service';
import { emptyLeagueDraft, emptyStageDraft } from '../../data/league-create.model';
import { CriarLigaComponent } from './criar-liga.component';

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

/** Wizard de criar liga — dois pontos abrem `<select>` já com valor: o passo 1 quando o
 *  organizador volta nele pelo stepper (o `@switch` reconstrói o card do zero) e a subview
 *  "Editar etapa", que carrega uma etapa já salva no rascunho (`openEtapa`).
 *
 *  Quem renderiza um `<select>` já com valor tem que garantir que a `<option>` correspondente
 *  nasça marcada: a atribuição de `value` no elemento acontece antes de o `@for` criar as
 *  opções, e o browser descarta valor sem opção. Estes testes prendem o comportamento visível —
 *  o que o organizador vê selecionado — em vez do detalhe de como o binding foi escrito. */
describe('CriarLigaComponent · selects de UF/cidade pré-preenchidos', () => {
  let fixture: ComponentFixture<CriarLigaComponent>;
  let brLocations: FakeBrLocationsService;

  beforeEach(async () => {
    brLocations = new FakeBrLocationsService();
    // O portal roda zoneless: sem este provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [CriarLigaComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // Sem uid o wizard não busca as regras padrão do organizador — a tela não faz I/O.
        { provide: AuthService, useValue: { user: () => null } },
        { provide: BrLocationsService, useValue: brLocations },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CriarLigaComponent);
  });

  function selects(): HTMLSelectElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>('select.og-select-el')];
  }

  /** Volta ao passo 1 ("Identidade") com a sede já escolhida. */
  async function openIdentidadeWith(state: string, city: string): Promise<void> {
    fixture.componentInstance['draft'].set({ ...emptyLeagueDraft(), state, city });
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** Abre a subview "Editar etapa" numa etapa já gravada no rascunho (`openEtapa`). */
  async function openEtapaWith(state: string, city: string): Promise<void> {
    const component = fixture.componentInstance;
    component['stage'].set({ ...emptyStageDraft(1), locationName: 'Arena ErreJota', state, city });
    component['subView'].set('etapa');
    fixture.detectChanges();
    await fixture.whenStable();
  }

  describe('passo Identidade (sede da liga)', () => {
    it('abre com a UF da liga já selecionada', async () => {
      brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
      await openIdentidadeWith('GO', 'Goiânia');

      expect(selects()[0].value).toBe('GO');
    });

    it('abre com a cidade-sede já selecionada', async () => {
      brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
      await openIdentidadeWith('GO', 'Goiânia');

      expect(selects()[1].value).toBe('Goiânia');
    });

    it('marca a cidade-sede quando a lista de municípios chega depois da tela', async () => {
      await openIdentidadeWith('GO', 'Anápolis');

      brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(selects()[1].value).toBe('Anápolis');
    });
  });

  describe('subview Editar etapa', () => {
    it('abre com a UF da etapa já selecionada', async () => {
      brLocations.resolve({ SP: ['São Paulo', 'Campinas'] });
      await openEtapaWith('SP', 'Campinas');

      expect(selects()[0].value).toBe('SP');
    });

    it('abre com a cidade da etapa já selecionada', async () => {
      brLocations.resolve({ SP: ['São Paulo', 'Campinas'] });
      await openEtapaWith('SP', 'Campinas');

      expect(selects()[1].value).toBe('Campinas');
    });

    it('marca a cidade da etapa quando a lista de municípios chega depois da tela', async () => {
      await openEtapaWith('SP', 'Campinas');

      brLocations.resolve({ SP: ['São Paulo', 'Campinas'] });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(selects()[1].value).toBe('Campinas');
    });
  });
});
