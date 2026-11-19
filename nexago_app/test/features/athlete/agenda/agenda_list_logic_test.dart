import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/athlete/domain/agenda/agenda_list_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';

AthleteAgendaItem _rental(
  String id,
  DateTime start, {
  AthleteAgendaBookingStage stage = AthleteAgendaBookingStage.future,
  String rawStatus = 'confirmed',
}) =>
    AthleteAgendaItem(
      id: id,
      kind: AthleteAgendaItemKind.rental,
      startsAt: start,
      endsAt: start.add(const Duration(hours: 1)),
      title: 'Arena $id',
      subtitle: 'Quadra 1',
      statusLabel: 'CONFIRMADA',
      accentColor: AppColors.brand,
      rental: AthleteAgendaRentalPayload(
        bookingId: id,
        arenaName: 'Arena $id',
        courtName: 'Quadra 1',
        startAt: start,
        endAt: start.add(const Duration(hours: 1)),
        rawStatus: rawStatus,
        confirmedParticipants: 4,
        stage: stage,
      ),
    );

AthleteAgendaItem _class(String id, DateTime start) => AthleteAgendaItem(
      id: id,
      kind: AthleteAgendaItemKind.classSession,
      startsAt: start,
      endsAt: start.add(const Duration(hours: 1)),
      title: 'Aula $id',
      subtitle: 'Prof. Rafa',
      statusLabel: 'AULA',
      accentColor: athleteAgendaClassSessionAccent,
    );

AthleteAgendaItem _tournament(String id, DateTime first, DateTime last) =>
    AthleteAgendaItem(
      id: id,
      kind: AthleteAgendaItemKind.tournament,
      startsAt: first,
      endsAt: DateTime(last.year, last.month, last.day, 23, 59, 59),
      title: 'Open $id',
      subtitle: 'Cat. B',
      statusLabel: 'INSCRITO',
      accentColor: athleteAgendaTournamentAccent,
      tournament: AthleteAgendaTournamentPayload(
        tournamentId: id,
        registrationId: 'r-$id',
        isLive: false,
      ),
    );

