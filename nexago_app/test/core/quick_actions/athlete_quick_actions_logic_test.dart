import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/quick_actions/athlete_quick_actions_logic.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_logic.dart';

// Sexta, 20/11/2026, 10h — a reserva do exemplo é no sábado.
final _now = DateTime(2026, 11, 20, 10);

MyBookingItem _booking({
  String id = 'bk-1',
  String arenaName = 'Arena Praia Sul',
  String? courtName = 'Quadra 2',
  String dateRaw = '2026-11-21',
  String startTime = '19:00',
  String endTime = '20:30',
}) {
  return MyBookingItem(
    id: id,
    arenaName: arenaName,
    courtName: courtName,
    dateRaw: dateRaw,
    startTime: startTime,
    endTime: endTime,
    rawStatus: 'confirmed',
    paymentDisplay: const MyBookingPaymentDisplay(label: 'PIX'),
  );
}

const _focus = AthleteFocusHomeTarget(
  tournamentId: 'cup-1',
  tournamentName: 'Copa Verão',
);

List<QuickActionItem> _build({
  bool signedIn = true,
  AppMobileRole? role = AppMobileRole.athlete,
  MyBookingItem? nextBooking,
  AthleteFocusHomeTarget? focus,
  int unreadMessages = 0,
}) {
  return buildAthleteQuickActions(
    signedIn: signedIn,
    role: role,
    nextBooking: nextBooking,
    focus: focus,
    unreadMessages: unreadMessages,
    now: _now,
  );
}

List<String> _types(List<QuickActionItem> items) =>
    items.map((i) => i.type).toList();

String _spMidnight(int year, int month, int day) =>
    nexagoEventDateTime(year: year, month: month, day: day)
        .millisecondsSinceEpoch
        .toString();

