import { provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY_INSCRIPTION_UNIFORM, type InscriptionParticipant, type TournamentInscription } from '../data/inscriptions-repository';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import { kocPhaseLabelAt, type KocPhaseSpec } from '../data/koc-phase-plan';
import type { OrganizerTournament } from '../data/tournament.model';
import { PersonPhotoService } from '../ui/person-photo.service';
import { SeedsComponent } from './seeds.component';

function participant(over: Partial<InscriptionParticipant> = {}): InscriptionParticipant {
  return {
    uid: 'a1',
    name: 'Ana Paula',
    photoUrl: null,
    levelsBySport: { BEACH_TENNIS: 'intermediario_1' },
    legacyLevel: null,
    ...over,
  };
}

function inscription(over: Partial<TournamentInscription> = {}): TournamentInscription {
  return {
    id: 'i1',
    tournamentId: 't1',
    categoryId: 'femB',
    teamId: 'team-1',
    teamName: 'Ana Paula / Beatriz Costa',
    customTeamName: null,
    participants: [],
    participantNames: [],
    paymentStatus: 'paid',
    paid: true,
    paidByOrganizer: false,
    needsVerification: false,
    sharePaidCount: 0,
    sharePaidUids: [],
    organizerConfirmedShareUids: [],
    partnerPending: false,
    lgpdAcceptedUids: [],
    uniformPlayer1: EMPTY_INSCRIPTION_UNIFORM,
    uniformPlayer2: EMPTY_INSCRIPTION_UNIFORM,
    uniformByUid: {},
    teamSize: null,
    captainUid: null,
    cancellationRequest: null,
    createdAt: null,
    ...over,
  };
}

function tournament(): OrganizerTournament {
  return {
    id: 't1',
    name: 'Circuito Verão 2026',
    managerId: 'u1',
    sportLabel: 'Beach Tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'andamento',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: null,
    location: null,
    categories: [
      {
        id: 'femB',
        name: 'Feminino B',
        gender: 'female',
        maxTeams: null,
        entryFee: 0,
        teamSize: null,
        bracketFormat: null,
        teamsPerGroup: 3,
        qualifiersPerGroup: 2,
        kocTeamsPerCourt: 4,
        kocRoundsPerBracket: 1,
        kocQualifiersPerRound: 2,
        kocPhases: null,
        kocMaxTeamsPerRound: 5,
        kocRoundDurationSec: 900,
        bestOf: null,
        uniformType: null,
        uniformNumberOnShirt: false,
        uniformNameOnShirt: false,
        uniformSizeOptionsTop: [],
        uniformSizeOptionsShorts: [],
      },
    ],
    capacity: null,
    waitlistEnabled: true,
    leagueId: null,
    courts: [],
    courtsCount: 0,
    matchOps: { dayStart: '08:00', dayEnd: '22:00', defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30, dynamicRescheduleEnabled: false },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    myRole: null,
  };
}

/** Estado interno alimentado na mão: com `id` vazio o efeito de carga devolve na primeira linha
 *  (`if (!tid || !cid) return`), então nada de Firestore entra em cena. Mesmo seam do spec de
 *  `categoria-detalhe`. */
interface Internals {
  tournament: WritableSignal<OrganizerTournament | null>;
  eligible: WritableSignal<TournamentInscription[]>;
  loading: WritableSignal<boolean>;
  useSeeds: WritableSignal<boolean>;
  dragFrom: WritableSignal<number | null>;
  dragOver: WritableSignal<number | null>;
  kocPhases: WritableSignal<KocPhaseSpec[]>;
  redraw(): void;
  kocPhaseTitle(index: number): string;
  onDrop(targetIndex: number, event: DragEvent): void;
  onDragStart(index: number, event: DragEvent): void;
  onDragEnd(): void;
}

