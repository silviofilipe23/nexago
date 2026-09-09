import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AthleteSearchResult } from '../data/athlete-search-repository';
import type {
  TournamentSpotPass,
  TournamentSpotPassLink,
} from '../data/spot-passes-repository';
import type { OrganizerTournamentCategory } from '../data/tournament.model';
import {
  OgLiberarVagaComponent,
  type LiberarVagaLinkSubmit,
  type LiberarVagaSubmit,
} from './liberar-vaga.component';

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

function pass(over: Partial<TournamentSpotPass> = {}): TournamentSpotPass {
  return {
    id: 'p1',
    categoryId: 'c1',
    categoryLabel: 'Feminina B',
    athleteUid: 'u1',
    athleteName: 'Ana',
    status: 'active',
    ...over,
  };
}

function link(over: Partial<TournamentSpotPassLink> = {}): TournamentSpotPassLink {
  return {
    id: 'l1',
    categoryId: 'c1',
    categoryLabel: 'Feminina B',
    total: 3,
    remaining: 2,
    status: 'active',
    // Meia hora a mais tira o teste da borda: o rótulo arredonda PARA BAIXO de propósito
    // (um prazo não pode prometer mais tempo do que tem), e 22h exatas viram 21h no floor.
    expiresAt: new Date(Date.now() + 22.5 * 60 * 60 * 1000),
    ...over,
  };
}

function athlete(uid: string, name: string): AthleteSearchResult {
  return { uid, displayName: name, nickname: '', photoUrl: null };
}

/** A busca em `public_profiles` não é exercitada aqui: os testes cobrem o que a tela DECIDE —
 *  qual categoria, quais passes mostrar e o que vira payload da Cloud Function. */