void main() {
  setUpAll(initializeNexagoEventTimezone);

  group('buildAthleteQuickActions', () {
    test('sem login mostra só Reservar quadra', () {
      final items = _build(signedIn: false, role: null);

      expect(_types(items), [AthleteQuickAction.reservar.type]);
      expect(items.single.title, 'Reservar quadra');
      expect(items.single.sfSymbol, 'plus.circle');
    });

    test('logado com outro papel não mostra nada', () {
      for (final role in [
        AppMobileRole.arena,
        AppMobileRole.organizer,
        AppMobileRole.professor,
        AppMobileRole.center,
      ]) {
        expect(_build(role: role), isEmpty, reason: role.name);
      }
    });

    test('logado com papel ainda carregando mostra só Reservar quadra', () {
      expect(_types(_build(role: null)), [AthleteQuickAction.reservar.type]);
    });

    test('atleta sem nada marcado: Reservar, Agenda, Torneios, Mensagens', () {
      final items = _build();

      expect(_types(items), [
        AthleteQuickAction.reservar.type,
        AthleteQuickAction.agenda.type,
        AthleteQuickAction.torneios.type,
        AthleteQuickAction.mensagens.type,
      ]);
      expect(items[1].title, 'Agenda');
      expect(items[1].subtitle, 'Nada marcado');
      expect(items[1].sfSymbol, 'calendar');
      expect(items[2].title, 'Torneios');
      expect(items[2].subtitle, isNull);
      expect(items[2].sfSymbol, 'trophy');
      expect(items[3].title, 'Mensagens');
      expect(items[3].subtitle, isNull);
      expect(items[3].sfSymbol, 'bubble.left.and.bubble.right');
    });

    test('com reserva, o 2º item vira a reserva com dia, hora e lugar', () {
      final items = _build(nextBooking: _booking());

      final booking = items[1];
      expect(booking.type, AthleteQuickAction.booking.type);
      expect(booking.title, 'Sáb, 21/11 · 19h');
      expect(booking.subtitle, 'Arena Praia Sul · Quadra 2');
      expect(booking.sfSymbol, 'calendar.badge.clock');
      expect(booking.payload['bookingId'], 'bk-1');
      expect(
        booking.payload['validUntil'],
        DateTime(2026, 11, 21, 20, 30).millisecondsSinceEpoch.toString(),
      );
    });

    test('hora quebrada aparece com os minutos', () {
      final items = _build(nextBooking: _booking(startTime: '07:30'));

      expect(items[1].title, 'Sáb, 21/11 · 7h30');
    });

    test('reserva sem quadra mostra só a arena no subtítulo', () {
      final items = _build(nextBooking: _booking(courtName: '  '));

      expect(items[1].subtitle, 'Arena Praia Sul');
    });

    test('reserva sem fim legível vale até 1h depois do início', () {
      final items = _build(nextBooking: _booking(endTime: ''));

      expect(
        items[1].payload['validUntil'],
        DateTime(2026, 11, 21, 20).millisecondsSinceEpoch.toString(),
      );
    });

    test('reserva sem data legível cai na Agenda', () {
      final items = _build(nextBooking: _booking(dateRaw: ''));

      expect(items[1].type, AthleteQuickAction.agenda.type);
    });

    test('no dia de torneio o Modo Focus abre o menu e Torneios sai', () {
      final items = _build(
        focus: _focus,
        nextBooking: _booking(),
        unreadMessages: 2,
      );

      expect(_types(items), [
        AthleteQuickAction.focus.type,
        AthleteQuickAction.reservar.type,
        AthleteQuickAction.booking.type,
        AthleteQuickAction.mensagens.type,
      ]);
      final focus = items.first;
      expect(focus.title, 'Modo Focus');
      expect(focus.subtitle, 'Copa Verão · hoje');
      expect(focus.sfSymbol, 'flame.fill');
      expect(focus.payload['tournamentId'], 'cup-1');
      // Meia-noite de São Paulo (fuso dos torneios), não a do aparelho.
      expect(focus.payload['validUntil'], _spMidnight(2026, 11, 21));
    });

    test('Focus no último dia do mês vale até 1º do mês seguinte', () {
      final items = buildAthleteQuickActions(
        signedIn: true,
        role: AppMobileRole.athlete,
        focus: _focus,
        now: nexagoEventDateTime(year: 2026, month: 11, day: 30, hour: 15),
      );

      expect(items.first.payload['validUntil'], _spMidnight(2026, 12, 1));
    });

    test('Focus usa o dia de São Paulo mesmo com o relógio em UTC', () {
      // 01h UTC do dia 21 ainda é 22h do dia 20 em São Paulo.
      final items = buildAthleteQuickActions(
        signedIn: true,
        role: AppMobileRole.athlete,
        focus: _focus,
        now: DateTime.utc(2026, 11, 21, 1),
      );

      expect(items.first.payload['validUntil'], _spMidnight(2026, 11, 21));
    });

    test('torneio sem nome mostra só "Hoje"', () {
      final items = _build(
        focus: const AthleteFocusHomeTarget(
          tournamentId: 'cup-1',
          tournamentName: ' ',
        ),
      );

      expect(items.first.subtitle, 'Hoje');
    });

    test('Mensagens conta as não lidas no subtítulo', () {
      expect(_build(unreadMessages: 1).last.subtitle, '1 não lida');
      expect(_build(unreadMessages: 3).last.subtitle, '3 não lidas');
      expect(_build(unreadMessages: 150).last.subtitle, '99+ não lidas');
      expect(_build(unreadMessages: -1).last.subtitle, isNull);
    });

    test('nunca passa de 4 itens, o limite do iOS', () {
      final cases = [
        _build(),
        _build(nextBooking: _booking(), unreadMessages: 5),
        _build(focus: _focus, nextBooking: _booking(), unreadMessages: 5),
      ];
      for (final items in cases) {
        expect(items.length, lessThanOrEqualTo(4));
      }
    });
  });

  group('resolveAthleteQuickAction', () {
    QuickActionDestination? resolve(
      AthleteQuickAction action, [
      Map<String, String> payload = const {},
    ]) {
      return resolveAthleteQuickAction(
        type: action.type,
        payload: payload,
        now: _now,
      );
    }

    test('Reservar abre a aba Reservar', () {
      final dest = resolve(AthleteQuickAction.reservar)!;
      expect(dest.path, '/discover?tab=reservar');
      expect(dest.shellTabIndex, athleteShellReservarTabIndex);
    });

    test('Agenda abre a aba Agenda', () {
      final dest = resolve(AthleteQuickAction.agenda)!;
      expect(dest.path, '/discover?tab=agenda');
      expect(dest.shellTabIndex, athleteShellAgendaTabIndex);
    });

    test('Torneios abre o Hub', () {
      final dest = resolve(AthleteQuickAction.torneios)!;
      expect(dest.path, '/discover?tab=torneios');
      expect(dest.shellTabIndex, athleteShellCompeteTabIndex);
    });

    test('Mensagens abre a caixa de entrada', () {
      final dest = resolve(AthleteQuickAction.mensagens)!;
      expect(dest.path, '/mensagens');
      expect(dest.shellTabIndex, isNull);
    });

    test('reserva ainda válida abre o detalhe da reserva', () {
      final dest = resolve(AthleteQuickAction.booking, {
        'bookingId': 'bk-1',
        'validUntil': _now
            .add(const Duration(hours: 1))
            .millisecondsSinceEpoch
            .toString(),
      })!;
      expect(dest.path, '/booking/bk-1/details');
      expect(dest.shellTabIndex, isNull);
    });

    test('reserva que já passou cai na Agenda', () {
      final dest = resolve(AthleteQuickAction.booking, {
        'bookingId': 'bk-1',
        'validUntil': _now.millisecondsSinceEpoch.toString(),
      })!;
      expect(dest.path, '/discover?tab=agenda');
    });

    test('reserva sem id ou sem validade cai na Agenda', () {
      expect(
        resolve(AthleteQuickAction.booking, {'validUntil': '9999999999999'})!
            .path,
        '/discover?tab=agenda',
      );
      expect(
        resolve(AthleteQuickAction.booking, {'bookingId': 'bk-1'})!.path,
        '/discover?tab=agenda',
      );
    });

    test('Focus no mesmo dia abre o Modo Focus do torneio', () {
      final dest = resolve(AthleteQuickAction.focus, {
        'tournamentId': 'cup-1',
        'validUntil': DateTime(2026, 11, 21).millisecondsSinceEpoch.toString(),
      })!;
      expect(dest.path, '/torneios/cup-1/focus');
      expect(dest.shellTabIndex, isNull);
    });

    test('Focus de outro dia cai em Torneios', () {
      final dest = resolve(AthleteQuickAction.focus, {
        'tournamentId': 'cup-1',
        'validUntil': DateTime(2026, 11, 20).millisecondsSinceEpoch.toString(),
      })!;
      expect(dest.path, '/discover?tab=torneios');
      expect(dest.shellTabIndex, athleteShellCompeteTabIndex);
    });

    test('ids com caracteres especiais vão codificados no caminho', () {
      final dest = resolve(AthleteQuickAction.booking, {
        'bookingId': 'a/b',
        'validUntil': '9999999999999',
      })!;
      expect(dest.path, '/booking/a%2Fb/details');
    });

    test('tipo desconhecido não navega', () {
      expect(
        resolveAthleteQuickAction(
          type: 'outro.app.acao',
          payload: const {},
          now: _now,
        ),
        isNull,
      );
    });
  });

  group('QuickActionItem.toChannelMap', () {
    test('leva tudo que o lado nativo precisa', () {
      const item = QuickActionItem(
        type: 'nexago.reservar',
        title: 'Reservar quadra',
        sfSymbol: 'plus.circle',
        payload: {'a': 'b'},
      );

      expect(item.toChannelMap(), {
        'type': 'nexago.reservar',
        'title': 'Reservar quadra',
        'subtitle': null,
        'icon': 'plus.circle',
        'payload': {'a': 'b'},
      });
    });
  });
}
