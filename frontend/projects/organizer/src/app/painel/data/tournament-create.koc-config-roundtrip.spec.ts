import { categoryFromRaw } from './tournaments-repository';
import { emptyCategoryDraft, emptyTournamentDraft } from './tournament-create.model';
import {
  categoryFromMap,
  categoryToMap,
  tournamentDraftFromFirestore,
  tournamentDraftToFirestore,
} from './tournament-create-mapper';

/**
 * Ida e volta da config KOTC pelo wizard, que é o ÚNICO lugar onde ela se edita
 * — o botão "Editar" dos detalhes da categoria abre
 * `/painel/novo-torneio?editar=<id>&passo=categories`.
 *
 * O round-trip importa porque a gravação é `setDoc(..., {merge: true})` com o
 * array `categories` INTEIRO: um campo que o `categoryFromMap` não lê some do
 * draft e é reescrito com o default na primeira edição de qualquer outra coisa
 * na tela. Não dá erro, não some da tela — a chave é que passa a nascer com
 * outra forma.
 */

/** O doc real tem datas; sem elas `tournamentDraftToFirestore` nem chega na
 *  categoria — grava `Timestamp` de `startAt`/`endAt`. */
const START_AT = { toDate: () => new Date('2026-10-24T12:00:00Z') };

const KOC_MAP = {
  id: 'koc-1',
  categoryName: 'King of the Court Open Masculino',
  bracketFormat: 'king_of_court',
  maxTeams: 16,
  teamsPerCourt: 4,
  roundsPerBracket: 2,
  qualifiersPerRound: 2,
  roundDurationSec: 900,
  maxTeamsPerRound: 6,
};

