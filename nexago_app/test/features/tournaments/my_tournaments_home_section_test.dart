// Cobertura do "gap condicional" adicionado a MyTournamentsHomeSection: a
// seção só fica com altura zero (sem SizedBox de gap) quando as inscrições
// JÁ resolveram (AsyncData) e tanto a prévia de inscrições quanto o staff
// estão vazios (`isConfirmedEmpty`). Enquanto carrega ou dá erro, sempre há
// algo visível (skeleton, aviso de erro ou linha de staff) — e portanto o
// gap reservado.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_models.dart';
import 'package:nexago_app/features/tournaments/data/my_tournament_registrations_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/my_tournaments_home_section.dart';

const _staffEntry = MyTournamentStaffEntry(
  tournamentId: 't-staff',
  role: TournamentStaffRole.manager,
  status: 'active',
  tournamentName: 'Torneio Staff',
);

MyTournamentRegistration _reg(String id) => MyTournamentRegistration(
      registrationId: 'reg-$id',
      tournamentId: id,
      tournamentName: 'Torneio $id',
      dateLabel: '25/05',
      statusLabel: 'Inscrito',
      isPaid: true,
      categoryId: 'cat1',
      listingStatus: TournamentListingStatus.open,
    );

Future<Size> _pumpSection(
  WidgetTester tester, {
  required Stream<List<MyTournamentRegistration>> regs,
  List<MyTournamentStaffEntry> staff = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        myTournamentRegistrationsProvider.overrideWith((ref) => regs),
        myOngoingTournamentStaffEntriesProvider.overrideWith((ref) => staff),
      ],
      child: const MaterialApp(
        home: Scaffold(body: MyTournamentsHomeSection()),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return tester.getSize(find.byType(MyTournamentsHomeSection));
}

void main() {
  group('MyTournamentsHomeSection — gap condicional', () {
    testWidgets(
      'confirmado vazio (sem inscrições e sem staff): colapsa sem gap',
      (tester) async {
        final size = await _pumpSection(
          tester,
          regs: Stream.value(const []),
        );

        expect(size, Size.zero);
        expect(find.text('Meus torneios'), findsNothing);
      },
    );

    testWidgets(
      'com inscrição: mostra a seção e reserva o gap ao final',
      (tester) async {
        final size = await _pumpSection(
          tester,
          regs: Stream.value([_reg('t1')]),
        );

        expect(size.height, greaterThan(0));
        expect(find.text('Meus torneios'), findsOneWidget);
        expect(find.text('Torneio t1'), findsOneWidget);
      },
    );

    testWidgets(
      'só staff (sem inscrição): seção aparece mesmo com registrations vazio',
      (tester) async {
        final size = await _pumpSection(
          tester,
          regs: Stream.value(const []),
          staff: const [_staffEntry],
        );

        expect(size.height, greaterThan(0));
        expect(find.text('Meus torneios'), findsOneWidget);
        expect(find.text('Torneio Staff'), findsOneWidget);
      },
    );

    testWidgets(
      'carregando (sem staff conhecido): mostra skeleton, nunca colapsa',
      (tester) async {
        // Stream que nunca emite — provider fica em AsyncLoading.
        final controller = StreamController<List<MyTournamentRegistration>>();
        addTearDown(controller.close);

        final size = await _pumpSection(tester, regs: controller.stream);

        expect(size.height, greaterThan(0));
        expect(find.text('Meus torneios'), findsOneWidget);
      },
    );

    testWidgets(
      'erro sem staff: mostra aviso e reserva o gap',
      (tester) async {
        final size = await _pumpSection(
          tester,
          regs: Stream.error(Exception('boom')),
        );

        expect(size.height, greaterThan(0));
        expect(
          find.text('Não foi possível carregar seus torneios.'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'erro com staff conhecido: mostra staff em vez do aviso de erro',
      (tester) async {
        final size = await _pumpSection(
          tester,
          regs: Stream.error(Exception('boom')),
          staff: const [_staffEntry],
        );

        expect(size.height, greaterThan(0));
        expect(find.text('Torneio Staff'), findsOneWidget);
        expect(
          find.text('Não foi possível carregar seus torneios.'),
          findsNothing,
        );
      },
    );
  });

  group('MyTournamentsHomeSection — BUG conhecido (flicker de layout)', () {
    testWidgets(
      'atleta só-staff: a seção colapsa (Size.zero) e depois reaparece se o '
      'stream de staff resolver DEPOIS do stream de inscrições — isConfirmedEmpty '
      '(my_tournaments_home_section.dart:33-37) só olha o AsyncValue de '
      'regsAsync, ignorando se myTournamentStaffEntriesProvider ainda está '
      'carregando. Reprodução: ver relatório do QA / my_tournaments_home_section.dart.',
      (tester) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              myTournamentRegistrationsProvider.overrideWith(
                (ref) => Stream.value(const <MyTournamentRegistration>[]),
              ),
              // Staff real (StreamProvider cru) chega só depois de 50ms —
              // isConfirmedEmpty não espera por ele.
              myTournamentStaffEntriesProvider.overrideWith(
                (ref) => Stream.fromFuture(
                  Future.delayed(
                    const Duration(milliseconds: 50),
                    () => const [_staffEntry],
                  ),
                ),
              ),
            ],
            child: const MaterialApp(
              home: Scaffold(body: MyTournamentsHomeSection()),
            ),
          ),
        );

        await tester.pump();
        // Deixa o stream de inscrições (síncrono) resolver, mas NÃO os 50ms
        // do stream de staff.
        await tester.pump(const Duration(milliseconds: 1));

        final collapsedSize =
            tester.getSize(find.byType(MyTournamentsHomeSection));

        await tester.pump(const Duration(milliseconds: 60));
        await tester.pump();

        final finalSize =
            tester.getSize(find.byType(MyTournamentsHomeSection));

        // Comportamento ATUAL (bug): a seção colapsa para Size.zero e depois
        // "pula" para o tamanho final quando o staff chega — layout shift
        // visível para qualquer atleta que seja staff mas não tenha
        // inscrição própria. O ideal seria nunca colapsar enquanto o staff
        // ainda não resolveu.
        expect(collapsedSize, Size.zero);
        expect(finalSize.height, greaterThan(0));
      },
      skip: true,
    );
  });
}
