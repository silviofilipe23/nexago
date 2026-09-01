import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { ComunicacaoComponent } from './comunicacao.component';

function category(id: string, name: string): OrganizerTournamentCategory {
  return { id, name } as OrganizerTournamentCategory;
}

function tournament(categories: OrganizerTournamentCategory[]): OrganizerTournament {
  return { id: 't1', name: 'Copa Teste', categories } as OrganizerTournament;
}

/** O `<select>` de categoria abre pré-preenchido: quando o torneio termina de carregar, `load()`
 *  já define a categoria escolhida antes de a lista existir na tela.
 *
 *  Normalmente a escolhida é a primeira da lista, e aí o defeito fica escondido — o browser cai
 *  na primeira opção por conta própria e acerta por acidente. Ele aparece quando a categoria da
 *  rota (`/painel/eventos/:id/categorias/:catId/comunicacao`) está SEM nome no doc: aí
 *  `lockedCategoryName()` não trava a tela, o `<select>` é renderizado, e a categoria escolhida
 *  pode ser qualquer uma da lista.
 *
 *  Quem renderiza um `<select>` já com valor tem que garantir que a `<option>` correspondente
 *  nasça marcada: a atribuição de `value` no elemento acontece antes de o `@for` criar as opções,
 *  e o browser descarta valor sem opção. Este teste prende o comportamento visível — o que o
 *  organizador vê selecionado — em vez do detalhe de como o binding foi escrito. */
describe('ComunicacaoComponent · select de categoria pré-preenchido', () => {
  let fixture: ComponentFixture<ComunicacaoComponent>;

  beforeEach(async () => {
    // O portal roda zoneless: sem este provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [ComunicacaoComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ComunicacaoComponent);
  });

  function select(): HTMLSelectElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('select.og-comm-select');
  }

  /** Reproduz o estado em que `load()` deixa a tela: torneio e categoria escolhida chegam juntos,
   *  DEPOIS da primeira renderização — é nessa passada que o `<select>` nasce. Semear antes não
   *  serve: o efeito do construtor zera torneio e categoria na primeira detecção. */
  async function tournamentLoaded(categories: OrganizerTournamentCategory[], selectedId: string): Promise<void> {
    const component = fixture.componentInstance;
    // Id vazio: o efeito do construtor sai cedo e a tela não faz I/O — o que interessa aqui é a
    // passada em que torneio e categoria chegam juntos, que é reproduzida logo abaixo.
    fixture.componentRef.setInput('id', '');
    fixture.componentRef.setInput('catId', '');
    fixture.detectChanges();

    component['tournament'].set(tournament(categories));
    component['selectedCategoryId'].set(selectedId);
    component['loading'].set(false);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('abre com a categoria escolhida já selecionada, não com a primeira da lista', async () => {
    await tournamentLoaded([category('c1', 'Feminina B'), category('c2', '')], 'c2');

    expect(select()?.value).toBe('c2');
  });

  it('mantém a primeira da lista quando é ela a escolhida', async () => {
    await tournamentLoaded([category('c1', 'Feminina B'), category('c2', 'Masculina A')], 'c1');

    expect(select()?.value).toBe('c1');
  });
});
