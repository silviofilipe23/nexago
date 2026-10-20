import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/arena_class_enrollment_repository.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_enroll_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_student_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/widgets/arena_class_atoms.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';

import 'arena_class_fixtures.dart';
import 'aulas_pump.dart';
import 'fake_arena_class_enrollment_repository.dart';
import 'fake_arena_class_repository.dart';

const _accountHint =
    'Telefone do cadastro do atleta no NexaGO — confira antes de cobrar.';
const _defaultHint = 'Usado no "Cobrar" das mensalidades.';

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

/// Busca só pelos atletas da lista (sem Firestore).
class _FakeUsersRepository implements UsersRepository {
  _FakeUsersRepository(this.athletes);

  final List<AppUserProfile> athletes;

  @override
  Future<List<AppUserProfile>> searchAthletesByKeywords(
    String term, {
    int max = 25,
  }) async =>
      athletes
          .where((a) =>
              (a.fullName ?? '').toLowerCase().contains(term.toLowerCase()))
          .toList();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

final _athletes = _FakeUsersRepository(const [
  AppUserProfile(uid: 'u1', fullName: 'Carla Dias'),
  AppUserProfile(uid: 'u2', fullName: 'Bruno Lima'),
]);

FakeArenaClassRepository _classes() => FakeArenaClassRepository(
      classes: [
        arenaClass(
          id: 'c2',
          name: 'Intermediário B',
          weekdays: const [2, 4],
          start: '19:00',
          capacity: 6,
        ),
      ],
    );

Future<void> _pumpEnroll(
  WidgetTester tester,
  FakeArenaClassEnrollmentRepository enrollmentRepo, {
  ArenaClassEnrollSeed? seed,
}) =>
    pumpAulas(
      tester,
      repo: _classes(),
      enrollmentRepo: enrollmentRepo,
      initial: '/arena/classes/enroll',
      extra: seed,
      overrides: [usersRepositoryProvider.overrideWithValue(_athletes)],
    );

Future<void> _pick(WidgetTester tester, String name) async {
  await tester.enterText(find.byType(TextField), name.split(' ').first);
  // Debounce da busca (350 ms) + resultado.
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump();
  await tester.tap(find.text(name));
  await _settle(tester);
}

Future<void> _switchStudent(WidgetTester tester) async {
  await tester.tap(find.text('Trocar aluno'));
  await _settle(tester);
}

/// O "x" do visualizador (a chamada também tem "x" de marcar falta).
final _closeViewer = find.descendant(
  of: find.byType(ProfilePhotoViewer),
  matching: find.byIcon(Icons.close_rounded),
);

String _phone(WidgetTester tester, {int index = 0}) =>
    tester.widget<TextField>(find.byType(TextField).at(index)).controller!.text;

void main() {
  group('Matrícula · telefone do cadastro', () {
    testWidgets(
        'atleta escolhido vem com o telefone do cadastro e o aviso; editar '
        'tira o aviso', (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        contactPhones: const {'u1': '+5562982406456'},
      );
      await _pumpEnroll(tester, enrollmentRepo);

      await _pick(tester, 'Carla Dias');

      expect(enrollmentRepo.contactCalls, [('a1', 'u1')]);
      expect(_phone(tester), '(62) 98240-6456');
      expect(find.text(_accountHint), findsOneWidget);

      await tester.enterText(find.byType(TextField), '62933334444');
      await tester.pump();
      expect(_phone(tester), '(62) 93333-4444');
      expect(find.text(_accountHint), findsNothing);
      expect(find.text(_defaultHint), findsOneWidget);
    });

    testWidgets('trocar de atleta troca o número do cadastro; o digitado fica',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        contactPhones: const {
          'u1': '+5562982406456',
          'u2': '62 99999 1111',
        },
      );
      await _pumpEnroll(tester, enrollmentRepo);

      await _pick(tester, 'Carla Dias');
      expect(_phone(tester), '(62) 98240-6456');

      await _switchStudent(tester);
      await _pick(tester, 'Bruno Lima');
      expect(_phone(tester), '(62) 99999-1111');
      expect(find.text(_accountHint), findsOneWidget);

      // O que a arena digitou não é do cadastro: sobrevive à troca.
      await tester.enterText(find.byType(TextField), '11988887777');
      await tester.pump();
      await _switchStudent(tester);
      await _pick(tester, 'Carla Dias');
      expect(_phone(tester), '(11) 98888-7777');
      expect(find.text(_accountHint), findsNothing);
      expect(enrollmentRepo.contactCalls.map((c) => c.$2), ['u1', 'u2']);
    });

