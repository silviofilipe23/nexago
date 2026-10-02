import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_event.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_logic.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

TournamentDetail _detail({
  String id = 't1',
  String name = 'Copa Verão',
  required DateTime start,
  DateTime? end,
  DateTime? opensAt,
  DateTime? closesAt,
  String? leagueId,
  int? stageOrder,
  String sport = 'beachVolleyball',
  double price = 140,
  List<TournamentCategoryOffer> offers = const [],
}) {
  return TournamentDetail(
    id: id,
    name: name,
    location: 'Arena ErreJota',
    city: 'Goiânia',
    dateLabel: '',
    startDate: start,
    endDate: end,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: 'R\$ ${price.toStringAsFixed(0)}',
    priceValue: price,
    spotsLeft: 0,
    spotsTotal: 32,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
    leagueId: leagueId,
    leagueStageOrder: stageOrder,
    registrationOpensAt: opensAt,
    registrationClosesAt: closesAt,
    sport: sport,
    categoryOffers: offers,
  );
}

OrganizerEvent _event(
  OrganizerEventListing listing, {
  String id = 't1',
  required DateTime start,
  DateTime? end,
  DateTime? opensAt,
  DateTime? closesAt,
  List<OrganizerEventChampion> champions = const [],
}) {
  return OrganizerEvent(
    detail: _detail(
      id: id,
      start: start,
      end: end,
      opensAt: opensAt,
      closesAt: closesAt,
    ),
    listing: listing,
    champions: champions,
  );
}

OrganizerPublicProfile _profile({
  String uid = 'o1',
  String name = 'Liga Amadora',
  String? city,
  String? state,
  int followers = 0,
  int openEvents = 0,
  int completed = 0,
  int athletes = 0,
}) {
  return OrganizerPublicProfile(
    uid: uid,
    name: name,
    city: city,
    state: state,
    isOrganizer: true,
    listed: true,
    followersCount: followers,
    stats: OrganizerPublicStats(
      openEvents: openEvents,
      eventsCompleted: completed,
      athletes: athletes,
    ),
  );
}

