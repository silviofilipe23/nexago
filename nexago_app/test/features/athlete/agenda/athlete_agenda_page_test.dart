import 'dart:io';

import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/data/class_agenda_repository.dart';
import 'package:nexago_app/features/athlete/domain/agenda/agenda_pendencies.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_agenda_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_month_picker_sheet.dart';
import 'package:nexago_app/features/athlete_billing/domain/athlete_billing.dart';

/// Repositório de aulas vazio: a agenda não depende dele nestes cenários.
class _EmptyClassAgendaRepository implements ClassAgendaRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Future.value(const []);
}

const _noCounts = AthleteAgendaFilterCounts(
  all: 0,
  rentals: 0,
  trainings: 0,
  tournaments: 0,
  challenges: 0,
);
const _noSummary = AthleteAgendaDaySummary(
  totalToday: 0,
  rentalsToday: 0,
  tournamentsToday: 0,
  challengesToday: 0,
);

DateTime _today({int days = 0, int hour = 12}) {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day + days, hour);
}

AthleteAgendaItem _rental(
  String id,
  DateTime start, {
  AthleteAgendaBookingStage stage = AthleteAgendaBookingStage.future,
}) =>
    AthleteAgendaItem(
      id: id,
      kind: AthleteAgendaItemKind.rental,
      startsAt: start,
      endsAt: start.add(const Duration(hours: 1)),
      title: 'Arena $id',
      subtitle: 'Quadra 2',
      statusLabel: 'CONFIRMADA',
      accentColor: AppColors.brand,
      rental: AthleteAgendaRentalPayload(
        bookingId: id,
        arenaName: 'Arena $id',
        courtName: 'Quadra 2',
        startAt: start,
        endAt: start.add(const Duration(hours: 1)),
        rawStatus: 'confirmed',
        confirmedParticipants: 4,
        stage: stage,
      ),
    );

/// Jogo do Bora Jogar: é ele que o chip "Desafios" filtra.
AthleteAgendaItem _friendly(DateTime start) => AthleteAgendaItem(
      id: 'friendly-1',
      kind: AthleteAgendaItemKind.friendlyMatch,
      startsAt: start,
      title: 'Jogo com Bruno',
      subtitle: 'Bora Jogar',
      statusLabel: 'CONFIRMADO',
      accentColor: athleteAgendaFriendlyMatchAccent,
      friendlyMatch: const AthleteAgendaFriendlyMatchPayload(
        matchId: 'm1',
        otherName: 'Bruno',
      ),
    );

AgendaChargePendency _charge(String id, String title) => AgendaChargePendency(
      AthleteCharge(
        id: id,
        kind: AthleteChargeKind.classes,
        title: title,
        payee: 'Arena Orla',
        amountReais: 180,
        state: AthleteChargeState.due,
        target: const TrainingPlansTarget(),
      ),
    );

