import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/story_share/organizer_story_share.dart';
import 'package:nexago_app/features/organizer/domain/story_share/organizer_story_share_providers.dart';
import 'package:nexago_app/features/organizer/presentation/story_share/organizer_story_share_page.dart';

/// PNG 1×1 válido: a prévia decodifica de verdade.
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

OrganizerStoryShare _share({int pages = 2, String? link = 'https://organizador.nexago.app/t/copa'}) {
  return OrganizerStoryShare(
    id: 's1',
    tournamentId: 't1',
    tournamentName: 'Copa Verão',
    categoryName: 'Feminino Open',
    unitLabel: 'duplas',
    pagePaths: [for (var i = 1; i <= pages; i++) 'storyShares/u1/t1/s1/$i.png'],
    link: link,
    expiresAt: DateTime.now().add(const Duration(days: 6)),
  );
}

/// Lançador falso da folha nativa: registra o arquivo e devolve o que o teste mandar.
class _Launcher {
  final calls = <String>[];
  bool chooseDestination = true;

  Future<bool> call(BuildContext context, Uint8List png, String fileName) async {
    calls.add(fileName);
    return chooseDestination;
  }
}

Future<List<String>> _pump(
  WidgetTester tester, {
  required _Launcher launcher,
  OrganizerStoryShare? share,
  bool autoShare = true,
  int downloaded = 2,
}) async {
  // Tela de celular: a prévia 9:16 e o progresso cabem sem rolar.
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final clipboard = <String>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    SystemChannels.platform,
    (call) async {
      if (call.method == 'Clipboard.setData') {
        clipboard.add((call.arguments as Map)['text'] as String);
      }
      return null;
    },
  );
  addTearDown(() => tester.binding.defaultBinaryMessenger
      .setMockMethodCallHandler(SystemChannels.platform, null));

  final router = GoRouter(
    initialLocation: '/organizer/tournaments/t1/stories/s1',
    routes: [
      GoRoute(
        path: '/organizer/tournaments/:tournamentId',
        builder: (_, _) => const Scaffold(body: Text('Torneio')),
        routes: [
          GoRoute(
            path: 'stories/:shareId',
            builder: (_, state) => OrganizerStorySharePage(
              shareId: state.pathParameters['shareId']!,
              autoShare: autoShare,
            ),
          ),
        ],
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        organizerStoryShareProvider.overrideWith((ref, id) => Stream.value(share)),
        organizerStorySharePagesProvider
            .overrideWith((ref, id) async => [for (var i = 0; i < downloaded; i++) _png]),
        organizerStoryLauncherProvider.overrideWithValue(launcher.call),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
  return clipboard;
}

void main() {
  testWidgets('abre direto a folha com o 1º story e copia o link para a figurinha', (tester) async {
    final launcher = _Launcher();
    final clipboard = await _pump(tester, launcher: launcher, share: _share());

    expect(find.text('Duplas inscritas'), findsOneWidget);
    expect(find.text('Copa Verão · Feminino Open'), findsOneWidget);
    expect(launcher.calls, isEmpty, reason: 'espera a transição da rota');

    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump();

    expect(launcher.calls, ['nexago-story-1-de-2.png']);
    expect(clipboard, ['https://organizador.nexago.app/t/copa']);
    expect(find.text('1 de 2 stories enviados'), findsOneWidget);
    expect(find.text('Postar story 2/2'), findsOneWidget);
  });

  testWidgets('um story por toque, na ordem, até "Concluir" voltar ao torneio', (tester) async {
    final launcher = _Launcher();
    await _pump(tester, launcher: launcher, share: _share(), autoShare: false);

    expect(find.text('Postar story 1/2'), findsOneWidget);
    await tester.tap(find.byKey(const Key('organizer-story-post')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('organizer-story-post')));
    await tester.pump();

    expect(launcher.calls, ['nexago-story-1-de-2.png', 'nexago-story-2-de-2.png']);
    expect(find.text('2 stories enviados'), findsOneWidget);

    await tester.tap(find.text('Concluir'));
    await tester.pumpAndSettle();
    expect(find.text('Torneio'), findsOneWidget);
  });

  testWidgets('fechar a folha sem escolher destino não conta o story', (tester) async {
    final launcher = _Launcher()..chooseDestination = false;
    await _pump(tester, launcher: launcher, share: _share(), autoShare: false);

    await tester.tap(find.byKey(const Key('organizer-story-post')));
    await tester.pump();

    expect(launcher.calls, hasLength(1));
    expect(find.text('Postar story 1/2'), findsOneWidget);
    expect(find.byKey(const Key('organizer-story-progress')), findsNothing);
  });

  testWidgets('sem link (inscrições fechadas): sem figurinha e nada copiado', (tester) async {
    final launcher = _Launcher();
    final clipboard = await _pump(
      tester,
      launcher: launcher,
      share: _share(pages: 1, link: null),
      downloaded: 1,
      autoShare: false,
    );

    expect(find.byKey(const Key('organizer-story-copy-link')), findsNothing);
    await tester.tap(find.text('Postar no story'));
    await tester.pump();
    expect(clipboard, isEmpty);
    expect(find.text('Story enviado'), findsOneWidget);
  });

  testWidgets('envio apagado ou vencido: artes indisponíveis, sem botão', (tester) async {
    final launcher = _Launcher();
    await _pump(tester, launcher: launcher, share: null);

    expect(find.text('Artes indisponíveis'), findsOneWidget);
    expect(find.byKey(const Key('organizer-story-post')), findsNothing);
    await tester.pump(const Duration(seconds: 1));
    expect(launcher.calls, isEmpty);
  });
}
