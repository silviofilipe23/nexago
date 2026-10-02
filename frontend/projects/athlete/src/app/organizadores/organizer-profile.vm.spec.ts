import {
  organizerEventFromDoc,
  organizerPublicProfileFromDoc,
  type OrganizerEvent,
  type OrganizerReputationDetail,
} from '../data/organizer-public-profiles';
import {
  EVENT_END_GRACE_MS,
  eventDateLabel,
  eventEndMs,
  isLiveOrganizerEvent,
  isRealizedOrganizerEvent,
  isUpcomingOrganizerEvent,
  formatCompactCount,
  formatCount,
  formatPrice,
  openRegistrationCaption,
  organizerEventCardVm,
  organizerHeaderVm,
  organizerHistoryRowVm,
  organizerInitials,
  organizerReputationVm,
  organizerResultVm,
  organizerReviewsVm,
  organizerTabFromParam,
  realizedOrganizerEvents,
  tournamentSportLabel,
  upcomingOrganizerEvents,
} from './organizer-profile.vm';

/** Meio-dia em São Paulo. */
const NOW = new Date('2026-10-02T15:00:00Z');

function ts(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

/** Meia-noite de São Paulo do dia `ymd` (é assim que o wizard grava o dia do torneio). */
function day(ymd: string): { toDate: () => Date } {
  return ts(`${ymd}T03:00:00Z`);
}

function event(id: string, over: Record<string, unknown> = {}): OrganizerEvent {
  const e = organizerEventFromDoc(id, {
    name: `Evento ${id}`,
    listingStatus: 'open',
    sport: 'beachVolleyball',
    locationName: 'Arena ErreJota',
    city: 'Goiânia',
    startAt: day('2026-10-20'),
    endAt: day('2026-10-21'),
    categories: [{ id: 'c1', categoryName: 'Open', maxTeams: 32, entryFee: 140 }],
    ...over,
  });
  if (!e) throw new Error(`fixture ${id} não é listado`);
  return e;
}

function reputation(over: Partial<OrganizerReputationDetail> = {}): OrganizerReputationDetail {
  return {
    reviewsCount: 312,
    tournamentsRated: 9,
    average: 4.81,
    distribution: { 1: 2, 2: 3, 3: 10, 4: 40, 5: 257 },
    aspects: { organization: 4.9, schedule: 4.6, refereeing: 4.7, prizes: 5 },
    ...over,
  };
}

describe('números', () => {
  it('contagem exata com milhar', () => {
    expect(formatCount(1240)).toBe('1.240');
    expect(formatCount(38)).toBe('38');
    expect(formatCount(-3)).toBe('0');
  });

  it('contador compacto trunca e não arredonda pra cima', () => {
    expect(formatCompactCount(980)).toBe('980');
    expect(formatCompactCount(1000)).toBe('1 mil');
    expect(formatCompactCount(2100)).toBe('2,1 mil');
    expect(formatCompactCount(2199)).toBe('2,1 mil');
    expect(formatCompactCount(12_400)).toBe('12,4 mil');
    expect(formatCompactCount(999_999)).toBe('999,9 mil');
    expect(formatCompactCount(1_250_000)).toBe('1,2 mi');
  });

  it('preço sem centavos quando inteiro', () => {
    expect(formatPrice(140)).toBe('R$ 140');
    expect(formatPrice(140.5)).toBe('R$ 140,50');
    expect(formatPrice(1200)).toBe('R$ 1.200');
  });
});

describe('identidade', () => {
  it('iniciais: até 3, sem preposição', () => {
    expect(organizerInitials('Liga Amadora Goiânia')).toBe('LAG');
    expect(organizerInitials('Arena de Vôlei')).toBe('AV');
    expect(organizerInitials('Liga Amadora de Goiânia Beach')).toBe('LAG');
    expect(organizerInitials('nexa')).toBe('N');
    expect(organizerInitials('  ')).toBe('O');
  });

  it('esporte do torneio (camelCase) e do catálogo do perfil', () => {
    expect(tournamentSportLabel('beachVolleyball')).toBe('Vôlei de praia');
    expect(tournamentSportLabel('footvolley')).toBe('Futevôlei');
    expect(tournamentSportLabel('beachTennis')).toBe('Beach tennis');
    expect(tournamentSportLabel('VOLEI_PRAIA')).toBe('Vôlei de praia');
    expect(tournamentSportLabel(null)).toBeNull();
  });
});

describe('eventDateLabel (fuso de São Paulo)', () => {
  const d = (ymd: string) => day(ymd).toDate();

  it('um dia, mesmo mês, meses diferentes', () => {
    expect(eventDateLabel(d('2026-07-21'), d('2026-07-21'))).toBe('21 jul');
    expect(eventDateLabel(d('2026-07-21'), null)).toBe('21 jul');
    expect(eventDateLabel(d('2026-08-04'), d('2026-08-05'))).toBe('04–05 ago');
    expect(eventDateLabel(d('2026-07-30'), d('2026-08-02'))).toBe('30 jul – 02 ago');
  });

  it('com ano (histórico) e virada de ano', () => {
    expect(eventDateLabel(d('2026-05-02'), d('2026-05-03'), true)).toBe('02–03 mai 2026');
    expect(eventDateLabel(d('2026-02-14'), null, true)).toBe('14 fev 2026');
    expect(eventDateLabel(d('2025-12-30'), d('2026-01-02'))).toBe('30 dez 2025 – 02 jan 2026');
  });

  it('fim antes do início não inventa intervalo; sem data diz que falta', () => {
    expect(eventDateLabel(d('2026-08-05'), d('2026-08-04'))).toBe('05 ago');
    expect(eventDateLabel(null, null)).toBe('Data a confirmar');
  });
});

describe('organizerHeaderVm', () => {
  const profile = organizerPublicProfileFromDoc('org-1', {
    name: 'Liga Amadora Goiânia',
    city: 'Goiânia',
    state: 'GO',
    whatsapp: '5562999991234',
    isOrganizer: true,
    verified: true,
    stats: {
      eventsCompleted: 38,
      athletes: 1240,
      organizerSince: day('2021-03-10'),
      sports: ['beachVolleyball', 'beachTennis', 'VOLEI_PRAIA'],
    },
  });

  it('quatro números com a nota, local, desde, esportes e WhatsApp', () => {
    const vm = organizerHeaderVm(profile, reputation(), 2140, NOW);
    expect(vm.stats).toEqual([
      { value: '38', label: 'Eventos realizados', star: false },
      { value: '1.240', label: 'Atletas', star: false },
      { value: '4,8', label: 'Nota média', star: true },
      { value: '2,1 mil', label: 'Seguidores', star: false },
    ]);
    expect(vm.initials).toBe('LAG');
    expect(vm.locationLabel).toBe('Goiânia · GO');
    expect(vm.sinceLabel).toBe('Organizador desde 2021');
    expect(vm.sports).toEqual(['Vôlei de praia', 'Beach tennis']);
    expect(vm.whatsappUrl).toBe('https://wa.me/5562999991234');
    expect(vm.verified).toBeTrue();
  });

  it('sem nota pública (menos de 3 avaliações) a nota some', () => {
    const vm = organizerHeaderVm(profile, reputation({ reviewsCount: 2, average: null }), 0, NOW);
    expect(vm.stats.map((s) => s.label)).toEqual(['Eventos realizados', 'Atletas', 'Seguidores']);
    expect(organizerHeaderVm(profile, null, 0, NOW).stats.length).toBe(3);
  });

  it('"Organizador desde" some quando o ano ainda não chegou', () => {
    const future = organizerPublicProfileFromDoc('o', { name: 'Nexa', isOrganizer: true, stats: { organizerSince: day('2027-02-01') } });
    expect(organizerHeaderVm(future, null, 0, NOW).sinceLabel).toBeNull();
    const thisYear = organizerPublicProfileFromDoc('o', { name: 'Nexa', isOrganizer: true, stats: { organizerSince: day('2026-12-20') } });
    expect(organizerHeaderVm(thisYear, null, 0, NOW).sinceLabel).toBe('Organizador desde 2026');
  });

  it('singular e campos ausentes', () => {
    const bare = organizerPublicProfileFromDoc('o', { name: 'Nexa', isOrganizer: true, stats: { eventsCompleted: 1, athletes: 1 } });
    const vm = organizerHeaderVm(bare, null, 1, NOW);
    expect(vm.stats.map((s) => s.label)).toEqual(['Evento realizado', 'Atleta', 'Seguidor']);
    expect(vm.locationLabel).toBeNull();
    expect(vm.sinceLabel).toBeNull();
    expect(vm.whatsappUrl).toBeNull();
  });
});

describe('definições compartilhadas (app, portal e backend)', () => {
  it('fim do evento: endAt, senão startAt; nulo sem os dois', () => {
    expect(eventEndMs({ startAt: new Date(1000), endAt: new Date(5000) })).toBe(5000);
    expect(eventEndMs({ startAt: new Date(1000), endAt: null })).toBe(1000);
    expect(eventEndMs({ startAt: null, endAt: null })).toBeNull();
    expect(EVENT_END_GRACE_MS).toBe(36 * 60 * 60 * 1000);
  });

  it('realizado: completed, ou 36h depois do fim — mesmo sem completed gravado', () => {
    expect(isRealizedOrganizerEvent(event('a', { listingStatus: 'completed', startAt: day('2099-01-01') }), NOW)).toBeTrue();
    expect(isRealizedOrganizerEvent(event('d', { listingStatus: 'closed', startAt: day('2026-09-01'), endAt: null }), NOW)).toBeTrue();
    expect(isRealizedOrganizerEvent(event('e', { startAt: null, endAt: null }), NOW)).toBeFalse();
  });

  it('último dia = hoje, gravado como meia-noite UTC (app) ou 03:00 UTC (web): ainda não é realizado ao meio-dia; no dia seguinte ao meio-dia, sim', () => {
    const todayNoonBrt = NOW; // 2026-10-02T15:00Z = 12:00 em Brasília
    const nextDayNoonBrt = new Date('2026-10-03T15:00:00Z');
    for (const lastDay of ['2026-10-02T00:00:00Z', '2026-10-02T03:00:00Z']) {
      const e = event('x', { listingStatus: 'closed', startAt: ts('2026-10-01T03:00:00Z'), endAt: ts(lastDay) });
      expect(isRealizedOrganizerEvent(e, todayNoonBrt)).withContext(lastDay).toBeFalse();
      expect(isUpcomingOrganizerEvent(e, todayNoonBrt)).withContext(lastDay).toBeTrue();
      expect(isRealizedOrganizerEvent(e, nextDayNoonBrt)).withContext(lastDay).toBeTrue();
    }
  });

  it('próximo é o listado que não foi realizado', () => {
    expect(isUpcomingOrganizerEvent(event('a'), NOW)).toBeTrue();
    expect(isUpcomingOrganizerEvent(event('b', { listingStatus: 'completed' }), NOW)).toBeFalse();
    expect(isUpcomingOrganizerEvent(event('c', { endAt: ts('2026-09-30T03:00:00Z') }), NOW)).toBeFalse();
  });

  it('ao vivo: partida rolando, ou começou e a inscrição não está mais aberta', () => {
    const today = { startAt: ts('2026-10-02T03:00:00Z'), endAt: ts('2026-10-03T03:00:00Z') };
    expect(isLiveOrganizerEvent(event('a', { liveMatchesNow: 1 }), NOW)).toBeTrue();
    expect(isLiveOrganizerEvent(event('b', { ...today, listingStatus: 'closed' }), NOW)).toBeTrue();
    // Dia do evento com inscrição ainda aberta e sem partida: segue o selo da inscrição.
    expect(isLiveOrganizerEvent(event('c', { ...today, listingStatus: 'open' }), NOW)).toBeFalse();
    expect(isLiveOrganizerEvent(event('d', { listingStatus: 'closed', startAt: day('2026-10-10') }), NOW)).toBeFalse();
    expect(isLiveOrganizerEvent(event('e', { listingStatus: 'completed', startAt: day('2026-10-01') }), NOW)).toBeFalse();
  });
});

describe('próximos e realizados', () => {
  it('próximos: abertos e encerrados que não terminaram, por data; realizados ficam de fora', () => {
    const list = [
      event('late', { startAt: day('2026-11-10'), endAt: day('2026-11-10') }),
      event('closed', { listingStatus: 'closed', startAt: day('2026-10-05'), endAt: day('2026-10-05') }),
      event('done', { listingStatus: 'completed', startAt: day('2026-09-01') }),
      event('past', { startAt: day('2026-09-20'), endAt: day('2026-09-21') }),
      event('nodate', { startAt: null, endAt: null }),
      event('soon', { startAt: day('2026-10-03'), endAt: day('2026-10-04') }),
    ];
    expect(upcomingOrganizerEvents(list, NOW).map((e) => e.summary.id)).toEqual(['soon', 'closed', 'late', 'nodate']);
  });

  it('realizados: completed e os que acabaram sem completed, do mais recente ao mais antigo', () => {
    const list = [
      event('a', { listingStatus: 'completed', startAt: day('2026-05-02') }),
      event('b', { listingStatus: 'completed', startAt: day('2026-08-10') }),
      event('c', { listingStatus: 'open' }),
      event('d', { listingStatus: 'closed', startAt: day('2026-09-12'), endAt: day('2026-09-13') }),
    ];
    expect(realizedOrganizerEvents(list, NOW).map((e) => e.summary.id)).toEqual(['d', 'b', 'a']);
  });

  it('legenda "N com inscrição aberta" conta só o que aceita inscrição agora', () => {
    const soon = event('d', { registrationOpensAt: ts('2026-10-05T13:00:00Z') });
    const expired = event('e', { registrationClosesAt: ts('2026-10-01T13:00:00Z') });
    expect(openRegistrationCaption([event('a'), event('b'), event('c', { listingStatus: 'closed' }), soon, expired], NOW)).toBe('2 com inscrição aberta');
    expect(openRegistrationCaption([event('c', { listingStatus: 'closed' })], NOW)).toBeNull();
  });
});

describe('organizerEventCardVm', () => {
  it('aberto: selo, tipo, datas, local, vagas reais, preço e Inscrever', () => {
    const vm = organizerEventCardVm(event('t1'), 20, NOW);
    expect(vm.badge).toEqual({ label: 'Inscrições abertas', tone: 'open' });
    expect(vm.typeLabel).toBe('Torneio');
    expect(vm.sportLabel).toBe('Vôlei de praia');
    expect(vm.dateLabel).toBe('20–21 out');
    expect(vm.venue).toBe('Arena ErreJota');
    expect(vm.spots).toEqual({ label: '20/32', pct: 63, known: true });
    expect(vm.price).toEqual({ prefix: '', label: 'R$ 140', unit: 'por dupla' });
    expect(vm.cta).toEqual({ label: 'Inscrever', primary: true, link: ['/torneios', 't1', 'inscricao'] });
    expect(vm.link).toEqual(['/torneios', 't1']);
    expect(vm.coverUrl).toBe('/media/tournament-covers/volei_praia.webp');
  });

  it('últimas vagas a partir de 80% (a soma dos maxTeams é o total, não o capacity)', () => {
    const e = event('t1', { capacity: 64 });
    expect(organizerEventCardVm(e, 26, NOW).badge.label).toBe('Últimas vagas');
    expect(organizerEventCardVm(e, 26, NOW).spots?.label).toBe('26/32');
    expect(organizerEventCardVm(e, 25, NOW).badge.label).toBe('Inscrições abertas');
  });

  it('contagem ainda não chegou: só a capacidade, sem "Últimas vagas"', () => {
    const vm = organizerEventCardVm(event('t1'), null, NOW);
    expect(vm.spots).toEqual({ label: '32 vagas', pct: 0, known: false });
    expect(vm.badge.tone).toBe('open');
  });

  it('ao vivo vence tudo e o botão vira Acompanhar', () => {
    const vm = organizerEventCardVm(event('t1', { liveMatchesNow: 2 }), 32, NOW);
    expect(vm.badge).toEqual({ label: 'Ao vivo', tone: 'live' });
    expect(vm.cta).toEqual({ label: 'Acompanhar', primary: false, link: ['/torneios', 't1'] });
  });

  it('no dia do evento com inscrição aberta e sem partida, não é "Ao vivo"', () => {
    const today = event('t1', { startAt: ts('2026-10-02T03:00:00Z'), endAt: ts('2026-10-03T03:00:00Z') });
    expect(organizerEventCardVm(today, 10, NOW).badge.label).toBe('Inscrições abertas');
    const closedToday = event('t2', { listingStatus: 'closed', startAt: ts('2026-10-02T03:00:00Z'), endAt: ts('2026-10-03T03:00:00Z') });
    expect(organizerEventCardVm(closedToday, 10, NOW).badge.label).toBe('Ao vivo');
  });

  it('lotado sem fila de espera: "Vagas esgotadas" e "Ver evento"; nunca mostra mais que o total', () => {
    const full = event('t1', { waitlistEnabled: false });
    const vm = organizerEventCardVm(full, 34, NOW);
    expect(vm.badge).toEqual({ label: 'Vagas esgotadas', tone: 'full' });
    expect(vm.cta).toEqual({ label: 'Ver evento', primary: false, link: ['/torneios', 't1'] });
    expect(vm.spots).toEqual({ label: '32/32', pct: 100, known: true });
    expect(organizerEventCardVm(full, 32, NOW).badge.label).toBe('Vagas esgotadas');
  });

  it('lotado com fila de espera: ainda dá para entrar na fila', () => {
    const vm = organizerEventCardVm(event('t1'), 32, NOW);
    expect(vm.badge.label).toBe('Últimas vagas');
    expect(vm.cta.label).toBe('Inscrever');
  });

  it('inscrição encerrada (status closed ou prazo vencido)', () => {
    expect(organizerEventCardVm(event('t1', { listingStatus: 'closed' }), 10, NOW).badge.label).toBe('Inscrições encerradas');
    const expired = event('t2', { registrationClosesAt: ts('2026-10-01T12:00:00Z') });
    expect(organizerEventCardVm(expired, 10, NOW).badge.label).toBe('Inscrições encerradas');
    expect(organizerEventCardVm(expired, 10, NOW).cta.label).toBe('Acompanhar');
  });

  it('em breve: registrationOpensAt no futuro', () => {
    const vm = organizerEventCardVm(event('t1', { registrationOpensAt: ts('2026-10-05T13:00:00Z') }), 0, NOW);
    expect(vm.badge).toEqual({ label: 'Em breve', tone: 'soon' });
    expect(vm.cta.label).toBe('Acompanhar');
  });

  it('etapa de liga', () => {
    expect(organizerEventCardVm(event('t1', { leagueId: 'l1', leagueStageOrder: 5 }), 0, NOW).typeLabel).toBe('Liga · Etapa 5');
    expect(organizerEventCardVm(event('t1', { leagueId: 'l1' }), 0, NOW).typeLabel).toBe('Liga');
  });

  it('preço: a categoria mais barata, "a partir de" quando varia, equipe e grátis', () => {
    const two = event('t1', {
      categories: [
        { id: 'c1', maxTeams: 16, entryFee: 140 },
        { id: 'c2', maxTeams: 16, entryFee: 120 },
      ],
    });
    expect(organizerEventCardVm(two, 0, NOW).price).toEqual({ prefix: 'a partir de', label: 'R$ 120', unit: 'por dupla' });
    const team = event('t2', { categories: [{ id: 'c1', maxTeams: 8, entryFee: 300, teamSize: 4 }] });
    expect(organizerEventCardVm(team, 0, NOW).price).toEqual({ prefix: '', label: 'R$ 300', unit: 'por equipe' });
    const free = event('t3', { categories: [{ id: 'c1', maxTeams: 8, entryFee: 0 }] });
    expect(organizerEventCardVm(free, 0, NOW).price).toEqual({ prefix: '', label: 'Grátis', unit: '' });
    const mixed = event('t4', {
      categories: [
        { id: 'c1', maxTeams: 8, entryFee: 0 },
        { id: 'c2', maxTeams: 8, entryFee: 140 },
      ],
    });
    // Nunca "a partir de Grátis".
    expect(organizerEventCardVm(mixed, 0, NOW).price).toEqual({ prefix: '', label: 'Grátis', unit: 'em algumas categorias' });
  });

  it('sem categorias: sem vagas e sem preço', () => {
    const vm = organizerEventCardVm(event('t1', { categories: [] }), 3, NOW);
    expect(vm.spots).toBeNull();
    expect(vm.price).toBeNull();
  });
});

describe('histórico e resultados', () => {
  const done = event('d1', {
    listingStatus: 'completed',
    startAt: day('2026-05-02'),
    endAt: day('2026-05-03'),
    categories: [
      { id: 'c1', categoryName: 'Open Masculino', maxTeams: 16 },
      { id: 'c2', categoryName: 'Feminino B', maxTeams: 16 },
    ],
    categoryOps: { c1: { championTeamId: 'team-a' }, c2: { championTeamId: 'team-b' } },
  });
  const names = new Map([
    ['team-a', 'Lima / Prado'],
    ['team-b', 'Reis / Moura'],
  ]);

  it('linha do histórico: data com ano, duplas e campeões da primeira categoria', () => {
    const vm = organizerHistoryRowVm(done, 16, names);
    expect(vm.dateLabel).toBe('02–03 mai 2026');
    expect(vm.teamsLabel).toBe('16 duplas');
    expect(vm.championsLabel).toBe('Campeões: Lima / Prado');
    expect(vm.sportLabel).toBe('Vôlei de praia');
    expect(vm.link).toEqual(['/torneios', 'd1']);
  });

  it('contagem e nome ainda não chegaram: nada inventado', () => {
    const vm = organizerHistoryRowVm(done, null, new Map());
    expect(vm.teamsLabel).toBeNull();
    expect(vm.championsLabel).toBeNull();
    expect(organizerHistoryRowVm(done, 1, names).teamsLabel).toBe('1 dupla');
  });

  it('resultados: campeão de cada categoria', () => {
    expect(organizerResultVm(done, new Map([['team-a', 'Lima / Prado']])).champions).toEqual([
      { categoryName: 'Open Masculino', teamName: 'Lima / Prado' },
      { categoryName: 'Feminino B', teamName: null },
    ]);
  });
});

describe('reputação e avaliações', () => {
  it('card: média, estrelas, contagem e os 5 aspectos curtos (sem nota vira "—")', () => {
    const vm = organizerReputationVm(reputation())!;
    expect(vm.average).toBe('4,8');
    expect(vm.stars).toBe(5);
    expect(vm.countLabel).toBe('312 avaliações');
    expect(vm.tournamentsLabel).toBe('em 9 eventos');
    expect(vm.aspects).toEqual([
      { key: 'organization', label: 'Organização', value: '4,9', pct: 98 },
      { key: 'schedule', label: 'Pontualidade', value: '4,6', pct: 92 },
      { key: 'refereeing', label: 'Arbitragem', value: '4,7', pct: 94 },
      { key: 'venue', label: 'Estrutura', value: '—', pct: 0 },
      { key: 'prizes', label: 'Premiação', value: '5,0', pct: 100 },
    ]);
  });

  it('sem nota pública: null ("Ainda sem avaliações suficientes")', () => {
    expect(organizerReputationVm(reputation({ reviewsCount: 2, average: null }))).toBeNull();
    expect(organizerReputationVm(null)).toBeNull();
    expect(organizerReputationVm(reputation({ tournamentsRated: 1 }))!.tournamentsLabel).toBe('em 1 evento');
  });

  it('aba Avaliações: distribuição de 5 a 1 e a nota dos eventos listados fechados com 3+', () => {
    const vm = organizerReviewsVm(
      reputation({ distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 } }),
      [
        { tournamentId: 'a', tournamentName: 'Copa A', tournamentStartAt: day('2026-05-02').toDate(), status: 'closed', count: 12, average: 4.62 },
        { tournamentId: 'b', tournamentName: 'Copa B', tournamentStartAt: day('2026-08-10').toDate(), status: 'closed', count: 3, average: 4 },
        { tournamentId: 'c', tournamentName: 'Copa C', tournamentStartAt: day('2026-09-10').toDate(), status: 'open', count: 8, average: 4.9 },
        { tournamentId: 'd', tournamentName: 'Copa D', tournamentStartAt: day('2026-09-12').toDate(), status: 'closed', count: 2, average: null },
        // Torneio "por link" (fora dos eventos listados): não aparece, mesmo fechado com 3+.
        { tournamentId: 'link', tournamentName: 'Copa Secreta', tournamentStartAt: day('2026-09-20').toDate(), status: 'closed', count: 9, average: 4.4 },
      ],
      new Set(['a', 'b', 'c', 'd']),
    );
    expect(vm.distribution).toEqual([
      { stars: 5, count: 2, pct: 50 },
      { stars: 4, count: 1, pct: 25 },
      { stars: 3, count: 1, pct: 25 },
      { stars: 2, count: 0, pct: 0 },
      { stars: 1, count: 0, pct: 0 },
    ]);
    expect(vm.events).toEqual([
      { id: 'b', name: 'Copa B', link: ['/torneios', 'b'], dateLabel: '10 ago 2026', average: '4,0', countLabel: '3 avaliações' },
      { id: 'a', name: 'Copa A', link: ['/torneios', 'a'], dateLabel: '02 mai 2026', average: '4,6', countLabel: '12 avaliações' },
    ]);
  });

  it('sem nota pública a distribuição não aparece', () => {
    const vm = organizerReviewsVm(reputation({ reviewsCount: 2, average: null, distribution: null }), [], new Set());
    expect(vm.summary).toBeNull();
    expect(vm.distribution).toEqual([]);
  });
});

describe('abas', () => {
  it('?aba= conhecida vale; o resto cai na visão geral', () => {
    expect(organizerTabFromParam('eventos')).toBe('eventos');
    expect(organizerTabFromParam('avaliacoes')).toBe('avaliacoes');
    expect(organizerTabFromParam('xyz')).toBe('visao-geral');
    expect(organizerTabFromParam(null)).toBe('visao-geral');
  });
});
