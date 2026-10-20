import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/data/class_agenda_repository.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_agenda_page.dart';

ClassChargeEntry _charge(String id, {String payment = 'online'}) =>
    ClassChargeEntry.fromMap({
      'chargeId': id,
      'arenaId': 'arena1',
      'arenaName': 'Arena CFC',
      'description': 'Mensal 2x · Novembro',
      'amountReais': 180,
      'dueDate': '2026-11-05',
      'payment': payment,
      'invoiceUrl': payment == 'online' ? 'https://www.asaas.com/i/$id' : null,
    });

/// `getMyClassCharges` de mentira: devolve [open] e conta as leituras.
class _FakeClassAgendaRepository implements ClassAgendaRepository {
  _FakeClassAgendaRepository(this.open);

  List<ClassChargeEntry> open;
  int reads = 0;

  @override
  Future<List<ClassChargeEntry>> fetchMyCharges() async {
    reads++;
    return open;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future.value(const []);
}

Future<void> _backToApp(WidgetTester tester) async {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  await tester.pump();
}

Future<_FakeClassAgendaRepository> _pumpAgenda(
  WidgetTester tester,
  List<ClassChargeEntry> open,
) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = _FakeClassAgendaRepository(open);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        classAgendaRepositoryProvider.overrideWithValue(repo),
        myBookingsStreamProvider.overrideWith((ref) => Stream.value(const [])),
        athleteAgendaItemsProvider.overrideWith(
          (ref) => const AthleteAgendaPageState(
            allItems: [],
            summary: AthleteAgendaDaySummary(
              totalToday: 0,
              rentalsToday: 0,
              tournamentsToday: 0,
              challengesToday: 0,
            ),
            filterCounts: AthleteAgendaFilterCounts(
              all: 0,
              rentals: 0,
              tournaments: 0,
              challenges: 0,
            ),
          ),
        ),
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
  return repo;
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  testWidgets(
      'volta ao app com fatura em aberto: relê até o webhook dar baixa e '
      'avisa', (tester) async {
    final repo = await _pumpAgenda(tester, [_charge('e1_2026-11')]);
    expect(find.text('Mensalidades a pagar'), findsOneWidget);
    final before = repo.reads;

    // Pagou no navegador e voltou antes do webhook.
    await _backToApp(tester);
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Mensalidades a pagar'), findsOneWidget);
    expect(find.text('Pagamento da mensalidade confirmado.'), findsNothing);

    // O webhook deu baixa: a próxima leitura não traz mais a mensalidade.
    repo.open = const [];
    await tester.pump(const Duration(seconds: 4));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Pagamento da mensalidade confirmado.'), findsOneWidget);
    expect(find.text('Mensalidades a pagar'), findsNothing);
    expect(repo.reads, greaterThan(before + 2));

    // Para de reler depois da baixa.
    final after = repo.reads;
    await tester.pump(const Duration(minutes: 2));
    expect(repo.reads, after);
  });

  testWidgets('só mensalidade manual: a volta ao app não relê', (tester) async {
    final repo = await _pumpAgenda(tester, [
      _charge('e1_fee', payment: 'manual'),
    ]);
    final before = repo.reads;
    await _backToApp(tester);
    await tester.pump(const Duration(minutes: 2));
    expect(repo.reads, before);
  });
}
