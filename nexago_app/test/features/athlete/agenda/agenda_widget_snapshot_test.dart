import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/athlete/domain/agenda/agenda_widget_snapshot.dart';
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
      title: 'Arena Orla',
      subtitle: 'Quadra 2',
      statusLabel: 'CONFIRMADA',
      accentColor: AppColors.brand,
      rental: AthleteAgendaRentalPayload(
        bookingId: id,
        arenaName: 'Arena Orla',
        courtName: 'Quadra 2',
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
      title: 'Intermediário B',
      subtitle: 'Prof. Rafa · CT Orla',
      statusLabel: 'AULA',
      accentColor: athleteAgendaClassSessionAccent,
    );

AthleteAgendaItem _tournament(String id, DateTime first, DateTime last) =>
    AthleteAgendaItem(
      id: id,
      kind: AthleteAgendaItemKind.tournament,
      startsAt: first,
      endsAt: DateTime(last.year, last.month, last.day, 23, 59, 59),
      title: 'Open da Orla',
      subtitle: 'Cat. B',
      statusLabel: 'INSCRITO',
      accentColor: athleteAgendaTournamentAccent,
      tournament: AthleteAgendaTournamentPayload(
        tournamentId: id,
        registrationId: 'r-$id',
        isLive: false,
      ),
    );

void main() {
  // Quarta, 19/11/2026, 16:50.
  final now = DateTime(2026, 11, 19, 16, 50);

  group('buildAgendaWidgetEntries', () {
    test('só o que ainda vai acontecer, na ordem do relógio', () {
      final entries = buildAgendaWidgetEntries([
        _class('aula-sex', DateTime(2026, 11, 21, 7)),
        _rental('hoje-19h', DateTime(2026, 11, 19, 19)),
        _rental(
          'hoje-10h',
          DateTime(2026, 11, 19, 10),
          stage: AthleteAgendaBookingStage.past,
        ),
        _rental(
          'cancelada',
          DateTime(2026, 11, 20, 19),
          stage: AthleteAgendaBookingStage.canceled,
          rawStatus: 'cancelled',
        ),
      ], now: now);

      expect(entries.map((e) => e.id), ['hoje-19h', 'aula-sex']);
    });

    test('o que está em quadra agora continua (até acabar)', () {
      final entries = buildAgendaWidgetEntries([
        _rental(
          'agora',
          DateTime(2026, 11, 19, 16, 30),
          stage: AthleteAgendaBookingStage.current,
        ),
      ], now: now);

      expect(entries.single.id, 'agora');
    });

    test('guarda no máximo 5, para o widget seguir sozinho sem o app', () {
      final entries = buildAgendaWidgetEntries([
        for (var d = 1; d <= 8; d++)
          _rental('d$d', DateTime(2026, 11, 19 + d, 19)),
      ], now: now);

      expect(entries, hasLength(kAgendaWidgetMaxEntries));
      expect(entries.first.id, 'd1');
    });

    test('rótulo por tipo, título e detalhe do item', () {
      final entries = buildAgendaWidgetEntries([
        _rental('r', DateTime(2026, 11, 19, 19)),
        _class('a', DateTime(2026, 11, 21, 7)),
      ], now: now);

      expect(entries[0].label, 'Reserva');
      expect(entries[0].title, 'Arena Orla');
      expect(entries[0].detail, 'Quadra 2');
      expect(entries[0].allDay, isFalse);
      expect(entries[1].label, 'Aula');
      expect(entries[1].detail, 'Prof. Rafa · CT Orla');
    });

    test('torneio sem horário é de dia inteiro, do primeiro ao último dia', () {
      final entry = buildAgendaWidgetEntries([
        _tournament('t', DateTime(2026, 11, 22), DateTime(2026, 11, 23)),
      ], now: now)
          .single;

      expect(entry.label, 'Torneio');
      expect(entry.allDay, isTrue);
      expect(entry.startsAt, DateTime(2026, 11, 22));
      expect(entry.endsAt, DateTime(2026, 11, 23, 23, 59, 59));
    });
  });

  group('encodeAgendaWidgetSnapshot', () {
    test('grava versão, sessão, momento e os itens em milissegundos', () {
      final entries = buildAgendaWidgetEntries([
        _rental('r', DateTime(2026, 11, 19, 19)),
      ], now: now);

      final json = jsonDecode(
        encodeAgendaWidgetSnapshot(
          signedIn: true,
          entries: entries,
          now: now,
        ),
      ) as Map<String, dynamic>;

      expect(json['v'], 1);
      expect(json['signedIn'], isTrue);
      expect(json['generatedAt'], now.millisecondsSinceEpoch);
      final item = (json['items'] as List).single as Map<String, dynamic>;
      expect(item['id'], 'r');
      expect(item['label'], 'Reserva');
      expect(item['title'], 'Arena Orla');
      expect(item['detail'], 'Quadra 2');
      expect(
          item['startsAt'], DateTime(2026, 11, 19, 19).millisecondsSinceEpoch);
      expect(item['endsAt'], DateTime(2026, 11, 19, 20).millisecondsSinceEpoch);
      expect(item['allDay'], isFalse);
      expect(item['color'], athleteAgendaRentalAccent.toARGB32());
    });

    test('sem sessão: nenhum item (o widget pede para entrar)', () {
      final json = jsonDecode(
        encodeAgendaWidgetSnapshot(
            signedIn: false, entries: const [], now: now),
      ) as Map<String, dynamic>;

      expect(json['signedIn'], isFalse);
      expect(json['items'], isEmpty);
    });
  });
}