    testWidgets('resposta atrasada do atleta anterior não sobrescreve',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        contactPhones: const {'u2': '62999991111'},
      );
      final slow = Completer<String?>();
      enrollmentRepo.contactGates['u1'] = slow;
      await _pumpEnroll(tester, enrollmentRepo);

      await _pick(tester, 'Carla Dias');
      expect(_phone(tester), isEmpty);

      await _switchStudent(tester);
      await _pick(tester, 'Bruno Lima');
      expect(_phone(tester), '(62) 99999-1111');

      slow.complete('+5562982406456');
      await _settle(tester);
      expect(_phone(tester), '(62) 99999-1111');
      expect(find.text(_accountHint), findsOneWidget);
    });

    testWidgets('"Sem conta" não leva o número do cadastro', (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        contactPhones: const {'u1': '+5562982406456'},
      );
      await _pumpEnroll(tester, enrollmentRepo);

      await _pick(tester, 'Carla Dias');
      expect(_phone(tester), '(62) 98240-6456');
      await _switchStudent(tester);
      await tester.tap(find.text('Cadastrar aluno sem conta'));
      await _settle(tester);

      // Nome e telefone do aluno sem conta.
      expect(find.byType(TextField), findsNWidgets(2));
      expect(_phone(tester, index: 1), isEmpty);
      expect(find.text(_accountHint), findsNothing);
    });

    testWidgets('cadastro sem telefone, ou curto demais, deixa o campo vazio',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        contactPhones: const {'u2': '98240-6456'},
      );
      await _pumpEnroll(tester, enrollmentRepo);

      await _pick(tester, 'Carla Dias');
      expect(_phone(tester), isEmpty);
      await _switchStudent(tester);
      await _pick(tester, 'Bruno Lima');
      expect(_phone(tester), isEmpty);
      expect(find.text(_defaultHint), findsOneWidget);
      // Telefone em branco segue opcional: o servidor usa o do cadastro.
      expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Continuar'))
            .onPressed,
        isNotNull,
      );
    });

    testWidgets('pela ficha: atleta sem telefone guardado busca o do cadastro',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        contactPhones: const {'u7': '+5562982406456'},
      );
      await _pumpEnroll(
        tester,
        enrollmentRepo,
        seed: const ArenaClassEnrollSeed(
          athleteId: 'u7',
          studentId: 'u7',
          name: 'Paula Reis',
        ),
      );
      await _settle(tester);

      expect(enrollmentRepo.contactCalls, [('a1', 'u7')]);
      expect(_phone(tester), '(62) 98240-6456');
      expect(find.text(_accountHint), findsOneWidget);
    });

    testWidgets('pela ficha: telefone guardado do aluno fica', (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        contactPhones: const {'u7': '+5562982406456'},
      );
      await _pumpEnroll(
        tester,
        enrollmentRepo,
        seed: const ArenaClassEnrollSeed(
          athleteId: 'u7',
          studentId: 'u7',
          name: 'Paula Reis',
          phone: '62988887777',
        ),
      );
      await _settle(tester);

      expect(enrollmentRepo.contactCalls, isEmpty);
      expect(_phone(tester), '(62) 98888-7777');
      expect(find.text(_defaultHint), findsOneWidget);
    });
  });

  group('Matrícula · telefone gravado na confirmação', () {
    const preview = ArenaClassEnrollmentPreview(
      charges: [
        (
          description: 'Mensal 2x/semana · out/2026 (4 de 8 aulas)',
          amountReais: 160,
          dueDate: '2026-10-19',
        ),
      ],
      totalReais: 160,
      enrollmentFeeReais: 0,
    );
    const seed = ArenaClassEnrollSeed(
      athleteId: 'u7',
      studentId: 'u7',
      name: 'Paula Reis',
    );

    Future<void> enroll(WidgetTester tester) async {
      await tester.tap(find.text('Continuar'));
      await _settle(tester);
      await tester.tap(find.text('Mensal 2x/semana'));
      await tester.pump();
      await tester.tap(find.text('Continuar'));
      await _settle(tester);
      await tester.tap(find.textContaining('Ter · 19:00'));
      await tester.tap(find.textContaining('Qui · 19:00'));
      await tester.pump();
      await tester.tap(find.text('Continuar'));
      await _settle(tester);
      await tester.tap(find.text('Matricular'));
      await _settle(tester);
    }

    testWidgets(
        'campo em branco: "Cobrar no WhatsApp" usa o telefone que o '
        'servidor gravou', (tester) async {
      final launched = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/url_launcher'),
        (call) async {
          if (call.method == 'launch') {
            launched.add((call.arguments as Map)['url'] as String);
          }
          return true;
        },
      );
      addTearDown(() => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(
              const MethodChannel('plugins.flutter.io/url_launcher'), null));
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        preview: preview,
        createdPhone: '+5562982406456',
      );
      await _pumpEnroll(tester, enrollmentRepo, seed: seed);
      await enroll(tester);

      expect(enrollmentRepo.created.single.toPayload().containsKey('phone'),
          isFalse);
      expect(find.text('Matrícula feita'), findsOneWidget);
      await tester.tap(find.text('Cobrar no WhatsApp'));
      await _settle(tester);
      expect(launched.single, startsWith('https://wa.me/5562982406456?text='));
    });

    testWidgets('servidor sem o campo e telefone em branco: sem "Cobrar"',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        preview: preview,
      );
      await _pumpEnroll(tester, enrollmentRepo, seed: seed);
      await enroll(tester);

      expect(find.text('Matrícula feita'), findsOneWidget);
      expect(find.text('Cobrar no WhatsApp'), findsNothing);
    });
  });

  group('Foto do aluno ampliada', () {
    Widget wrap(Widget child) => MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(body: Center(child: child)),
        );

    testWidgets('avatar com foto abre a foto inteira com nome e papel',
        (tester) async {
      await tester.pumpWidget(wrap(const ArenaClassAvatar(
        initials: 'CD',
        photoUrl: 'https://x/carla.jpg',
        zoomName: 'Carla Dias',
        zoomMeta: 'Mensal 2x/semana',
      )));

      await tester.tap(find.bySemanticsLabel(RegExp('Ver foto de Carla Dias')));
      await tester.pumpAndSettle();

      final viewer =
          tester.widget<ProfilePhotoViewer>(find.byType(ProfilePhotoViewer));
      expect(viewer.photoUrls, ['https://x/carla.jpg']);
      expect(find.text('ALUNO'), findsOneWidget);
      expect(find.text('Carla Dias'), findsOneWidget);
      expect(find.text('Mensal 2x/semana'), findsOneWidget);
    });

    testWidgets('visualizador sem nome segue só com a foto', (tester) async {
      await tester.pumpWidget(wrap(Builder(
        builder: (context) => TextButton(
          onPressed: () => openProfilePhotoViewer(
            context,
            photoUrls: const ['https://x/a.jpg'],
          ),
          child: const Text('abrir'),
        ),
      )));
      await tester.tap(find.text('abrir'));
      await tester.pumpAndSettle();

      expect(find.byType(ProfilePhotoViewer), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(ProfilePhotoViewer),
          matching: find.byType(Text),
        ),
        findsNothing,
      );
    });

    testWidgets('sem foto, ou sem nome para mostrar, o avatar não amplia',
        (tester) async {
      for (final avatar in const [
        ArenaClassAvatar(initials: 'CD', zoomName: 'Carla Dias'),
        ArenaClassAvatar(
            initials: 'CD', photoUrl: '  ', zoomName: 'Carla Dias'),
        ArenaClassAvatar(initials: 'CD', photoUrl: 'https://x/carla.jpg'),
      ]) {
        await tester.pumpWidget(wrap(avatar));
        expect(find.bySemanticsLabel(RegExp('Ver foto de')), findsNothing);
        await tester.tap(find.byType(ArenaClassAvatar));
        await tester.pumpAndSettle();
        expect(find.byType(ProfilePhotoViewer), findsNothing);
      }
    });

    testWidgets(
        'chamada: tocar no avatar abre a foto, não a ficha; sem foto abre a '
        'ficha', (tester) async {
      await pumpAulas(
        tester,
        role: ArenaStaffRole.recepcao,
        repo: FakeArenaClassRepository(
          sessionsById: {
            's5': session(id: 's5', classId: 'c5'),
          },
          students: [
            student('u1', 'Felipe Rocha',
                athleteId: 'u1',
                planName: 'Mensal 2x/semana',
                photoUrl: 'https://x/felipe.jpg'),
            student('u2', 'Caio Ramos'),
          ],
        ),
        initial: '/arena/classes/session/s5',
      );

      await tester
          .tap(find.bySemanticsLabel(RegExp('Ver foto de Felipe Rocha')));
      await tester.pumpAndSettle();
      expect(find.byType(ProfilePhotoViewer), findsOneWidget);
      expect(find.text('ALUNO'), findsOneWidget);
      expect(find.byType(ArenaClassStudentPage), findsNothing);

      await tester.tap(_closeViewer);
      await tester.pumpAndSettle();
      expect(find.byType(ProfilePhotoViewer), findsNothing);

      // Caio não tem foto: o avatar não é botão e a linha abre a ficha.
      expect(find.bySemanticsLabel(RegExp('Ver foto de Caio')), findsNothing);
      await tester.tap(find.text('CR'));
      await _settle(tester);
      expect(find.byType(ArenaClassStudentPage), findsOneWidget);
    });

    testWidgets('ficha do aluno: foto ampliada e matrícula leva a foto',
        (tester) async {
      await pumpAulas(
        tester,
        role: ArenaStaffRole.recepcao,
        repo: FakeArenaClassRepository(
          classes: [
            arenaClass(id: 'c1', name: 'Iniciante A', weekdays: const [1, 3]),
          ],
          students: [
            student('u1', 'Carla Dias',
                athleteId: 'u1',
                weekdays: const [1, 3],
                photoUrl: 'https://x/carla.jpg'),
          ],
        ),
        enrollmentRepo: FakeArenaClassEnrollmentRepository(
          plans: [plan()],
          contactPhones: const {'u1': '+5562982406456'},
        ),
        // Sem matrícula, a ficha acha o aluno pela turma de onde veio.
        initial: '/arena/classes/student/u1?classId=c1',
      );
      await _settle(tester);

      await tester.tap(find.bySemanticsLabel(RegExp('Ver foto de Carla Dias')));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<ProfilePhotoViewer>(find.byType(ProfilePhotoViewer))
            .photoUrls,
        ['https://x/carla.jpg'],
      );
      await tester.tap(_closeViewer);
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, 'Matricular'));
      await _settle(tester);
      expect(find.text('Quem é o aluno?'), findsOneWidget);
      // A foto vem junto (a ficha segue embaixo na pilha) e o telefone sai
      // do cadastro.
      expect(
        find.descendant(
          of: find.byType(ArenaClassEnrollPage),
          matching: find.bySemanticsLabel(RegExp('Ver foto de Carla Dias')),
        ),
        findsOneWidget,
      );
      expect(_phone(tester), '(62) 98240-6456');
    });
  });
}
