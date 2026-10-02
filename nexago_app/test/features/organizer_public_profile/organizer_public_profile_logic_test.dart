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
  int liveMatchesNow = 0,
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
    liveMatchesNow: liveMatchesNow,
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
  required DateTime? start,
  DateTime? end,
  DateTime? opensAt,
  DateTime? closesAt,
  int liveMatchesNow = 0,
  List<OrganizerEventChampion> champions = const [],
}) {
  return OrganizerEvent(
    detail: _detail(
      id: id,
      // O TournamentDetail exige início; o evento guarda o cru (que pode faltar).
      start: start ?? DateTime(2000),
      end: end,
      opensAt: opensAt,
      closesAt: closesAt,
      liveMatchesNow: liveMatchesNow,
    ),
    listing: listing,
    startAt: start,
    endAt: end,
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
      final now = DateTime(2026, 10, 2);
      expect(organizerSinceLabel(null, now: now), isNull);
      // 01/01/2022 01:00 UTC ainda é 31/12/2021 em São Paulo.
      expect(
        organizerSinceLabel(DateTime.utc(2022, 1, 1, 1), now: now),
        'Organizador desde 2021',
      );
    });

    test('organizerSinceLabel some quando o ano está no futuro', () {
      final now = DateTime(2026, 10, 2);
      expect(
        organizerSinceLabel(DateTime(2026, 12, 20), now: now),
        'Organizador desde 2026',
      );
      expect(organizerSinceLabel(DateTime(2027, 2, 1), now: now), isNull);
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

  group('realizado x próximo (definição compartilhada)', () {
    final now = DateTime(2026, 8, 10, 12);

    test('completed é realizado na hora, mesmo no futuro', () {
      final e = _event(
        OrganizerEventListing.completed,
        start: DateTime(2026, 9, 1),
      );
      expect(organizerEventIsRealized(e, now), isTrue);
      expect(organizerEventIsUpcoming(e, now), isFalse);
    });

    test('sem completed, vira realizado 12 h depois do fim', () {
      final end = DateTime(2026, 8, 10, 0);
      final e = _event(
        OrganizerEventListing.closed,
        start: DateTime(2026, 8, 9, 8),
        end: end,
      );
      expect(
        organizerEventIsRealized(e, end.add(const Duration(hours: 11))),
        isFalse,
      );
      expect(
        organizerEventIsRealized(e, end.add(const Duration(hours: 12))),
        isTrue,
      );
    });

    test('sem endAt, o fim é o startAt', () {
      final e = _event(
        OrganizerEventListing.open,
        start: DateTime(2026, 8, 9, 23, 59),
      );
      expect(organizerEventEnd(e), DateTime(2026, 8, 9, 23, 59));
      expect(organizerEventIsRealized(e, now), isTrue);
    });

    test('sem data nenhuma, nunca vira realizado pelo relógio', () {
      final e = _event(OrganizerEventListing.closed, start: null);
      expect(organizerEventEnd(e), isNull);
      expect(organizerEventIsRealized(e, DateTime(2099)), isFalse);
      expect(organizerEventIsUpcoming(e, DateTime(2099)), isTrue);
    });

    test('próximos por data (sem data no fim); realizados do mais recente', () {
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
      final undated = _event(
        OrganizerEventListing.open,
        id: 'undated',
        start: null,
      );
      final ended = _event(
        OrganizerEventListing.closed,
        id: 'ended',
        start: DateTime(2026, 7, 1),
        end: DateTime(2026, 7, 2),
      );
      final old = _event(
        OrganizerEventListing.completed,
        id: 'old',
        start: DateTime(2025, 1, 1),
      );
      final all = [later, sooner, today, undated, ended, old];
      expect(
        [for (final e in organizerUpcomingEvents(all, now)) e.id],
        ['today', 'sooner', 'later', 'undated'],
      );
      expect(
        [for (final e in organizerRealizedEvents(all, now)) e.id],
        ['ended', 'old'],
      );
    });

    test(
      'ao vivo: partida em quadra, ou começou e a inscrição não está aberta',
      () {
        final started = DateTime(2026, 8, 10, 8);
        expect(
          organizerEventIsLive(
            _event(OrganizerEventListing.closed, start: started),
            now,
          ),
          isTrue,
        );
        // Dia do evento com inscrição ainda aberta não é "Ao vivo".
        expect(
          organizerEventIsLive(
            _event(OrganizerEventListing.open, start: started),
            now,
          ),
          isFalse,
        );
        expect(
          organizerEventIsLive(
            _event(
              OrganizerEventListing.open,
              start: started,
              liveMatchesNow: 2,
            ),
            now,
          ),
          isTrue,
        );
        expect(
          organizerEventIsLive(
            _event(OrganizerEventListing.closed, start: DateTime(2026, 8, 11)),
            now,
          ),
          isFalse,
        );
        // Já realizado não é ao vivo.
        expect(
          organizerEventIsLive(
            _event(
              OrganizerEventListing.closed,
              start: DateTime(2026, 8, 8),
              end: DateTime(2026, 8, 9),
            ),
            now,
          ),
          isFalse,
        );
      },
    );

    test('próximo instante de mudança: o mais cedo depois de agora', () {
      final e = _event(
        OrganizerEventListing.open,
        start: DateTime(2026, 8, 20, 8),
        end: DateTime(2026, 8, 21, 18),
        opensAt: DateTime(2026, 8, 9),
        closesAt: DateTime(2026, 8, 18),
      );
      expect(organizerEventNextChangeAt(e, now), DateTime(2026, 8, 18));
      expect(
        organizerEventNextChangeAt(e, DateTime(2026, 8, 19)),
        DateTime(2026, 8, 20, 8),
      );
      expect(
        organizerEventNextChangeAt(e, DateTime(2026, 8, 21, 12)),
        DateTime(2026, 8, 22, 6),
      );
      expect(organizerEventNextChangeAt(e, DateTime(2026, 8, 23)), isNull);
      final other = _event(
        OrganizerEventListing.open,
        start: DateTime(2026, 8, 15),
      );
      expect(
        organizerEventsNextChangeAt([e, other], now),
        DateTime(2026, 8, 15),
      );
      expect(organizerEventsNextChangeAt(const [], now), isNull);
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
      expect(organizerEventCta(b), OrganizerEventCta.register);
      expect(organizerEventCta(b).label, 'Inscrever');
    });

    test('80% ou mais → Últimas vagas; 75% ainda é aberta', () {
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
          enrolled: 18,
          capacity: 24,
        ),
        OrganizerEventBadge.registrationOpen,
      );
    });

    test('100% (ou mais) → Vagas esgotadas, CTA Ver evento', () {
      for (final enrolled in [32, 35]) {
        final b = badge(
          _event(OrganizerEventListing.open, start: future),
          enrolled: enrolled,
        );
        expect(b, OrganizerEventBadge.soldOut);
        expect(b.label, 'Vagas esgotadas');
        expect(organizerEventCta(b), OrganizerEventCta.view);
        expect(organizerEventCta(b).label, 'Ver evento');
      }
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
      expect(organizerEventCta(b), OrganizerEventCta.follow);
      expect(organizerEventCta(b).label, 'Acompanhar');
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

    test('começou e fechou → Ao vivo; começou com inscrição aberta → não', () {
      final started = DateTime(2026, 8, 10, 8);
      expect(
        badge(_event(OrganizerEventListing.closed, start: started)),
        OrganizerEventBadge.live,
      );
      expect(
        badge(_event(OrganizerEventListing.open, start: started)),
        OrganizerEventBadge.registrationOpen,
      );
    });

    test('capacidade desconhecida não vira Últimas vagas nem esgotada', () {
      expect(
        badge(
          _event(OrganizerEventListing.open, start: future),
          enrolled: 40,
          capacity: 0,
        ),
        OrganizerEventBadge.registrationOpen,
      );
    });

    test('preenchido exibido nunca passa do total', () {
      expect(organizerEventFilledLabel(enrolled: 18, capacity: 24), '18/24');
      expect(organizerEventFilledLabel(enrolled: 35, capacity: 32), '32/32');
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

    test('preço em pt-BR, sem centavos quando inteiro', () {
      expect(formatOrganizerPrice(140), 'R\$\u00a0140');
      expect(formatOrganizerPrice(140.5), 'R\$\u00a0140,50');
      expect(formatOrganizerPrice(1250), 'R\$\u00a01.250');
    });

    TournamentCategoryOffer offer(double fee, {int? teamSize}) =>
        TournamentCategoryOffer(
          id: 'c$fee',
          name: 'Cat',
          entryFee: fee,
          teamSize: teamSize,
        );

    test('preço: único, "a partir de", equipe, grátis e misto', () {
      OrganizerEventPrice? price(List<TournamentCategoryOffer> offers) =>
          organizerEventPrice(
            _detail(start: DateTime(2026, 1, 1), offers: offers),
          );

      final single = price([offer(140), offer(140)])!;
      expect(single.label, 'R\$\u00a0140');
      expect(single.caption, 'por dupla');

      final range = price([offer(140.5), offer(120.5)])!;
      expect(range.label, 'a partir de R\$\u00a0120,50');
      expect(range.caption, 'por dupla');

      expect(price([offer(140, teamSize: 4)])!.caption, 'por inscrição');

      final free = price([offer(0), offer(0)])!;
      expect(free.label, 'Grátis');
      expect(free.caption, isNull);

      final mixed = price([offer(0), offer(90)])!;
      expect(mixed.label, 'Grátis');
      expect(mixed.caption, 'em algumas categorias');
    });

    test('preço sem categorias usa o do torneio; sem preço, nada', () {
      expect(
        organizerEventPrice(_detail(start: DateTime(2026, 1, 1)))!.label,
        'R\$\u00a0140',
      );
      expect(
        organizerEventPrice(_detail(start: DateTime(2026, 1, 1), price: 0)),
        isNull,
      );
    });

    test('data: dia único, mesmo mês, meses diferentes, sem ano, sem data', () {
      expect(
        organizerEventDateLabel(
          _event(OrganizerEventListing.open, start: DateTime(2026, 2, 14, 8)),
        ),
        '14 fev 2026',
      );
      expect(
        organizerEventDateLabel(
          _event(
            OrganizerEventListing.open,
            start: DateTime(2026, 5, 2, 8),
            end: DateTime(2026, 5, 3, 18),
          ),
        ),
        '02–03 mai 2026',
      );
      expect(
        organizerEventDateLabel(
          _event(
            OrganizerEventListing.open,
            start: DateTime(2026, 4, 30, 8),
            end: DateTime(2026, 5, 2, 18),
          ),
        ),
        '30 abr – 02 mai 2026',
      );
      expect(
        organizerEventDateLabel(
          _event(
            OrganizerEventListing.open,
            start: DateTime(2026, 8, 4, 8),
            end: DateTime(2026, 8, 5, 18),
          ),
          withYear: false,
        ),
        '04–05 ago',
      );
      expect(
        organizerEventDateLabel(
          _event(OrganizerEventListing.open, start: null),
        ),
        'Data a confirmar',
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
    });

    test(
      'chave dos campeões: só o que a aba mostra, ordenada e sem repetição',
      () {
        OrganizerEvent done(String id, List<String> teams) => _event(
          OrganizerEventListing.completed,
          id: id,
          start: DateTime(2026, 1, 1),
          champions: [
            for (var i = 0; i < teams.length; i++)
              OrganizerEventChampion(
                categoryId: 'c$i',
                categoryName: 'Cat $i',
                teamId: teams[i],
              ),
          ],
        );
        final realized = [
          done('a', ['t-z', 't-a2']),
          done('b', ['t-b']),
          done('c', []),
          done('d', ['t-z']),
          done('e', ['t-e']),
        ];
        // Visão geral: primeira categoria dos 3 primeiros (o 'c' não tem campeão).
        expect(
          organizerChampionTeamIdsKey(
            realized,
            OrganizerChampionScope.overview,
          ),
          't-b,t-z',
        );
        expect(
          organizerChampionTeamIdsKey(
            realized,
            OrganizerChampionScope.firstPerEvent,
          ),
          't-b,t-e,t-z',
        );
        expect(
          organizerChampionTeamIdsKey(realized, OrganizerChampionScope.all),
          't-a2,t-b,t-e,t-z',
        );
        expect(
          organizerChampionTeamIdsKey(const [], OrganizerChampionScope.all),
          '',
        );
        expect(organizerChampionTeamIdsFromKey('t-b,t-z'), {'t-b', 't-z'});
        expect(organizerChampionTeamIdsFromKey(''), isEmpty);
      },
    );
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