describe('SeedsComponent — avatares dos atletas', () => {
  let fixture: ComponentFixture<SeedsComponent>;

  async function mount(eligible: TournamentInscription[]): Promise<HTMLElement> {
    // Portal zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste não
    // carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [SeedsComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(SeedsComponent);
    fixture.componentRef.setInput('catId', 'femB');
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.tournament.set(tournament());
    internals.eligible.set(eligible);
    internals.loading.set(false);
    internals.redraw();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function seedRowAvatars(el: HTMLElement): HTMLElement[] {
    return Array.from(el.querySelectorAll('.og-seed-row .og-seed-avatars .og-avatar'));
  }

  it('mostra um rosto por atleta da dupla, com a foto de cada um', async () => {
    const el = await mount([
      inscription({
        participants: [
          participant({ uid: 'a1', name: 'Ana Paula', photoUrl: 'https://cdn/ana.jpg' }),
          participant({ uid: 'a2', name: 'Beatriz Costa', photoUrl: 'https://cdn/bia.jpg' }),
        ],
      }),
    ]);

    const avatars = seedRowAvatars(el);
    expect(avatars.length).toBe(2);
    expect(avatars.map((a) => a.querySelector('img')?.getAttribute('src'))).toEqual(['https://cdn/ana.jpg', 'https://cdn/bia.jpg']);
  });

  it('atleta com foto vira botão de ampliar e abre o visualizador com nome, papel e contexto', async () => {
    const el = await mount([
      inscription({
        participants: [
          participant({ uid: 'a1', name: 'Ana Paula', photoUrl: 'https://cdn/ana.jpg' }),
          participant({ uid: 'a2', name: 'Beatriz Costa', photoUrl: 'https://cdn/bia.jpg' }),
        ],
      }),
    ]);

    const second = seedRowAvatars(el)[1]!;
    expect(second.getAttribute('role')).toBe('button');
    expect(second.getAttribute('aria-label')).toBe('Ver foto de Beatriz Costa');

    second.click();
    await fixture.whenStable();

    const photo = TestBed.inject(PersonPhotoService).photo();
    expect(photo?.photoUrl).toBe('https://cdn/bia.jpg');
    expect(photo?.name).toBe('Beatriz Costa');
    expect(photo?.role).toBe('Atleta');
    expect(photo?.meta).toBe('Feminino B · Ana Paula / Beatriz Costa');
  });

  /** Sem foto não há o que ampliar — o avatar segue só com as iniciais, sem afordância falsa. */
  it('atleta sem foto continua nas iniciais e não vira botão', async () => {
    const el = await mount([
      inscription({
        participants: [participant({ uid: 'a1', name: 'Ana Paula', photoUrl: null }), participant({ uid: 'a2', name: 'Beatriz Costa', photoUrl: null })],
      }),
    ]);

    const avatars = seedRowAvatars(el);
    expect(avatars.map((a) => a.textContent?.trim())).toEqual(['AP', 'BC']);
    expect(avatars.some((a) => a.getAttribute('role') === 'button')).toBe(false);
  });

  /** Inscrição cujo elenco ainda não resolveu perfil (reserva solo, parceiro pendente) cai no
   *  rótulo da equipe — as iniciais quebram por " / ", não por espaço, senão "Iris Lopes /
   *  Joana Vieira" viraria "IL" em vez de "IJ". */
  it('inscrição sem elenco resolvido cai num avatar só, com as iniciais da dupla', async () => {
    const el = await mount([inscription({ teamName: 'Iris Lopes / Joana Vieira', participants: [] })]);

    const avatars = seedRowAvatars(el);
    expect(avatars.length).toBe(1);
    expect(avatars[0]!.textContent?.trim()).toBe('IJ');
  });

  it('prévia de grupos também mostra os rostos, ampliáveis', async () => {
    const el = await mount([
      inscription({
        id: 'i1',
        teamId: 'team-1',
        participants: [participant({ uid: 'a1', name: 'Ana Paula', photoUrl: 'https://cdn/ana.jpg' })],
      }),
    ]);

    const groupAvatars = el.querySelectorAll('.og-seeds-group-team .og-seed-avatars .og-avatar');
    expect(groupAvatars.length).toBe(1);
    expect(groupAvatars[0]!.getAttribute('aria-label')).toBe('Ver foto de Ana Paula');
  });
});

describe('SeedsComponent — drag and drop da ordem de seeds', () => {
  let fixture: ComponentFixture<SeedsComponent>;

  async function mount(eligible: TournamentInscription[]): Promise<Internals> {
    await TestBed.configureTestingModule({
      imports: [SeedsComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(SeedsComponent);
    fixture.componentRef.setInput('catId', 'femB');
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.tournament.set(tournament());
    internals.eligible.set(eligible);
    internals.loading.set(false);
    internals.useSeeds.set(true);
    internals.redraw();
    await fixture.whenStable();
    return internals;
  }

  function threeTeams(): TournamentInscription[] {
    return [
      inscription({ id: 'i1', teamId: 'team-1', teamName: 'Alpha / A' }),
      inscription({ id: 'i2', teamId: 'team-2', teamName: 'Bravo / B' }),
      inscription({ id: 'i3', teamId: 'team-3', teamName: 'Charlie / C' }),
    ];
  }

  it('mostra o handle de arraste quando a ordem de seeds está ligada', async () => {
    await mount(threeTeams());
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.og-seed-handle').length).toBe(3);
  });

  it('arrastar uma dupla para outro índice reordena a lista', async () => {
    const internals = await mount(threeTeams());
    internals.dragFrom.set(0);
    internals.onDrop(2, new DragEvent('drop', { bubbles: true, cancelable: true }));
    expect(internals.eligible().map((t) => t.teamId)).toEqual(['team-2', 'team-3', 'team-1']);
    expect(internals.dragFrom()).toBeNull();
    expect(internals.dragOver()).toBeNull();
  });

  it('sem seeds ligados o drop não muda a ordem', async () => {
    const internals = await mount(threeTeams());
    internals.useSeeds.set(false);
    internals.dragFrom.set(0);
    internals.onDrop(2, new DragEvent('drop', { bubbles: true, cancelable: true }));
    expect(internals.eligible().map((t) => t.teamId)).toEqual(['team-1', 'team-2', 'team-3']);
  });
});

/** O rótulo da fase é UMA regra, em `koc-phase-plan.ts`, chamada tanto por esta
 *  tela quanto pelo aviso de divergência do chaveamento (`koc-drift.ts`). Eram
 *  duas cópias que concordavam por acaso; este bloco é o que impede a tela de
 *  voltar a ter a sua. */
describe('SeedsComponent — rótulo da fase vem da regra compartilhada', () => {
  function phase(bracketCount: number): KocPhaseSpec {
    return {
      bracketSizes: Array.from({length: bracketCount}, () => 4),
      roundsPerBracket: 1,
      qualifiersPerRound: 1,
      durationSec: 900,
    };
  }

  async function mountWithPlan(phaseCount: number): Promise<Internals> {
    await TestBed.configureTestingModule({
      imports: [SeedsComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeedsComponent);
    fixture.componentRef.setInput('catId', 'femB');
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.tournament.set(tournament());
    internals.loading.set(false);
    internals.kocPhases.set(Array.from({length: phaseCount}, (_, i) => phase(i + 1)));
    await fixture.whenStable();
    return internals;
  }

  it('três fases: Classificatória, Semifinal, Final — exatamente o que a regra diz', async () => {
    const internals = await mountWithPlan(3);
    const titles = [0, 1, 2].map((i) => internals.kocPhaseTitle(i));
    expect(titles).toEqual(['Classificatória', 'Semifinal', 'Final']);
    expect(titles).toEqual([0, 1, 2].map((i) => kocPhaseLabelAt(i, 3)));
  });

  it('duas fases: a primeira NÃO vira Semifinal', async () => {
    const internals = await mountWithPlan(2);
    expect([0, 1].map((i) => internals.kocPhaseTitle(i))).toEqual(['Classificatória', 'Final']);
  });
});

/** Estado extra do plano de KOTC. Separado de `Internals` porque só este bloco
 *  precisa trocar o formato e o teto na mão. */
interface KocInternals extends Internals {
  format: WritableSignal<'king_of_court'>;
  kocMaxTeamsPerRound: WritableSignal<number>;
}

/**
 * Campo que cabe numa chave só: a tela precisa OFERECER a final.
 *
 * Quando oferecer é regra pura, com teste em `koc-phase-plan.spec.ts`. O que só
 * este bloco pega é a FIAÇÃO: a linha da final é a única da tabela onde "Chaves"
 * e "Classificam" viram texto fixo, então a régua nova precisa chegar lá dentro
 * — um teste de função pura seguiria verde com a tela sem botão nenhum.
 */
describe('SeedsComponent — a final de 6 duplas pode ser partida', () => {
  function finalOf(field: number): KocPhaseSpec {
    return {bracketSizes: [field], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900};
  }

  async function mountKoc(field: number): Promise<{
    internals: KocInternals;
    el: HTMLElement;
    settle: () => Promise<void>;
  }> {
    await TestBed.configureTestingModule({
      imports: [SeedsComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeedsComponent);
    fixture.componentRef.setInput('catId', 'femB');
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as KocInternals;
    internals.tournament.set(tournament());
    internals.loading.set(false);
    internals.format.set('king_of_court');
    internals.kocMaxTeamsPerRound.set(6);
    internals.kocPhases.set([finalOf(field)]);
    await fixture.whenStable();
    return {
      internals,
      el: fixture.nativeElement as HTMLElement,
      settle: async () => { await fixture.whenStable(); },
    };
  }

  /** A célula "Classificam" da linha `row` da tabela de fases. */
  function qualifiersCell(el: HTMLElement, row: number): HTMLElement {
    const line = el.querySelectorAll('.og-koc-plan-row')[row];
    const cell = Array.from(line?.querySelectorAll('.og-seeds-stepper') ?? [])
      .find((c) => c.querySelector('.lbl')?.textContent?.trim() === 'Classificam');
    return cell as HTMLElement;
  }

  function buttonsOf(cell: HTMLElement): HTMLButtonElement[] {
    return Array.from(cell.querySelectorAll('button'));
  }

  it('campo de 6: a linha da final ganha os botões de Classificam, com o − travado no pódio', async () => {
    const {el} = await mountKoc(6);
    const buttons = buttonsOf(qualifiersCell(el, 0));
    expect(buttons.length).toBe(2);
    expect(buttons[0]!.disabled).toBeTrue();
    expect(qualifiersCell(el, 0).textContent).toContain('pódio');
  });

  it('campo de 5: nada muda — a final segue sendo o torneio inteiro', async () => {
    const {el} = await mountKoc(5);
    expect(buttonsOf(qualifiersCell(el, 0)).length).toBe(0);
    expect(qualifiersCell(el, 0).textContent).toContain('pódio');
  });

  it('o + na final de 6 faz nascer a final de 4 embaixo', async () => {
    const {el, internals, settle} = await mountKoc(6);
    buttonsOf(qualifiersCell(el, 0))[1]!.click();
    await settle();

    expect(internals.kocPhases()).toEqual([
      {bracketSizes: [6], roundsPerBracket: 1, qualifiersPerRound: 4, durationSec: 900},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ]);
    expect(el.querySelectorAll('.og-koc-plan-row').length).toBe(2);
    expect(internals.kocPhaseTitle(1)).toBe('Final');
  });

  it('descer as classificadas abaixo do piso desfaz a final e volta à rodada única', async () => {
    const {el, internals, settle} = await mountKoc(6);
    buttonsOf(qualifiersCell(el, 0))[1]!.click();
    await settle();

    // 4 → 3 → 2: no 2 a cascata colapsa, porque a final ficaria abaixo do piso.
    for (const _ of [1, 2]) {
      buttonsOf(qualifiersCell(el, 0))[0]!.click();
      await settle();
    }
    expect(internals.kocPhases()).toEqual([finalOf(6)]);
    expect(el.querySelectorAll('.og-koc-plan-row').length).toBe(1);
  });
});
