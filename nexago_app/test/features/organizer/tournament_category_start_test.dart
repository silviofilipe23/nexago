import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer/data/tournament_create_mapper.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_session.dart';
import 'package:nexago_app/features/tournaments/data/tournament_document_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';

/// Início da categoria (`startsAt`): opcional, mas quando existe cai dentro do
/// período do torneio — do começo do dia de `startAt` ao fim do dia de `endAt`.
TournamentCreateDraft _draftWith(DateTime? startsAt) => TournamentCreateDraft(
      name: 'Open',
      city: 'Goiânia',
      locationName: 'Arena',
      startAt: DateTime(2026, 11, 14),
      endAt: DateTime(2026, 11, 15),
      categories: [TournamentCategoryDraft(id: 'c1', startsAt: startsAt)],
    );

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  test('janela vai da meia-noite do 1º dia ao fim do último', () {
    final window = categoryStartWindow(_draftWith(null))!;
    expect(window.min, DateTime(2026, 11, 14));
    expect(window.max, DateTime(2026, 11, 15, 23, 59, 59, 999));
  });

  test('sem horário é válido (campo opcional)', () {
    final draft = _draftWith(null);
    expect(categoryStartError(draft.categories.first, draft), isNull);
    expect(canContinueFromStep(draft, TournamentCreateStep.categories), isTrue);
  });

  test('aceita horários dentro do período, inclusive no último dia', () {
    for (final d in [
      DateTime(2026, 11, 14),
      DateTime(2026, 11, 14, 8, 30),
      DateTime(2026, 11, 15, 23, 59),
    ]) {
      final draft = _draftWith(d);
      expect(categoryStartError(draft.categories.first, draft), isNull,
          reason: '$d');
    }
  });

  test('recusa fora do período e trava o passo de categorias', () {
    for (final d in [
      DateTime(2026, 11, 13, 23, 59),
      DateTime(2026, 11, 16),
    ]) {
      final draft = _draftWith(d);
      expect(
        categoryStartError(draft.categories.first, draft),
        contains('14/11 e 15/11'),
      );
      expect(
        canContinueFromStep(draft, TournamentCreateStep.categories),
        isFalse,
      );
    }
  });

  test('copyWith limpa o horário só com clearStartsAt', () {
    final c = TournamentCategoryDraft(id: 'c', startsAt: DateTime(2026, 1, 1));
    expect(c.copyWith(name: 'x').startsAt, DateTime(2026, 1, 1));
    expect(c.copyWith(clearStartsAt: true).startsAt, isNull);
  });

  test('rótulo do início', () {
    expect(
      formatCategoryStartLabel(DateTime(2026, 11, 14, 9, 5)),
      'Sáb, 14/11 · 09:05',
    );
  });

  test('mapper grava Timestamp e lê de volta (roundtrip do array inteiro)', () {
    final startsAt = DateTime(2026, 11, 14, 9);
    final map = TournamentCreateMapper.toFirestore(
      draft: _draftWith(startsAt),
      managerId: 'uid',
      publish: true,
    );
    final category = (map['categories'] as List).first as Map<String, dynamic>;
    expect(category['startsAt'], Timestamp.fromDate(startsAt));

    final back = TournamentCreateMapper.fromFirestore(map, 't1').draft;
    expect(back.categories.first.startsAt, startsAt);
  });

  test('sem horário grava null e categoria legada lê null', () {
    final map = TournamentCreateMapper.toFirestore(
      draft: _draftWith(null),
      managerId: 'uid',
      publish: true,
    );
    final category = (map['categories'] as List).first as Map<String, dynamic>;
    expect(category.containsKey('startsAt'), isTrue);
    expect(category['startsAt'], isNull);
    category.remove('startsAt');
    final back = TournamentCreateMapper.fromFirestore(map, 't1').draft;
    expect(back.categories.first.startsAt, isNull);
  });

  test('rascunho local preserva o horário', () {
    final startsAt = DateTime(2026, 11, 15, 14, 30);
    final session = TournamentCreateSession(
      draft: _draftWith(startsAt),
      currentStep: TournamentCreateStep.categories,
      updatedAt: DateTime(2026, 10, 29),
      managerUid: 'uid',
    );
    final back = TournamentCreateSession.fromJson(session.toJson())!;
    expect(back.draft.categories.first.startsAt, startsAt);
  });

  test('atleta: rótulo do início no card da categoria', () {
    expect(
      formatCategoryStartsAt(DateTime(2026, 11, 15, 14, 30)),
      'Dom, 15/11 · 14:30',
    );
  });

  test('atleta: mapper do detalhe lê startsAt (e null quando ausente)', () {
    final startsAt = DateTime(2026, 11, 14, 9);
    final detail = TournamentDocumentMapper.detailFromMap('t1', {
      'name': 'Copa',
      'categories': [
        {'id': 'a', 'categoryName': 'A', 'startsAt': Timestamp.fromDate(startsAt)},
        {'id': 'b', 'categoryName': 'B'},
      ],
    });
    expect(detail.categoryOffers.first.startsAt, startsAt);
    expect(detail.categoryOffers.last.startsAt, isNull);
  });
}
