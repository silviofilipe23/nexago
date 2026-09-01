import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BR_STATES, BrLocationsService } from '@nexago/br-locations';
import type { League } from '@nexago/leagues';
import { AuthService } from '../../../auth/auth.service';
import { emptyStageDraft } from '../../data/league-create.model';
import { PanelContextService } from '../../shell/panel-context.service';
import { CriarEtapaComponent } from './criar-etapa.component';

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

function league(id: string, name: string): League {
  return { id, name, listingStatus: 'open' } as League;
}

/** Passo 1 ("Liga e local") do wizard de nova etapa. Ele abre pré-preenchido em dois caminhos
 *  reais: entrando por `/painel/ligas/:leagueId/nova-etapa` o circuito já vem escolhido da rota,
 *  e voltando do passo 2 o `@switch` reconstrói o passo com o que o organizador já digitou.
 *
 *  Quem renderiza um `<select>` já com valor tem que garantir que a `<option>` correspondente
 *  nasça marcada: a atribuição de `value` no elemento acontece antes de o `@for` criar as
 *  opções, e o browser descarta valor sem opção. Estes testes prendem o comportamento visível —
 *  o que o organizador vê selecionado — em vez do detalhe de como o binding foi escrito. */
describe('CriarEtapaComponent · passo Liga e local (pré-preenchido)', () => {
  let fixture: ComponentFixture<CriarEtapaComponent>;
  let brLocations: FakeBrLocationsService;

  beforeEach(async () => {
    brLocations = new FakeBrLocationsService();
    // O portal roda zoneless: sem este provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [CriarEtapaComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // Sem uid o construtor não busca as ligas do organizador — a tela não faz I/O.
        { provide: AuthService, useValue: { user: () => null } },
        { provide: PanelContextService, useValue: { leagueId: () => null } },
        { provide: BrLocationsService, useValue: brLocations },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CriarEtapaComponent);
  });

  function selects(): HTMLSelectElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>('select.og-select-el')];
  }

  /** Reproduz o passo 1 já preenchido: as ligas chegaram, uma delas está escolhida e o
   *  rascunho da etapa carrega UF/cidade (na tela real, ao voltar do passo 2). */
  async function openStepOneWith(options: {
    leagues: League[];
    selectedLeagueId: string | null;
    state: string;
    city: string;
  }): Promise<void> {
    const component = fixture.componentInstance;
    component['leagues'].set(options.leagues);
    component['loadingLeagues'].set(false);
    component['selectedLeagueId'].set(options.selectedLeagueId);
    component['stage'].set({ ...emptyStageDraft(1), state: options.state, city: options.city });
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('abre com a liga escolhida já selecionada, não com a primeira da lista', async () => {
    await openStepOneWith({
      leagues: [league('l1', 'Circuito Goiano'), league('l2', 'Copa Cerrado')],
      selectedLeagueId: 'l2',
      state: '',
      city: '',
    });

    expect(selects()[0].value).toBe('l2');
  });

  /** O placeholder é `disabled`, e o reset do HTML PULA opção desabilitada: sem ninguém marcado
   *  o browser desce pra primeira liga de verdade. O select passava a afirmar que já havia
   *  circuito escolhido enquanto `selectedLeagueId()` seguia nulo — e o Continuar respondia
   *  "Escolha uma liga publicada", contradizendo o que estava na tela. */
  it('abre sem liga nenhuma marcada quando ainda não houve escolha', async () => {
    await openStepOneWith({
      leagues: [league('l1', 'Circuito Goiano'), league('l2', 'Copa Cerrado')],
      selectedLeagueId: null,
      state: '',
      city: '',
    });

    expect(selects()[0].value).toBe('');
  });

  it('abre com a UF da etapa já selecionada', async () => {
    brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
    await openStepOneWith({ leagues: [league('l1', 'Circuito Goiano')], selectedLeagueId: 'l1', state: 'GO', city: 'Goiânia' });

    expect(selects()[1].value).toBe('GO');
  });

  it('abre com a cidade da etapa já selecionada', async () => {
    brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
    await openStepOneWith({ leagues: [league('l1', 'Circuito Goiano')], selectedLeagueId: 'l1', state: 'GO', city: 'Goiânia' });

    expect(selects()[2].value).toBe('Goiânia');
  });

  it('marca a cidade quando a lista de municípios chega depois da tela', async () => {
    await openStepOneWith({ leagues: [league('l1', 'Circuito Goiano')], selectedLeagueId: 'l1', state: 'GO', city: 'Anápolis' });

    brLocations.resolve({ GO: ['Goiânia', 'Anápolis'] });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(selects()[2].value).toBe('Anápolis');
  });
});
