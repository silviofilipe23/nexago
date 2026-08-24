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

  group('MyTournamentsHomeSection — fix do flicker de layout', () {
    testWidgets(
      'atleta só-staff: NÃO colapsa (Size.zero) enquanto o stream de staff '
      'ainda não resolveu, mesmo com o stream de inscrições (síncrono) já '
      'tendo emitido vazio — antes, `isConfirmedEmpty` só olhava o AsyncValue '
      'de regsAsync e ignorava se myTournamentStaffEntriesProvider ainda '
      'estava carregando, causando um layout shift de Size.zero → tamanho '
      'final assim que o staff chegava. Agora `staffLoaded` '
      '(myTournamentStaffEntriesProvider.hasValue) trava o colapso até os '
      'dois streams resolverem: mostra o skeleton (com gap reservado) '
      'enquanto o staff ainda não emitiu.',
      (tester) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              myTournamentRegistrationsProvider.overrideWith(
                (ref) => Stream.value(const <MyTournamentRegistration>[]),
              ),
              // Staff real (StreamProvider cru) chega só depois de 50ms —
              // a seção não deve colapsar antes disso.
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

        final pendingSize =
            tester.getSize(find.byType(MyTournamentsHomeSection));

        // Comportamento CORRIGIDO: enquanto o staff ainda não resolveu, a
        // seção mostra o skeleton (header + linhas shimmer) em vez de
        // colapsar — nunca há um frame com Size.zero. As checagens de texto
        // precisam rodar AQUI, antes de avançar o pump — `find.text` lê a
        // árvore de widgets ATUAL, não um snapshot do `pendingSize`.
        expect(pendingSize, isNot(Size.zero));
        expect(pendingSize.height, greaterThan(0));
        expect(find.text('Meus torneios'), findsOneWidget);
        expect(find.text('Torneio Staff'), findsNothing);

        await tester.pump(const Duration(milliseconds: 60));
        await tester.pump();

        final finalSize =
            tester.getSize(find.byType(MyTournamentsHomeSection));

        // `staffLoaded` vira true assim que o staff chega, revelando a linha
        // de staff real no lugar do skeleton.
        expect(finalSize, isNot(Size.zero));
        expect(finalSize.height, greaterThan(0));
        expect(find.text('Torneio Staff'), findsOneWidget);
      },
    );
  });
}