void main() {
  group('formatação', () {
    test(
      'formatOrganizerCount agrupa milhar e abrevia sem arredondar pra cima',
      () {
        expect(formatOrganizerCount(0), '0');
        expect(formatOrganizerCount(38), '38');
        expect(formatOrganizerCount(1240), '1.240');
        expect(formatOrganizerCount(9999), '9.999');
        expect(formatOrganizerCount(12450), '12,4 mil');
        expect(formatOrganizerCount(20000), '20 mil');
        expect(formatOrganizerCount(999999), '999 mil');
        expect(formatOrganizerCount(1250000), '1,2 mi');
        expect(formatOrganizerCount(-3), '0');
      },
    );

    test('organizerLocationLine junta cidade e UF', () {
      expect(organizerLocationLine('Goiânia', 'go'), 'Goiânia · GO');
      expect(organizerLocationLine('Goiânia', null), 'Goiânia');
      expect(organizerLocationLine(' ', 'SP'), 'SP');
      expect(organizerLocationLine(null, null), isNull);
    });

    test('organizerSinceLabel usa o ano na parede do evento (SP)', () {
      expect(organizerSinceLabel(null), isNull);
      // 01/01/2022 01:00 UTC ainda é 31/12/2021 em São Paulo.
      expect(
        organizerSinceLabel(DateTime.utc(2022, 1, 1, 1)),
        'Organizador desde 2021',
      );
    });

    test('organizerInitials pula conectores e limita a 3 letras', () {
      expect(organizerInitials('Liga Amadora Goiânia'), 'LAG');
      expect(organizerInitials('Arena do Sol'), 'AS');
      expect(organizerInitials('Circuito Areia Quente de Verão'), 'CAQ');
      expect(organizerInitials('nexago'), 'NE');
      expect(organizerInitials('  '), '?');
    });

    test('organizerSportLabel traduz o código do torneio', () {
      expect(organizerSportLabel('beachVolleyball'), 'Vôlei de praia');
      expect(organizerSportLabel('beachTennis'), 'Beach Tennis');
      expect(organizerSportLabel('footvolley'), 'Futevôlei');
      expect(organizerSportLabel('curling'), 'curling');
    });

    test('organizerWhatsappUri exige DDI + DDD + número', () {
      expect(
        organizerWhatsappUri('5562999990000').toString(),
        'https://wa.me/5562999990000',
      );
      expect(
        organizerWhatsappUri('+55 (62) 99999-0000').toString(),
        'https://wa.me/5562999990000',
      );
      expect(organizerWhatsappUri('62999990000'.substring(0, 9)), isNull);
      expect(organizerWhatsappUri(null), isNull);
    });
  });

  group('organizerHeaderStats', () {
    final profile = _profile(completed: 38, athletes: 1240, followers: 2100);

    test('com reputação pública mostra a nota entre atletas e seguidores', () {
      final stats = organizerHeaderStats(
        profile,
        const OrganizerReputation(
          reviewsCount: 312,
          tournamentsRated: 9,
          average: 4.8,
        ),
      );
      expect(
        [for (final s in stats) s.label],
        ['Eventos realizados', 'Atletas', 'Nota média', 'Seguidores'],
      );
      expect([for (final s in stats) s.value], ['38', '1.240', '4,8', '2.100']);
      expect(stats[2].isRating, isTrue);
    });

    test('sem média (menos de 3 avaliações) a nota some', () {
      final stats = organizerHeaderStats(
        profile,
        const OrganizerReputation(reviewsCount: 2, tournamentsRated: 1),
      );
      expect(stats.map((s) => s.label), isNot(contains('Nota média')));
      expect(organizerHeaderStats(profile, null), hasLength(3));
    });

    test('singular para 1', () {
      final stats = organizerHeaderStats(
        _profile(completed: 1, athletes: 1, followers: 1),
        null,
      );
      expect(
        [for (final s in stats) s.label],
        ['Evento realizado', 'Atleta', 'Seguidor'],
      );
    });
  });

  group('eventos: próximos e realizados', () {
    final now = DateTime(2026, 8, 10, 12);

    test('próximos = abertos/fechados que não terminaram, por data', () {
      final later = _event(
        OrganizerEventListing.open,
        id: 'later',
        start: DateTime(2026, 9, 1),
      );
      final sooner = _event(
        OrganizerEventListing.closed,
        id: 'sooner',
        start: DateTime(2026, 8, 20),
      );
      final today = _event(
        OrganizerEventListing.open,
        id: 'today',
        start: DateTime(2026, 8, 10, 8),
      );
      final stale = _event(
        OrganizerEventListing.open,
        id: 'stale',
        start: DateTime(2026, 7, 1),
        end: DateTime(2026, 7, 2),
      );
      final done = _event(
        OrganizerEventListing.completed,
        id: 'done',
        start: DateTime(2026, 9, 5),
      );
      final upcoming = organizerUpcomingEvents([
        later,
        sooner,
        today,
        stale,
        done,
      ], now);
      expect([for (final e in upcoming) e.id], ['today', 'sooner', 'later']);
    });

    test('realizados = listingStatus completed, mais recente primeiro', () {
      final old = _event(
        OrganizerEventListing.completed,
        id: 'old',
        start: DateTime(2025, 1, 1),
      );
      final recent = _event(
        OrganizerEventListing.completed,
        id: 'recent',
        start: DateTime(2026, 5, 2),
      );
      final open = _event(
        OrganizerEventListing.open,
        id: 'open',
        start: DateTime(2026, 1, 1),
      );
      expect(
        [
          for (final e in organizerCompletedEvents([old, open, recent])) e.id,
        ],
        ['recent', 'old'],
      );
    });
  });

  group('organizerEventBadge', () {
    final now = DateTime(2026, 8, 10, 12);
    final future = DateTime(2026, 9, 1, 8);

    OrganizerEventBadge badge(
      OrganizerEvent e, {
      int enrolled = 0,
      int capacity = 32,
    }) => organizerEventBadge(
      e,
      enrolled: enrolled,
      capacity: capacity,
      now: now,
    );

    test('aberto com folga → Inscrições abertas (CTA Inscrever)', () {
      final b = badge(
        _event(OrganizerEventListing.open, start: future),
        enrolled: 10,
      );
      expect(b, OrganizerEventBadge.registrationOpen);
      expect(b.label, 'Inscrições abertas');
      expect(organizerEventCtaIsRegister(b), isTrue);
    });

    test('80% ou mais → Últimas vagas', () {
      expect(
        badge(
          _event(OrganizerEventListing.open, start: future),
          enrolled: 20,
          capacity: 25,
        ),
        OrganizerEventBadge.lastSpots,
      );
      expect(
        badge(
          _event(OrganizerEventListing.open, start: future),
          enrolled: 32,
          capacity: 32,
        ),
        OrganizerEventBadge.lastSpots,
      );
      // 18/24 = 75%: ainda "abertas".
      expect(
        badge(
          _event(OrganizerEventListing.open, start: future),
          enrolled: 18,
          capacity: 24,
        ),
        OrganizerEventBadge.registrationOpen,
      );
    });

    test('abertura agendada no futuro → Em breve (CTA Acompanhar)', () {
      final b = badge(
        _event(
          OrganizerEventListing.open,
          start: future,
          opensAt: DateTime(2026, 8, 11, 10),
        ),
      );
      expect(b, OrganizerEventBadge.comingSoon);
      expect(organizerEventCtaIsRegister(b), isFalse);
    });

    test('fechado ou prazo vencido → Inscrições encerradas', () {
      expect(
        badge(_event(OrganizerEventListing.closed, start: future)),
        OrganizerEventBadge.registrationClosed,
      );
      expect(
        badge(
          _event(
            OrganizerEventListing.open,
            start: future,
            closesAt: DateTime(2026, 8, 9),
          ),
        ),
        OrganizerEventBadge.registrationClosed,
      );
    });

    test('no dia do evento → Ao vivo', () {
      expect(
        badge(
          _event(OrganizerEventListing.closed, start: DateTime(2026, 8, 10, 8)),
        ),
        OrganizerEventBadge.live,
      );
    });

    test('capacidade desconhecida não vira Últimas vagas', () {
      expect(
        badge(
          _event(OrganizerEventListing.open, start: future),
          enrolled: 40,
          capacity: 0,
        ),
        OrganizerEventBadge.registrationOpen,
      );
    });
  });

  group('rótulos do card', () {
    test('tipo: torneio ou liga com etapa, com o esporte', () {
      expect(
        organizerEventTypeLabel(_detail(start: DateTime(2026, 1, 1))),
        'Torneio · Vôlei de praia',
      );
      expect(
        organizerEventTypeLabel(
          _detail(
            start: DateTime(2026, 1, 1),
            leagueId: 'l1',
            stageOrder: 5,
            sport: 'beachTennis',
          ),
        ),
        'Liga · Etapa 5 · Beach Tennis',
      );
      expect(
        organizerEventTypeLabel(
          _detail(start: DateTime(2026, 1, 1), leagueId: 'l1', sport: ''),
        ),
        'Liga',
      );
    });

    test('preço: por dupla, por inscrição com equipe, nada sem preço', () {
      expect(
        organizerEventPriceLabel(_detail(start: DateTime(2026, 1, 1))),
        r'a partir de R$ 140 por dupla',
      );
      expect(
        organizerEventPriceLabel(
          _detail(
            start: DateTime(2026, 1, 1),
            offers: const [
              TournamentCategoryOffer(
                id: 'c1',
                name: 'Quarteto',
                entryFee: 140,
                teamSize: 4,
              ),
            ],
          ),
        ),
        r'a partir de R$ 140 por inscrição',
      );
      expect(
        organizerEventPriceLabel(
          _detail(start: DateTime(2026, 1, 1), price: 0),
        ),
        isNull,
      );
    });

    test('data: dia único, mesmo mês, meses diferentes, sem ano', () {
      expect(
        organizerEventDateLabel(_detail(start: DateTime(2026, 2, 14, 8))),
        '14 fev 2026',
      );
      expect(
        organizerEventDateLabel(
          _detail(
            start: DateTime(2026, 5, 2, 8),
            end: DateTime(2026, 5, 3, 18),
          ),
        ),
        '02–03 mai 2026',
      );
      expect(
        organizerEventDateLabel(
          _detail(
            start: DateTime(2026, 4, 30, 8),
            end: DateTime(2026, 5, 2, 18),
          ),
        ),
        '30 abr – 02 mai 2026',
      );
      expect(
        organizerEventDateLabel(
          _detail(
            start: DateTime(2026, 8, 4, 8),
            end: DateTime(2026, 8, 5, 18),
          ),
          withYear: false,
        ),
        '04–05 ago',
      );
    });

    test('campeões: primeira categoria com nome conhecido', () {
      final event = _event(
        OrganizerEventListing.completed,
        start: DateTime(2026, 1, 1),
        champions: const [
          OrganizerEventChampion(
            categoryId: 'c1',
            categoryName: 'Masculino B',
            teamId: 'sem-nome',
          ),
          OrganizerEventChampion(
            categoryId: 'c2',
            categoryName: 'Feminino B',
            teamId: 'team-f',
          ),
        ],
      );
      final names = {'team-f': 'Reis / Moura'};
      expect(
        organizerEventChampionLine(event, names),
        'Campeões: Reis / Moura',
      );
      expect(organizerEventChampionRows(event, names), [
        (category: 'Feminino B', team: 'Reis / Moura'),
      ]);
      expect(organizerEventChampionLine(event, const {}), isNull);
      expect(organizerChampionTeamIds([event]), {'sem-nome', 'team-f'});
    });
  });

  group('reputação', () {
    test('sem reputação pública não há card de números', () {
      expect(organizerReputationView(null), isNull);
      expect(
        organizerReputationView(
          const OrganizerReputation(reviewsCount: 2, tournamentsRated: 1),
        ),
        isNull,
      );
    });

    test('aspectos na ordem do dono, distribuição de 5 a 1', () {
      final view = organizerReputationView(
        const OrganizerReputation(
          reviewsCount: 10,
          tournamentsRated: 2,
          average: 4.6,
          distribution: {1: 0, 2: 1, 3: 1, 4: 2, 5: 6},
          aspects: {
            TournamentReviewAspect.prizes: TournamentReviewAspectStat(
              count: 4,
              average: 5,
            ),
            TournamentReviewAspect.organization: TournamentReviewAspectStat(
              count: 9,
              average: 4.9,
            ),
            TournamentReviewAspect.schedule: TournamentReviewAspectStat(
              count: 9,
              average: 4.6,
            ),
          },
        ),
      )!;
      expect(view.averageText, '4,6');
      expect(view.countLabel, '10 avaliações');
      expect(
        [for (final a in view.aspects) a.label],
        ['Organização', 'Pontualidade', 'Premiação'],
      );
      expect(view.aspects.last.valueText, '5,0');
      expect(view.aspects.last.fraction, 1.0);
      expect([for (final d in view.distribution) d.stars], [5, 4, 3, 2, 1]);
      expect(view.distribution.first.count, 6);
      expect(view.distribution.first.fraction, closeTo(0.6, 1e-9));
    });

    test('rótulos curtos dos 5 aspectos', () {
      expect(
        [
          for (final a in TournamentReviewAspect.values)
            organizerAspectLabel(a),
        ],
        ['Organização', 'Pontualidade', 'Arbitragem', 'Estrutura', 'Premiação'],
      );
    });

    test('nota por evento: só fechados com 3+, mais recente primeiro', () {
      TournamentReviewSummary summary(
        String id, {
        String status = 'closed',
        int count = 5,
        double? average = 4.5,
      }) => TournamentReviewSummary.fromMap(id, {
        'tournamentId': id,
        'tournamentName': 'Evento $id',
        'status': status,
        'count': count,
        'average': average,
      })!;
      final events = {
        'a': _event(
          OrganizerEventListing.completed,
          id: 'a',
          start: DateTime(2026, 1, 10),
        ),
        'b': _event(
          OrganizerEventListing.completed,
          id: 'b',
          start: DateTime(2026, 6, 10),
        ),
      };
      final rows = organizerEventReviewRows([
        summary('a'),
        summary('b'),
        summary('open', status: 'open'),
        summary('few', count: 2, average: null),
        summary('orphan'),
      ], events);
      expect([for (final r in rows) r.tournamentId], ['b', 'a', 'orphan']);
      expect(rows.first.averageText, '4,5');
      expect(rows.first.countLabel, '5 avaliações');
      expect(rows.first.dateLabel, '10 jun 2026');
      expect(rows.last.dateLabel, isNull);
    });
  });

  group('lista "Organizadores"', () {
    final goiania = _profile(
      uid: 'g',
      name: 'Liga Amadora Goiânia',
      city: 'Goiânia',
      state: 'GO',
      followers: 10,
    );
    final arena = _profile(
      uid: 'a',
      name: 'Arena Sul',
      city: 'São Paulo',
      state: 'SP',
      followers: 500,
    );
    final open = _profile(
      uid: 'o',
      name: 'Circuito Praia',
      city: 'Santos',
      state: 'SP',
      followers: 1,
      openEvents: 2,
    );
    final tie = _profile(uid: 't', name: 'Ágape Eventos', followers: 10);

    test('busca sem acento por nome e cidade, todas as palavras', () {
      final all = [goiania, arena, open, tie];
      expect(filterOrganizersDirectory(all, 'goiania'), [goiania]);
      expect(filterOrganizersDirectory(all, 'GOI liga'), [goiania]);
      expect(filterOrganizersDirectory(all, 'são paulo'), [arena]);
      expect(filterOrganizersDirectory(all, 'sp'), [arena, open]);
      expect(filterOrganizersDirectory(all, 'agape'), [tie]);
      expect(filterOrganizersDirectory(all, '  '), all);
      expect(filterOrganizersDirectory(all, 'xyz'), isEmpty);
    });

    test('ordem: inscrição aberta, seguidores, nome', () {
      expect(
        [
          for (final o in sortOrganizersDirectory([goiania, arena, tie, open]))
            o.uid,
        ],
        ['o', 'a', 't', 'g'],
      );
    });

    test('linha de números do card', () {
      expect(
        organizerDirectoryMetaLine(
          _profile(completed: 38, followers: 2100),
          const OrganizerReputation(
            reviewsCount: 12,
            tournamentsRated: 3,
            average: 4.75,
          ),
        ),
        '★ 4,8 · 38 eventos · 2.100 seguidores',
      );
      expect(
        organizerDirectoryMetaLine(_profile(completed: 1, followers: 1), null),
        '1 evento · 1 seguidor',
      );
    });

    test('nome no torneio: marca só com perfil exibível', () {
      expect(
        organizerDisplayNameFor(_profile(name: 'Liga X'), fallback: 'Ana'),
        'Liga X',
      );
      expect(
        organizerDisplayNameFor(
          const OrganizerPublicProfile(uid: 'o', name: 'Organizador'),
          fallback: 'Ana',
        ),
        'Ana',
      );
      expect(organizerDisplayNameFor(null, fallback: 'Ana'), 'Ana');
    });

    test('rótulo de inscrições abertas', () {
      expect(organizerOpenEventsLabel(0), isNull);
      expect(organizerOpenEventsLabel(3), '3 com inscrição aberta');
    });
  });
}
