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
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_agenda_page.dart';

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

/// Reserva confirmada hoje, ainda por jogar.
AthleteAgendaItem _rentalToday() {
  final now = DateTime.now();
  final start = DateTime(now.year, now.month, now.day, 12);
  return AthleteAgendaItem(
    id: 'rental-today',
    kind: AthleteAgendaItemKind.rental,
    startsAt: start,
    endsAt: start.add(const Duration(hours: 1)),
    title: 'Arena Orla',
    subtitle: 'Quadra 2',
    statusLabel: 'CONFIRMADA',
    accentColor: AppColors.brand,
    rental: AthleteAgendaRentalPayload(
      bookingId: 'b-today',
      arenaName: 'Arena Orla',
      courtName: 'Quadra 2',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      rawStatus: 'confirmed',
      confirmedParticipants: 4,
      stage: AthleteAgendaBookingStage.future,
    ),
  );
}

/// Jogo do Bora Jogar hoje: é ele que o chip "Desafios" filtra.
AthleteAgendaItem _friendlyToday() {
  final now = DateTime.now();
  return AthleteAgendaItem(
    id: 'friendly-today',
    kind: AthleteAgendaItemKind.friendlyMatch,
    startsAt: DateTime(now.year, now.month, now.day, 18),
    title: 'Jogo com Bruno',
    subtitle: 'Bora Jogar',
    statusLabel: 'CONFIRMADO',
    accentColor: athleteAgendaFriendlyMatchAccent,
    friendlyMatch: const AthleteAgendaFriendlyMatchPayload(
      matchId: 'm1',
      otherName: 'Bruno',
    ),
  );
}

Future<void> _pumpAgenda(
  WidgetTester tester, {
  Stream<List<MyBookingItem>>? bookings,
  List<AthleteAgendaItem> items = const [],
  List<AthleteAgendaNeedsYouItem> needsYou = const [],
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
        athleteAgendaNeedsYouProvider.overrideWith((ref) => needsYou),
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

  testWidgets('convite de dupla pendente aparece em "Precisa de você"', (
    tester,
  ) async {
    await _pumpAgenda(
      tester,
      needsYou: const [
        AthleteAgendaNeedsYouItem(
          id: 'invite-inv-1',
          kind: AthleteAgendaNeedsYouKind.partnerInvite,
          title: 'Lucas convidou você',
          subtitle: 'Torneio · dupla',
          meta: 'Responda antes do prazo',
          statusLabel: 'CONVITE PENDENTE',
          inviteId: 'inv-1',
        ),
      ],
    );

    expect(find.text('Precisa de você'), findsOneWidget);
    expect(find.text('Lucas convidou você'), findsOneWidget);
  });

  testWidgets('sem pendência, "Precisa de você" não aparece', (tester) async {
    await _pumpAgenda(tester);

    expect(find.text('Precisa de você'), findsNothing);
  });

  testWidgets('sem jogo do Bora Jogar no dia, o chip "Desafios" some', (
    tester,
  ) async {
    await _pumpAgenda(tester, items: [_rentalToday()]);

    expect(find.text('Tudo'), findsOneWidget);
    // O chip fica no fim de uma fileira rolável: procura fora da tela também.
    expect(find.text('Desafios', skipOffstage: false), findsNothing);
  });

  testWidgets('com jogo do Bora Jogar no dia, o chip "Desafios" aparece', (
    tester,
  ) async {
    await _pumpAgenda(tester, items: [_rentalToday(), _friendlyToday()]);

    expect(find.text('Desafios', skipOffstage: false), findsOneWidget);
  });
}
