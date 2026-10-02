import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/location/br_locations_data.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/data/organizer_public_profile_editor_repository.dart';
import 'package:nexago_app/features/organizer/domain/public_profile/organizer_profile_editor_logic.dart';
import 'package:nexago_app/features/organizer/domain/public_profile/organizer_profile_editor_providers.dart';
import 'package:nexago_app/features/organizer/presentation/public_profile/organizer_public_profile_editor_page.dart';

const _uid = 'org-1';

class _FakeEditorRepository implements OrganizerPublicProfileEditorRepository {
  final saved = <Map<String, Object>>[];

  @override
  Future<void> save(String uid, Map<String, Object> update) async {
    saved.add(update);
  }

  @override
  Future<String> uploadLogo(String uid, Uint8List jpegBytes) async =>
      'https://x/novo-logo.jpg';

  @override
  Future<String> uploadCover(String uid, Uint8List jpegBytes) async =>
      'https://x/nova-capa.jpg';

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<_FakeEditorRepository> _pump(
  WidgetTester tester,
  OrganizerProfileSource source,
) async {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(430, 2600);
  addTearDown(tester.view.reset);
  final repository = _FakeEditorRepository();
  // A lista de municípios vem de um asset: carregada fora do relógio falso, fica em cache e o
  // campo de UF/cidade não gira para sempre.
  await tester.runAsync(BrLocationsData.load);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        organizerEditorUidProvider.overrideWithValue(_uid),
        organizerProfileSourceProvider.overrideWith(
          (ref) => Stream.value(source),
        ),
        organizerPublicProfileEditorRepositoryProvider.overrideWithValue(
          repository,
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const OrganizerPublicProfileEditorPage(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return repository;
}

Finder _field(String hint) => find.widgetWithText(TextFormField, hint);

Future<void> _tapSave(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Salvar perfil'));
  await tester.tap(find.text('Salvar perfil'));
  await tester.pumpAndSettle();
}

FilledButton _saveButton(WidgetTester tester) => tester.widget<FilledButton>(
  find.ancestor(
    of: find.text('Salvar perfil'),
    matching: find.byType(FilledButton),
  ),
);

const _complete = OrganizerProfileSource(
  orgName: 'Liga Amadora Goiânia',
  bio: 'Ligas de areia.',
  city: 'Goiânia',
  state: 'GO',
  contactPhone: '62999990000',
  publicWhatsapp: true,
  coverUrl: 'https://x/cover.jpg',
);

void main() {
  testWidgets('preenche com o doc, mostra a prévia e o contador da bio', (
    tester,
  ) async {
    await _pump(tester, _complete);

    expect(find.text('Liga Amadora Goiânia'), findsWidgets);
    expect(find.text('Ligas de areia.'), findsOneWidget);
    expect(find.text('15/280'), findsOneWidget);
    expect(find.text('Goiânia · GO'), findsOneWidget);
    expect(find.text('Ver meu perfil'), findsOneWidget);
    // Nada mudou: salvar desligado.
    expect(_saveButton(tester).onPressed, isNull);
  });

  testWidgets('nome curto barra o save e mostra o erro', (tester) async {
    final repository = await _pump(tester, _complete);

    await tester.enterText(_field('Liga Amadora Goiânia'), 'A');
    await tester.pump();
    await _tapSave(tester);

    expect(find.text('Use pelo menos 2 caracteres.'), findsOneWidget);
    expect(repository.saved, isEmpty);
  });

  testWidgets('salvar manda só o campo alterado, por caminho pontilhado', (
    tester,
  ) async {
    final repository = await _pump(tester, _complete);

    await tester.enterText(find.text('Ligas de areia.'), 'Nova bio');
    await tester.pump();
    expect(_saveButton(tester).onPressed, isNotNull);
    await _tapSave(tester);

    expect(repository.saved, [
      {'organizerProfile.bio': 'Nova bio'},
    ]);
    expect(find.textContaining('Perfil público salvo'), findsOneWidget);
  });

  testWidgets('remover a capa grava FieldValue.delete()', (tester) async {
    final repository = await _pump(tester, _complete);

    await tester.ensureVisible(find.text('Remover capa'));
    await tester.tap(find.text('Remover capa'));
    await tester.pump();
    expect(find.text('Remover capa'), findsNothing);
    await _tapSave(tester);

    expect(repository.saved, [
      {'organizerProfile.coverUrl': FieldValue.delete()},
    ]);
  });

  testWidgets('sem telefone o switch do WhatsApp fica desligado e travado', (
    tester,
  ) async {
    await _pump(
      tester,
      const OrganizerProfileSource(orgName: 'Liga Amadora Goiânia'),
    );

    final switchFinder = find.byKey(
      const ValueKey('organizer-public-whatsapp-switch'),
    );
    await tester.ensureVisible(switchFinder);
    var tile = tester.widget<SwitchListTile>(switchFinder);
    expect(tile.onChanged, isNull);
    expect(tile.value, isFalse);
    expect(
      find.text('Preencha o telefone de contato para ligar.'),
      findsOneWidget,
    );

    await tester.enterText(_field('(62) 99999-9999'), '(62) 98888-7777');
    await tester.pump();
    tile = tester.widget<SwitchListTile>(switchFinder);
    expect(tile.onChanged, isNotNull);
  });

  testWidgets('ligar o WhatsApp com telefone novo grava os dois campos', (
    tester,
  ) async {
    final repository = await _pump(
      tester,
      const OrganizerProfileSource(orgName: 'Liga Amadora Goiânia'),
    );

    await tester.enterText(_field('(62) 99999-9999'), '(62) 98888-7777');
    await tester.pump();
    final switchFinder = find.byKey(
      const ValueKey('organizer-public-whatsapp-switch'),
    );
    await tester.ensureVisible(switchFinder);
    await tester.tap(switchFinder);
    await tester.pump();
    await _tapSave(tester);

    expect(repository.saved, [
      {
        'organizerProfile.contactPhone': '62988887777',
        'organizerProfile.publicWhatsapp': true,
      },
    ]);
  });

  testWidgets('telefone incompleto barra o save', (tester) async {
    final repository = await _pump(tester, _complete);

    await tester.enterText(find.text('62999990000'), '6299');
    await tester.pump();
    await _tapSave(tester);

    expect(
      find.text('Informe o telefone com DDD (10 ou 11 dígitos).'),
      findsOneWidget,
    );
    expect(repository.saved, isEmpty);
  });
}