List<List<String>> _shape(List<AgendaListSection> sections) => [
      for (final s in sections) [for (final i in s.items) i.id],
    ];

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  // Quarta, 19/11/2026, 15h.
  final now = DateTime(2026, 11, 19, 15);

  group('buildUpcomingAgendaSections', () {
    test('um bloco por dia com compromisso, em ordem, a partir de hoje', () {
      final sections = buildUpcomingAgendaSections(
        [
          _class('aula-sex', DateTime(2026, 11, 21, 7)),
          _rental('hoje-21h', DateTime(2026, 11, 19, 21)),
          _rental('hoje-19h', DateTime(2026, 11, 19, 19)),
          _rental('dez', DateTime(2026, 12, 3, 18)),
        ],
        now: now,
      );

      expect(_shape(sections), [
        ['hoje-19h', 'hoje-21h'],
        ['aula-sex'],
        ['dez'],
      ]);
      expect(sections.first.day, DateTime(2026, 11, 19));
      expect(sections.first.title, startsWith('Hoje'));
      expect(sections[1].title, isNot(startsWith('Amanhã')));
    });

    test('o que já acabou hoje fica em Hoje (pós-jogo); de ontem não', () {
      final sections = buildUpcomingAgendaSections(
        [
          _rental(
            'hoje-10h',
            DateTime(2026, 11, 19, 10),
            stage: AthleteAgendaBookingStage.past,
          ),
          _rental(
            'ontem',
            DateTime(2026, 11, 18, 19),
            stage: AthleteAgendaBookingStage.past,
          ),
        ],
        now: now,
      );

      expect(_shape(sections), [
        ['hoje-10h'],
      ]);
    });

    test('reserva cancelada não entra em Próximos', () {
      final sections = buildUpcomingAgendaSections(
        [
          _rental(
            'cancelada',
            DateTime(2026, 11, 20, 19),
            stage: AthleteAgendaBookingStage.canceled,
            rawStatus: 'cancelled',
          ),
        ],
        now: now,
      );

      expect(sections, isEmpty);
    });

    test('torneio que começou ontem e segue hoje aparece em Hoje', () {
      final sections = buildUpcomingAgendaSections(
        [
          _tournament(
            'em-curso',
            DateTime(2026, 11, 18),
            DateTime(2026, 11, 20),
          ),
        ],
        now: now,
      );

      expect(sections.single.day, DateTime(2026, 11, 19));
      expect(sections.single.items.single.id, 'em-curso');
    });
  });

  group('buildHistoryAgendaSections', () {
    test('agrupa por mês, do mais recente para o mais antigo', () {
      final sections = buildHistoryAgendaSections(
        [
          _rental(
            'out',
            DateTime(2026, 10, 2, 19),
            stage: AthleteAgendaBookingStage.past,
          ),
          _rental(
            'nov-10',
            DateTime(2026, 11, 10, 19),
            stage: AthleteAgendaBookingStage.past,
          ),
          _rental(
            'nov-17',
            DateTime(2026, 11, 17, 19),
            stage: AthleteAgendaBookingStage.past,
          ),
          _rental('futuro', DateTime(2026, 11, 25, 19)),
        ],
        now: now,
      );

      expect(_shape(sections), [
        ['nov-17', 'nov-10'],
        ['out'],
      ]);
      expect(sections.first.title, 'Novembro de 2026');
      expect(sections.first.subtitle, '2 jogos');
      expect(sections.last.subtitle, '1 jogo');
    });

    test('o que acabou hoje fica em Hoje de Próximos, não no histórico', () {
      final sections = buildHistoryAgendaSections(
        [
          _rental(
            'hoje-10h',
            DateTime(2026, 11, 19, 10),
            stage: AthleteAgendaBookingStage.past,
          ),
        ],
        now: now,
      );

      expect(sections, isEmpty);
    });

    test('reserva cancelada vai para o histórico, sem contar como jogo', () {
      final sections = buildHistoryAgendaSections(
        [
          _rental(
            'cancelada',
            DateTime(2026, 11, 25, 19),
            stage: AthleteAgendaBookingStage.canceled,
            rawStatus: 'cancelled',
          ),
          _rental(
            'jogado',
            DateTime(2026, 11, 3, 19),
            stage: AthleteAgendaBookingStage.past,
          ),
        ],
        now: now,
      );

      expect(_shape(sections), [
        ['cancelada', 'jogado'],
      ]);
      expect(sections.single.subtitle, '1 jogo · 1 cancelada');
    });
  });

  group('agendaJumpTarget', () {
    final upcoming = [
      AgendaListSection(
        day: DateTime(2026, 11, 19),
        title: 'Hoje',
        subtitle: '',
        items: const [],
      ),
      AgendaListSection(
        day: DateTime(2026, 11, 21),
        title: 'sex',
        subtitle: '',
        items: const [],
      ),
    ];
    final history = [
      AgendaListSection(
        day: DateTime(2026, 11),
        title: 'Novembro de 2026',
        subtitle: '',
        items: const [],
      ),
      AgendaListSection(
        day: DateTime(2026, 9),
        title: 'Setembro de 2026',
        subtitle: '',
        items: const [],
      ),
    ];

    test('dia com compromisso: vai direto nele', () {
      final t = agendaJumpTarget(
        DateTime(2026, 11, 21),
        upcoming: upcoming,
        history: history,
        now: now,
      );
      expect(t.tab, AthleteAgendaTimeTab.upcoming);
      expect(t.sectionDay, DateTime(2026, 11, 21));
      expect(t.exact, isTrue);
    });

    test('dia livre no futuro: o próximo dia com compromisso', () {
      final t = agendaJumpTarget(
        DateTime(2026, 11, 20),
        upcoming: upcoming,
        history: history,
        now: now,
      );
      expect(t.tab, AthleteAgendaTimeTab.upcoming);
      expect(t.sectionDay, DateTime(2026, 11, 21));
      expect(t.exact, isFalse);
    });

    test('dia livre depois do último compromisso: nada para mostrar', () {
      final t = agendaJumpTarget(
        DateTime(2026, 12, 20),
        upcoming: upcoming,
        history: history,
        now: now,
      );
      expect(t.sectionDay, isNull);
    });

    test('dia que já passou: histórico, no mês dele ou no anterior mais perto',
        () {
      final inMonth = agendaJumpTarget(
        DateTime(2026, 11, 3),
        upcoming: upcoming,
        history: history,
        now: now,
      );
      expect(inMonth.tab, AthleteAgendaTimeTab.past);
      expect(inMonth.sectionDay, DateTime(2026, 11));

      final gap = agendaJumpTarget(
        DateTime(2026, 10, 3),
        upcoming: upcoming,
        history: history,
        now: now,
      );
      expect(gap.tab, AthleteAgendaTimeTab.past);
      expect(gap.sectionDay, DateTime(2026, 9));
      expect(gap.exact, isFalse);
    });
  });

  test('matchesAgendaFilter: Reservas inclui Clubinho, Treinos só aula', () {
    final rental = _rental('r', DateTime(2026, 11, 20, 19));
    final aula = _class('a', DateTime(2026, 11, 21, 7));
    expect(matchesAgendaFilter(rental, AthleteAgendaFilter.rentals), isTrue);
    expect(matchesAgendaFilter(aula, AthleteAgendaFilter.rentals), isFalse);
    expect(matchesAgendaFilter(aula, AthleteAgendaFilter.trainings), isTrue);
    expect(matchesAgendaFilter(aula, AthleteAgendaFilter.all), isTrue);
  });

  test('agendaUpcomingScope e agendaHistoryScope não se sobrepõem', () {
    final items = [
      _rental('hoje', DateTime(2026, 11, 19, 10),
          stage: AthleteAgendaBookingStage.past),
      _rental('amanha', DateTime(2026, 11, 20, 19)),
      _rental('ontem', DateTime(2026, 11, 18, 19),
          stage: AthleteAgendaBookingStage.past),
    ];
    final up = agendaUpcomingScope(items, now: now).map((i) => i.id).toSet();
    final past = agendaHistoryScope(items, now: now).map((i) => i.id).toSet();
    expect(up, {'hoje', 'amanha'});
    expect(past, {'ontem'});
    expect(up.intersection(past), isEmpty);
  });
}