Future<void> _pumpAgenda(
  WidgetTester tester, {
  Stream<List<MyBookingItem>>? bookings,
  List<AthleteAgendaItem> items = const [],
  List<AgendaPendency> pendencies = const [],
}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        classAgendaRepositoryProvider
            .overrideWithValue(_EmptyClassAgendaRepository()),
        myBookingsStreamProvider.overrideWith(
          (ref) => bookings ?? Stream.value(const []),
        ),
        athleteAgendaItemsProvider.overrideWith(
          (ref) => AthleteAgendaPageState(
            allItems: items,
            summary: _noSummary,
            filterCounts: _noCounts,
          ),
        ),
        athleteAgendaPendenciesProvider.overrideWith((ref) => pendencies),
        athleteUnreadNotificationsCountProvider.overrideWith((ref) => 0),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(body: AthleteAgendaPage()),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

Finder _anywhere(String text) => find.text(text, skipOffstage: false);

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  testWidgets('falha ao carregar mostra frase amigável, nunca o erro cru', (
    tester,
  ) async {
    await _pumpAgenda(
      tester,
      bookings: Stream.error(const SocketException('Failed host lookup')),
    );

    expect(find.textContaining('Sem conexão'), findsOneWidget);
    expect(find.textContaining('SocketException'), findsNothing);
    expect(find.textContaining('Failed host lookup'), findsNothing);
  });

  group('Próximos', () {
    testWidgets('abre no agora e mostra o próximo dia sem precisar tocar', (
      tester,
    ) async {
      // Nada hoje; o jogo é daqui a 3 dias. Antes a tela dizia "Sem jogos
      // marcados" até o atleta caçar o dia na faixa.
      await _pumpAgenda(
        tester,
        items: [_rental('daqui-3-dias', _today(days: 3, hour: 19))],
      );

      expect(_anywhere('Arena daqui-3-dias'), findsOneWidget);
      expect(find.text('Sem jogos marcados.'), findsNothing);
    });

    testWidgets('um bloco por dia, em ordem do relógio', (tester) async {
      await _pumpAgenda(
        tester,
        items: [
          _rental('depois', _today(days: 5, hour: 8)),
          _rental('amanha', _today(days: 1, hour: 19)),
        ],
      );

      final amanha = tester.getTopLeft(_anywhere('Arena amanha')).dy;
      final depois = tester.getTopLeft(_anywhere('Arena depois')).dy;
      expect(amanha, lessThan(depois));
      expect(find.textContaining('Amanhã', skipOffstage: false), findsWidgets);
    });

    testWidgets('sem nada marcado: convite para reservar', (tester) async {
      await _pumpAgenda(tester);

      expect(find.text('Sem jogos marcados.'), findsOneWidget);
      expect(find.text('AGENDA LIVRE'), findsOneWidget);
    });

    testWidgets('o que passou antes de hoje fica fora de Próximos', (
      tester,
    ) async {
      await _pumpAgenda(
        tester,
        items: [
          _rental(
            'semana-passada',
            _today(days: -7, hour: 19),
            stage: AthleteAgendaBookingStage.past,
          ),
        ],
      );

      expect(_anywhere('Arena semana-passada'), findsNothing);
    });
  });

  testWidgets('Histórico agrupa o que passou por mês', (tester) async {
    final lastWeek = _today(days: -7, hour: 19);
    await _pumpAgenda(
      tester,
      items: [
        _rental(
          'semana-passada',
          lastWeek,
          stage: AthleteAgendaBookingStage.past,
        ),
      ],
    );

    await tester.tap(find.text('Histórico'));
    await tester.pump();

    expect(_anywhere('Arena semana-passada'), findsOneWidget);
    final month = DateTime(lastWeek.year, lastWeek.month);
    expect(_anywhere(formatHistoryMonthTitleForTest(month)), findsOneWidget);
  });

  group('Precisa de você', () {
    testWidgets('mostra mensalidade e convite de dupla', (tester) async {
      await _pumpAgenda(
        tester,
        pendencies: [
          _charge('class-e1', 'Mensal 2x · Novembro'),
          const AgendaInvitePendency(inviteId: 'inv-1', inviterName: 'Lucas'),
        ],
      );

      expect(find.text('Precisa de você'), findsOneWidget);
      expect(find.text('Mensal 2x · Novembro'), findsOneWidget);
      expect(
        find.text('Lucas convidou você para um torneio'),
        findsOneWidget,
      );
    });

    testWidgets('mostra 3 e abre o resto em "Ver todas"', (tester) async {
      await _pumpAgenda(
        tester,
        pendencies: [
          for (var i = 1; i <= 5; i++) _charge('c$i', 'Cobrança $i'),
        ],
      );

      expect(find.text('Cobrança 3'), findsOneWidget);
      expect(find.text('Cobrança 4'), findsNothing);

      await tester.tap(find.text('Ver todas (5)'));
      await tester.pump();

      expect(_anywhere('Cobrança 5'), findsOneWidget);
      expect(_anywhere('Mostrar menos'), findsOneWidget);
    });

    testWidgets('sem pendência, a seção não aparece', (tester) async {
      await _pumpAgenda(tester);

      expect(find.text('Precisa de você'), findsNothing);
    });
  });

  group('chips', () {
    testWidgets('"Reservas" no lugar de "Aluguéis"', (tester) async {
      await _pumpAgenda(
        tester,
        items: [_rental('amanha', _today(days: 1, hour: 19))],
      );

      expect(_anywhere('Reservas'), findsOneWidget);
      expect(_anywhere('Aluguéis'), findsNothing);
      expect(_anywhere('RESERVA'), findsOneWidget);
    });

    testWidgets('sem jogo do Bora Jogar, o chip "Desafios" some', (
      tester,
    ) async {
      await _pumpAgenda(
        tester,
        items: [_rental('amanha', _today(days: 1, hour: 19))],
      );

      expect(_anywhere('Desafios'), findsNothing);
    });

    testWidgets('com jogo do Bora Jogar, o chip "Desafios" aparece', (
      tester,
    ) async {
      await _pumpAgenda(
        tester,
        items: [
          _rental('amanha', _today(days: 1, hour: 19)),
          _friendly(_today(days: 2, hour: 18)),
        ],
      );

      expect(_anywhere('Desafios'), findsOneWidget);
    });
  });

  testWidgets('o calendário do topo abre o seletor de data', (tester) async {
    await _pumpAgenda(
      tester,
      items: [_rental('amanha', _today(days: 1, hour: 19))],
    );

    await tester.tap(find.byTooltip('Ir para uma data'));
    await tester.pumpAndSettle();

    expect(find.text('Ir para uma data'), findsWidgets);
    expect(find.text('Assinar no calendário do celular'), findsOneWidget);
  });

  testWidgets('atalho do seletor fecha a folha e abre a assinatura', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    var subscribed = 0;
    DateTime? picked = DateTime(2000);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                picked = await showAgendaMonthPicker(
                  context,
                  items: const [],
                  now: DateTime.now(),
                  onSubscribeCalendar: () => subscribed++,
                );
              },
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('agenda-subscribe-calendar')));
    await tester.pumpAndSettle();

    expect(subscribed, 1);
    expect(picked, isNull);
    expect(find.text('Ir para uma data'), findsNothing);
  });
}

/// Mesmo título que o Histórico usa ("Novembro de 2026").
String formatHistoryMonthTitleForTest(DateTime month) {
  const names = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return '${names[month.month - 1]} de ${month.year}';
}