describe('OgLiberarVagaComponent', () => {
  let fixture: ComponentFixture<OgLiberarVagaComponent>;

  beforeEach(async () => {
    // O portal roda zoneless: sem este provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OgLiberarVagaComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(OgLiberarVagaComponent);
  });

  async function render(
    categorias: OrganizerTournamentCategory[],
    opts: {
      categoriaInicial?: string | null;
      occupancy?: Record<string, number>;
      passes?: TournamentSpotPass[];
      links?: TournamentSpotPassLink[];
    } = {},
  ): Promise<HTMLElement> {
    fixture.componentRef.setInput('categorias', categorias);
    fixture.componentRef.setInput('categoriaInicial', opts.categoriaInicial ?? null);
    fixture.componentRef.setInput('occupancyByCategory', opts.occupancy ?? {});
    fixture.componentRef.setInput('passes', opts.passes ?? []);
    fixture.componentRef.setInput('links', opts.links ?? []);
    fixture.componentRef.setInput('tournamentId', 't1');
    fixture.componentRef.setInput('athleteBaseUrl', 'https://atleta.nexago.com.br');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** Vai para a aba do link do grupo, como o organizador iria. */
  async function openLinkTab(): Promise<HTMLElement> {
    (fixture.componentInstance as unknown as { tab: { set(v: string): void } }).tab.set('link');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** `grant`/`categoryId` são protegidos — o teste chega neles como a view chegaria. */
  function internals(): {
    grant(a: AthleteSearchResult): void;
    categoryId: { set(v: string): void };
  } {
    return fixture.componentInstance as unknown as {
      grant(a: AthleteSearchResult): void;
      categoryId: { set(v: string): void };
    };
  }

  it('categoria única é escolhida sozinha', async () => {
    await render([category()]);
    const emitted: LiberarVagaSubmit[] = [];
    fixture.componentInstance.submitted.subscribe((e) => emitted.push(e));

    internals().grant(athlete('u9', 'Bia'));

    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual({ categoryId: 'c1', athleteUid: 'u9', athleteName: 'Bia' });
  });

  it('respeita a categoria já filtrada na tela', async () => {
    await render([category(), category({ id: 'c2', name: 'Masculina A' })], { categoriaInicial: 'c2' });
    const emitted: LiberarVagaSubmit[] = [];
    fixture.componentInstance.submitted.subscribe((e) => emitted.push(e));

    internals().grant(athlete('u9', 'Bia'));

    expect(emitted[0].categoryId).toBe('c2');
  });

  // Sem categoria escolhida a callable recusaria; a tela não pode deixar o clique sair.
  it('sem categoria escolhida, não emite nada', async () => {
    await render([category(), category({ id: 'c2', name: 'Masculina A' })]);
    const emitted: LiberarVagaSubmit[] = [];
    fixture.componentInstance.submitted.subscribe((e) => emitted.push(e));

    internals().grant(athlete('u9', 'Bia'));

    expect(emitted.length).toBe(0);
  });

  // A régua é o assunto do painel: liberar não é "mais uma inscrição", é criar a vaga seguinte.
  it('lotada: mostra a ocupação e qual vaga o clique cria', async () => {
    const el = await render([category({ maxTeams: 16 })], { occupancy: { c1: 16 } });
    expect(el.textContent).toContain('16/16');
    expect(el.textContent).toContain('Liberar cria a 17ª vaga');
  });

  // Teto já estourado por caminho antigo: a próxima vaga conta a partir da OCUPAÇÃO real,
  // senão a tela prometeria uma vaga que já existe.
  it('ocupação acima do teto conta a próxima vaga pela ocupação', async () => {
    const el = await render([category({ maxTeams: 16 })], { occupancy: { c1: 18 } });
    expect(el.textContent).toContain('Liberar cria a 19ª vaga');
  });

  it('com folga: diz que ninguém precisa de passe, em vez de um aviso separado', async () => {
    const el = await render([category({ maxTeams: 16 })], { occupancy: { c1: 10 } });
    expect(el.textContent).toContain('6 vagas livres');
    expect(el.textContent).toContain('ninguém precisa de passe');
  });

  it('uma vaga livre fica no singular', async () => {
    const el = await render([category({ maxTeams: 16 })], { occupancy: { c1: 15 } });
    expect(el.textContent).toContain('1 vaga livre');
  });

  it('categoria de equipe conta equipes, não duplas', async () => {
    const el = await render([category({ maxTeams: 8, teamSize: 4 })], { occupancy: { c1: 8 } });
    expect(el.textContent).toContain('equipes inscritas');
  });

  it('sem teto declarado, não há lotação a liberar', async () => {
    const el = await render([category({ maxTeams: null })]);
    expect(el.textContent).toContain('não declara teto');
  });

  it('sem passes, o lugar deles convida em vez de ficar vazio', async () => {
    const el = await render([category()]);
    expect(el.textContent).toContain('Nenhuma vaga liberada nesta categoria.');
  });

  it('lista só os passes da categoria em foco, com o estado de cada um', async () => {
    const el = await render([category(), category({ id: 'c2', name: 'Masculina A' })], {
      categoriaInicial: 'c1',
      passes: [
        pass({ id: 'p1', athleteName: 'Ana', status: 'active' }),
        pass({ id: 'p2', athleteName: 'Bruno', status: 'used' }),
        pass({ id: 'p3', categoryId: 'c2', athleteName: 'Caio' }),
      ],
    });

    expect(el.textContent).toContain('Ana');
    expect(el.textContent).toContain('Aguardando o atleta');
    expect(el.textContent).toContain('Inscrição feita');
    expect(el.textContent).not.toContain('Caio');
  });

  // O organizador só descobre que o aviso não chegou quando o atleta reclama — e aí precisa de
  // um botão, não de "libera de novo e torce".
  it('passe ativo oferece Avisar, e emite o passe inteiro', async () => {
    const el = await render([category()], { passes: [pass({ athleteName: 'Ana' })] });
    expect(el.textContent).toContain('Avisar');

    const emitted: TournamentSpotPass[] = [];
    fixture.componentInstance.notifyRequested.subscribe((p) => emitted.push(p));
    const botao = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Avisar',
    );
    botao?.dispatchEvent(new MouseEvent('click'));
    await fixture.whenStable();

    expect(emitted.length).toBe(1);
    expect(emitted[0].athleteUid).toBe('u1');
    expect(emitted[0].categoryId).toBe('c1');
  });

  it('passe já usado não oferece Avisar', async () => {
    const el = await render([category()], { passes: [pass({ status: 'used' })] });
    expect(el.textContent).not.toContain('Avisar');
  });

  // Passe queimado não volta: a inscrição existe, e desfazê-la é remover da categoria.
  it('só o passe ativo oferece Revogar', async () => {
    const el = await render([category()], { passes: [pass({ status: 'used' })] });
    expect(el.textContent).not.toContain('Revogar');

    const withActive = await render([category()], { passes: [pass({ status: 'active' })] });
    expect(withActive.textContent).toContain('Revogar');
  });

  describe('aba do link do grupo', () => {
    it('emite as vagas e a validade escolhidas', async () => {
      await render([category()]);
      await openLinkTab();
      const emitted: LiberarVagaLinkSubmit[] = [];
      fixture.componentInstance.linkRequested.subscribe((e) => emitted.push(e));

      const internals = fixture.componentInstance as unknown as {
        spots: { set(v: number): void };
        expiresInHours: { set(v: number): void };
        requestLink(): void;
      };
      internals.spots.set(3);
      internals.expiresInHours.set(48);
      internals.requestLink();

      expect(emitted).toEqual([{ categoryId: 'c1', spots: 3, expiresInHours: 48 }]);
    });

    // O teto do link espelha o da Cloud Function: pedir 50 vagas é reabrir a categoria.
    it('a quantidade é presa entre 1 e o teto', async () => {
      await render([category()]);
      await openLinkTab();
      const internals = fixture.componentInstance as unknown as {
        onSpotsInput(e: Event): void;
        spots(): number;
      };
      const evt = (value: string) =>
        ({ target: { value } }) as unknown as Event;

      internals.onSpotsInput(evt('999'));
      expect(internals.spots()).toBe(20);
      internals.onSpotsInput(evt('0'));
      expect(internals.spots()).toBe(1);
      internals.onSpotsInput(evt('abc'));
      expect(internals.spots()).toBe(1);
    });

    it('lista o link com o que sobrou e o prazo', async () => {
      const el = await render([category()], { links: [link()] });
      await openLinkTab();
      expect(el.textContent).toContain('2 de 3 vagas');
      expect(el.textContent).toContain('Expira em 22h');
    });

    it('link esgotado diz que acabou, e não oferece Revogar', async () => {
      const el = await render([category()], {
        links: [link({ remaining: 0, status: 'exhausted' })],
      });
      await openLinkTab();
      expect(el.textContent).toContain('Vagas esgotadas');
      expect(el.textContent).not.toContain('Revogar');
    });

    // Revogado sai da lista: não há o que copiar nem o que fechar de novo.
    it('link revogado some da lista', async () => {
      const el = await render([category()], { links: [link({ status: 'revoked' })] });
      await openLinkTab();
      expect(el.textContent).toContain('Nenhum link ativo nesta categoria.');
    });

    it('link de outra categoria não aparece aqui', async () => {
      const el = await render([category(), category({ id: 'c2', name: 'Masculina A' })], {
        categoriaInicial: 'c1',
        links: [link({ id: 'l9', categoryId: 'c2' })],
      });
      await openLinkTab();
      expect(el.textContent).toContain('Nenhum link ativo nesta categoria.');
    });

    it('prazo vencido é dito, não escondido', async () => {
      const el = await render([category()], {
        links: [link({ expiresAt: new Date(Date.now() - 1000) })],
      });
      await openLinkTab();
      expect(el.textContent).toContain('Prazo vencido');
    });
  });
});
