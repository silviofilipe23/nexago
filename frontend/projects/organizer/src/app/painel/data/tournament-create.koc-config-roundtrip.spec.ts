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

  it('torneio antigo, sem o campo, é lido como 1 — não como indefinido', () => {
    const draft = categoryFromMap({ ...KOC_MAP, roundsPerBracket: undefined })!;
    expect(draft.kocRoundsPerBracket).toBe(1);
    const map = categoryToMap(draft, emptyTournamentDraft());
    expect(map['roundsPerBracket']).toBe(1);
  });
});
