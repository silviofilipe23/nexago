import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AthleteSearchResult } from '../data/athlete-search-repository';
import type { OrganizerTournamentCategory } from '../data/tournament.model';
import { OgNovaInscricaoComponent, type NovaInscricaoSubmit } from './nova-inscricao.component';

function category(over: Partial<OrganizerTournamentCategory> = {}): OrganizerTournamentCategory {
  return {
    id: 'c1',
    name: 'Feminina B',
    maxTeams: null,
    entryFee: 120,
    teamSize: null,
    bracketFormat: null,
    teamsPerGroup: 4,
    qualifiersPerGroup: 2,
    bestOf: null,
    uniformType: null,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    uniformSizeOptionsTop: [],
    uniformSizeOptionsShorts: [],
    ...over,
  };
}

function athlete(uid: string, name: string): AthleteSearchResult {
  return { uid, displayName: name, nickname: '', photoUrl: null };
}

/** A busca em `public_profiles` não é exercitada aqui: os testes cobrem o que o formulário
 *  DECIDE (categoria, dupla completa, pagamento), que é o que vira payload da Cloud Function. */
describe('OgNovaInscricaoComponent', () => {
  let fixture: ComponentFixture<OgNovaInscricaoComponent>;

  beforeEach(async () => {
    // O portal roda zoneless: sem este provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OgNovaInscricaoComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(OgNovaInscricaoComponent);
  });

  async function render(
    categorias: OrganizerTournamentCategory[],
    categoriaInicial: string | null = null,
  ): Promise<HTMLElement> {
    fixture.componentRef.setInput('categorias', categorias);
    fixture.componentRef.setInput('categoriaInicial', categoriaInicial);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** `select`/`markAsPaid` são protegidos — o teste chega neles como a view chegaria. */
  function internals(): {
    select(a: AthleteSearchResult): void;
    markAsPaid: { set(v: boolean): void };
    categoryId: { set(v: string): void };
  } {
    return fixture.componentInstance as unknown as ReturnType<typeof internals>;
  }

  async function pickPair(): Promise<void> {
    internals().select(athlete('uid-a', 'Ana Paula'));
    internals().select(athlete('uid-b', 'Beatriz Costa'));
    await fixture.whenStable();
  }

  function submitButton(el: HTMLElement): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('.og-ni-actions .og-mini-btn-primary')!;
  }

  it('categoria única é escolhida sozinha, sem chips para clicar', async () => {
    const el = await render([category()]);
    expect(el.querySelectorAll('.og-chip').length).toBe(0);

    const emitted: NovaInscricaoSubmit[] = [];
    fixture.componentInstance.submitted.subscribe((e) => emitted.push(e));
    await pickPair();
    submitButton(el).click();

    expect(emitted[0].categoryId).toBe('c1');
  });

  it('aproveita a categoria que a lista já está filtrando', async () => {
    const el = await render(
      [category(), category({ id: 'c2', name: 'Masculina A' })],
      'c2',
    );
    const active = el.querySelector('.og-chip.active');
    expect(active?.textContent?.trim()).toBe('Masculina A');
  });

  it('sem categoria escolhida entre várias, não dá pra inscrever', async () => {
    const el = await render([category(), category({ id: 'c2', name: 'Masculina A' })]);
    await pickPair();
    expect(submitButton(el).disabled).toBeTrue();
  });

  it('exige a dupla completa antes de inscrever', async () => {
    const el = await render([category()]);
    expect(submitButton(el).disabled).toBeTrue();

    internals().select(athlete('uid-a', 'Ana Paula'));
    await fixture.whenStable();
    expect(submitButton(el).disabled).toBeTrue();

    internals().select(athlete('uid-b', 'Beatriz Costa'));
    await fixture.whenStable();
    expect(submitButton(el).disabled).toBeFalse();
  });

  it('dupla completa fecha a busca — não há terceiro atleta pra escolher', async () => {
    const el = await render([category()]);
    expect(el.querySelector('.og-ni-search')).not.toBeNull();
    await pickPair();
    expect(el.querySelector('.og-ni-search')).toBeNull();
  });

  it('trocar um atleta devolve a busca e o botão volta a travar', async () => {
    const el = await render([category()]);
    await pickPair();

    const trocar = el.querySelector<HTMLButtonElement>('.og-ni-slot.filled .og-ghost-btn')!;
    trocar.click();
    await fixture.whenStable();

    expect(el.querySelector('.og-ni-search')).not.toBeNull();
    expect(submitButton(el).disabled).toBeTrue();
  });

  it('emite os dois uids e o pagamento declarado', async () => {
    const el = await render([category()]);
    const emitted: NovaInscricaoSubmit[] = [];
    fixture.componentInstance.submitted.subscribe((e) => emitted.push(e));

    await pickPair();
    internals().markAsPaid.set(true);
    await fixture.whenStable();
    submitButton(el).click();

    expect(emitted[0]).toEqual({
      categoryId: 'c1',
      athleteUids: ['uid-a', 'uid-b'],
      markAsPaid: true,
    });
  });

  it('categoria gratuita não pergunta de pagamento nem manda markAsPaid', async () => {
    const el = await render([
      category({ entryFee: 120 }),
      category({ id: 'c2', name: 'Estreante', entryFee: 0 }),
    ]);
    const emitted: NovaInscricaoSubmit[] = [];
    fixture.componentInstance.submitted.subscribe((e) => emitted.push(e));

    // Liga o pagamento na categoria paga e depois troca para a gratuita: o estado antigo do
    // toggle não pode vazar como declaração de um dinheiro que não existe.
    internals().categoryId.set('c1');
    await fixture.whenStable();
    expect(el.querySelector('og-toggle-row')).not.toBeNull();
    internals().markAsPaid.set(true);

    internals().categoryId.set('c2');
    await fixture.whenStable();
    expect(el.querySelector('og-toggle-row')).toBeNull();

    await pickPair();
    submitButton(el).click();
    expect(emitted[0].markAsPaid).toBeFalse();
  });
});