describe('config KOTC · ida e volta pelo wizard', () => {
  it('lê do doc o que o backend grava', () => {
    const draft = categoryFromMap(KOC_MAP)!;
    expect(draft.bracketSystem).toBe('kingOfCourt');
    expect(draft.kocTeamsPerCourt).toBe(4);
    expect(draft.kocRoundsPerBracket).toBe(2);
    expect(draft.kocQualifiersPerRound).toBe(2);
    expect(draft.kocRoundDurationSec).toBe(900);
    expect(draft.kocMaxTeamsPerRound).toBe(6);
  });

  it('grava de volta com os MESMOS nomes que `resolveKocConfig` lê', () => {
    const draft = categoryFromMap(KOC_MAP)!;
    const map = categoryToMap(draft, emptyTournamentDraft());
    expect(map['teamsPerCourt']).toBe(4);
    expect(map['roundsPerBracket']).toBe(2);
    expect(map['qualifiersPerRound']).toBe(2);
    expect(map['roundDurationSec']).toBe(900);
    expect(map['maxTeamsPerRound']).toBe(6);
  });

  it('torneio antigo, sem `maxTeamsPerRound`, é lido como o teto de quem não escolheu — não como indefinido', () => {
    const draft = categoryFromMap({ ...KOC_MAP, maxTeamsPerRound: undefined })!;
    expect(draft.kocMaxTeamsPerRound).toBe(5);
    const map = categoryToMap(draft, emptyTournamentDraft());
    expect(map['maxTeamsPerRound']).toBe(5);
  });

  it('abrir e salvar sem mexer em nada não muda a config', () => {
    const { draft } = tournamentDraftFromFirestore(
      { name: 'Seed test', startAt: START_AT, endAt: START_AT, categories: [KOC_MAP] },
      'torneio-1',
    );
    const data = tournamentDraftToFirestore({
      draft,
      managerId: 'mgr-1',
      publish: true,
      isUpdate: true,
      existingListingStatus: 'open',
    });
    const saved = (data['categories'] as Array<Record<string, unknown>>)[0]!;
    for (const field of ['teamsPerCourt', 'roundsPerBracket', 'qualifiersPerRound', 'roundDurationSec']) {
      expect(saved[field]).withContext(field).toBe(KOC_MAP[field as keyof typeof KOC_MAP]);
    }
  });

  it('editar OUTRA coisa da categoria preserva a config da chave', () => {
    // O caso real: o organizador entra pra mexer no preço ou nas vagas. O array
    // inteiro é reescrito, então a config KOTC precisa sobreviver à volta.
    const { draft } = tournamentDraftFromFirestore(
      { name: 'Seed test', startAt: START_AT, endAt: START_AT, categories: [KOC_MAP] },
      'torneio-1',
    );
    const edited = {
      ...draft,
      categories: [{ ...draft.categories[0]!, spots: 20, priceCents: 25000 }],
    };
    const data = tournamentDraftToFirestore({
      draft: edited,
      managerId: 'mgr-1',
      publish: true,
      isUpdate: true,
      existingListingStatus: 'open',
    });
    const saved = (data['categories'] as Array<Record<string, unknown>>)[0]!;
    expect(saved['maxTeams']).toBe(20);
    expect(saved['roundsPerBracket']).toBe(2);
    expect(saved['teamsPerCourt']).toBe(4);
  });

  it('mudar rodadas por chave no wizard chega no doc', () => {
    const { draft } = tournamentDraftFromFirestore(
      { name: 'Seed test', startAt: START_AT, endAt: START_AT, categories: [{ ...KOC_MAP, roundsPerBracket: 1 }] },
      'torneio-1',
    );
    expect(draft.categories[0].kocRoundsPerBracket).toBe(1);

    const edited = {
      ...draft,
      categories: [{ ...draft.categories[0]!, kocRoundsPerBracket: 2 }],
    };
    const data = tournamentDraftToFirestore({
      draft: edited,
      managerId: 'mgr-1',
      publish: true,
      isUpdate: true,
      existingListingStatus: 'open',
    });
    const saved = (data['categories'] as Array<Record<string, unknown>>)[0]!;
    expect(saved['roundsPerBracket']).toBe(2);
  });

  it('categoria de duelo também grava a config KOTC, para o roundtrip não perdê-la', () => {
    // Trocar o formato pra KOTC e voltar não pode zerar a escolha: o campo é
    // gravado sempre, e é o que o wizard relê na próxima edição.
    const draft = { ...emptyCategoryDraft('cat-1'), kocRoundsPerBracket: 2 };
    const map = categoryToMap(draft, emptyTournamentDraft());
    expect(map['roundsPerBracket']).toBe(2);
  });

  it('o teto do wizard chega na categoria que a tela de gerar chave lê', () => {
    // O elo que faltava: o wizard grava `maxTeamsPerRound` SEM prefixo (só
    // `saveKocPhasePlan` grava `kocMaxTeamsPerRound`), e o painel lia apenas a
    // forma com prefixo. "Máximo por bateria = 6" virava 5 na proposta de
    // plano — com 10 duplas, duas semis de 3 no lugar da semi de 6 com 4
    // baterias, e nada na tela dizendo por quê.
    const map = categoryToMap(categoryFromMap(KOC_MAP)!, emptyTournamentDraft());
    expect(map['maxTeamsPerRound']).toBe(6);
    expect(categoryFromRaw(map)!.kocMaxTeamsPerRound).toBe(6);
  });

  it('o wizard relê o teto que a tela de gerar chave gravou, em vez de rebaixá-lo pra 5', () => {
    // `saveKocPhasePlan` grava `kocMaxTeamsPerRound`. Lendo só a grafia sem
    // prefixo, o wizard mostrava 5 e — como a gravação reescreve o array
    // inteiro — devolvia 5 ao doc na primeira edição de qualquer outro campo.
    const draft = categoryFromMap({ ...KOC_MAP, maxTeamsPerRound: undefined, kocMaxTeamsPerRound: 6 })!;
    expect(draft.kocMaxTeamsPerRound).toBe(6);
    expect(categoryToMap(draft, emptyTournamentDraft())['maxTeamsPerRound']).toBe(6);
  });

  it('o teto gravado por `saveKocPhasePlan` (com prefixo) ganha do que o wizard gravou', () => {
    // Salvar o plano na tela de gerar chave é a escolha mais recente.
    const map = { ...KOC_MAP, maxTeamsPerRound: 6, kocMaxTeamsPerRound: 4 };
    expect(categoryFromRaw(map)!.kocMaxTeamsPerRound).toBe(4);
  });

  it('categoria sem teto nenhum cai no teto de quem não escolheu', () => {
    const map = { ...KOC_MAP, maxTeamsPerRound: undefined };
    expect(categoryFromRaw(map)!.kocMaxTeamsPerRound).toBe(5);
  });

  it('torneio antigo, sem o campo, é lido como 1 — não como indefinido', () => {
    const draft = categoryFromMap({ ...KOC_MAP, roundsPerBracket: undefined })!;
    expect(draft.kocRoundsPerBracket).toBe(1);
    const map = categoryToMap(draft, emptyTournamentDraft());
    expect(map['roundsPerBracket']).toBe(1);
  });

  it('o PLANO de fases sobrevive a uma edição do wizard', () => {
    // O campo que faltava nesta mesma regra. `saveKocPhasePlan` grava
    // `kocPhases` na categoria porque o Sorteio ao Vivo lê o formato de lá,
    // ANTES de a chave existir. O wizard reescreve o array `categories`
    // inteiro a partir do draft; sem o plano no draft, qualquer edição —
    // mudar uma data, uma taxa — apagava o plano e o sorteio seguinte caía
    // nas regras antigas, sem nada na tela dizendo por quê.
    const plano = [
      { bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900 },
      { bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900 },
      { bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900 },
    ];
    const { draft } = tournamentDraftFromFirestore(
      { name: 'Seed test', startAt: START_AT, endAt: START_AT, categories: [{ ...KOC_MAP, kocPhases: plano }] },
      'torneio-1',
    );
    expect(draft.categories[0].kocPhases).toEqual(plano);

    // Edita OUTRA coisa, como o organizador faria.
    const edited = { ...draft, categories: [{ ...draft.categories[0]!, spots: 20 }] };
    const data = tournamentDraftToFirestore({
      draft: edited,
      managerId: 'mgr-1',
      publish: true,
      isUpdate: true,
      existingListingStatus: 'open',
    });
    const saved = (data['categories'] as Array<Record<string, unknown>>)[0]!;
    expect(saved['kocPhases']).toEqual(plano);
    expect(categoryFromRaw(saved)!.kocPhases).toEqual(plano);
  });

  it('categoria sem plano continua sem — o wizard não inventa um', () => {
    const draft = categoryFromMap(KOC_MAP)!;
    expect(draft.kocPhases).toBeNull();
    expect(categoryFromRaw(categoryToMap(draft, emptyTournamentDraft()))!.kocPhases).toBeNull();
  });

  it('plano sujo no doc não vira plano parcial no draft', () => {
    // Mesma regra de `parseKocPhases` em toda superfície: sujeira derruba o
    // plano inteiro, e o servidor cai nas regras antigas, que funcionam.
    const draft = categoryFromMap({ ...KOC_MAP, kocPhases: [{ bracketSizes: 'x' }] })!;
    expect(draft.kocPhases).toBeNull();
  });
});
