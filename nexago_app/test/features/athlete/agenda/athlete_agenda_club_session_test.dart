import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arenas/domain/arena_club_session.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  ClubParticipant participant({
    String sessionId = 's1',
    String status = 'confirmed',
    String paymentMethod = 'pix',
    DateTime? startAt,
    String date = '2026-07-24',
    String startTime = '15:00',
    String endTime = '19:00',
  }) =>
      ClubParticipant(
        sessionId: sessionId,
        athleteId: 'ath1',
        athleteName: 'João',
        clubId: 'c1',
        arenaId: 'arena1',
        arenaName: 'Arena Beach',
        clubName: 'Clubinho da Sexta',
        date: date,
        startTime: startTime,
        endTime: endTime,
        startAt: startAt,
        status: status,
        paymentMethod: paymentMethod,
        amountReais: 25,
        refundStatus: 'none',
      );

  group('mapClubParticipationToAgendaItem', () {
    test('participação confirmada vira item clubSession "NA LISTA"', () {
      final item = mapClubParticipationToAgendaItem(participant());

      expect(item, isNotNull);
      expect(item!.kind, AthleteAgendaItemKind.clubSession);
      expect(item.id, 'club-s1');
      expect(item.title, 'Clubinho da Sexta');
      expect(item.subtitle, 'Arena Beach · Clubinho');
      expect(item.statusLabel, 'NA LISTA');
      expect(item.accentColor, athleteAgendaClubSessionAccent);
      expect(item.startsAt, DateTime(2026, 7, 24, 15));
      expect(item.endsAt, DateTime(2026, 7, 24, 19));
      expect(item.clubSession, isNotNull);
      expect(item.clubSession!.sessionId, 's1');
      expect(item.clubSession!.pendingPayment, isFalse);
    });

    test('PIX pendente vira "PAGAR PIX" com pendingPayment no payload', () {
      final item =
          mapClubParticipationToAgendaItem(participant(status: 'pending_payment'));

      expect(item, isNotNull);
      expect(item!.statusLabel, 'PAGAR PIX');
      expect(item.clubSession!.pendingPayment, isTrue);
    });

    test('confirmado onsite (paga na arena) também vira "NA LISTA"', () {
      final item = mapClubParticipationToAgendaItem(
        participant(paymentMethod: 'onsite'),
      );

      expect(item, isNotNull);
      expect(item!.statusLabel, 'NA LISTA');
      expect(item.clubSession!.pendingPayment, isFalse);
    });

    test('usa o startAt do servidor quando presente', () {
      final item = mapClubParticipationToAgendaItem(
        participant(startAt: DateTime(2026, 7, 24, 15, 30)),
      );
      expect(item!.startsAt, DateTime(2026, 7, 24, 15, 30));
    });

    test('sem startAt cai em date + startTime', () {
      final item = mapClubParticipationToAgendaItem(participant());
      expect(item!.startsAt, DateTime(2026, 7, 24, 15));
    });

    test('sem horário de início utilizável retorna null (não quebra a lista)',
        () {
      expect(
        mapClubParticipationToAgendaItem(participant(date: '', startTime: '')),
        isNull,
      );
    });

    test('endsAt fica nulo quando o fim não é depois do início', () {
      final item =
          mapClubParticipationToAgendaItem(participant(endTime: '15:00'));
      expect(item, isNotNull);
      expect(item!.endsAt, isNull);
    });
  });

  group('participações ativas na agenda (mesma regra do provider)', () {
    test('confirmed/pending viram item; canceled/expired/estornos ficam fora',
        () {
      final all = [
        participant(sessionId: 's-conf', status: 'confirmed'),
        participant(sessionId: 's-pend', status: 'pending_payment'),
        participant(sessionId: 's-canc', status: 'canceled'),
        participant(sessionId: 's-expi', status: 'expired'),
        participant(sessionId: 's-refu', status: 'canceled_refunded'),
        participant(
          sessionId: 's-aren',
          status: 'canceled_by_arena_refunded',
        ),
      ];

      // Réplica do pipeline de athleteAgendaItemsProvider.
      final items = all
          .where((p) => p.isActive)
          .map(mapClubParticipationToAgendaItem)
          .whereType<AthleteAgendaItem>()
          .toList();

      expect(items, hasLength(2));
      expect(items.map((i) => i.id), ['club-s-conf', 'club-s-pend']);
      expect(items.map((i) => i.statusLabel), ['NA LISTA', 'PAGAR PIX']);
    });
  });

  group('clubSession nos contadores e filtros da agenda', () {
    test('conta no chip de aluguéis e aparece no filtro rentals', () {
      final club = mapClubParticipationToAgendaItem(participant())!;

      final counts = countAgendaFilters([club]);
      expect(counts.all, 1);
      expect(counts.rentals, 1);
      expect(counts.tournaments, 0);
      expect(counts.challenges, 0);

      final filtered = filterAgendaItems(
        items: [club],
        filter: AthleteAgendaFilter.rentals,
        viewMode: AthleteAgendaViewMode.month,
        selectedDay: DateTime(2026, 7, 24),
        visibleMonth: DateTime(2026, 7),
        now: DateTime(2026, 7, 20, 12),
      );
      expect(filtered, hasLength(1));
      expect(filtered.single.kind, AthleteAgendaItemKind.clubSession);
    });

    test('sessão que já passou usa o fim real (não some antes da hora)', () {
      final club = mapClubParticipationToAgendaItem(participant())!;
      // Durante a sessão ainda não é passado…
      expect(
        isAgendaItemPast(club, now: DateTime(2026, 7, 24, 18, 59)),
        isFalse,
      );
      // …depois do fim, é.
      expect(
        isAgendaItemPast(club, now: DateTime(2026, 7, 24, 19, 1)),
        isTrue,
      );
    });
  });
}
