import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_notices.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_students.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_notices_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/notices/professor_notice_editor_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/notices/professor_notice_report_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/notices/professor_notice_student_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/notices/professor_notices_page.dart';

import 'professor_agenda_test_support.dart' show agendaNow;
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

/// Apoio dos testes de Comunicados (F1–F5, F7).

ProfessorNotice notice({
  String id = 'n1',
  ProfessorNoticeKind kind = ProfessorNoticeKind.enquete,
  String title = 'Aulão de sábado',
  ProfessorNoticeStatus status = ProfessorNoticeStatus.sent,
  List<String> options = const ['Vou', 'Não vou', 'Talvez'],
  List<String> recipients = const ['ath-1', 'ath-paulo', 'ath-x', 'ath-y'],
  int read = 3,
  Map<int, int> answers = const {0: 2, 1: 1},
  DateTime? sentAt,
  DateTime? scheduledAt,
  DateTime? updatedAt,
  ProfessorNoticeAudience audience =
      const ProfessorNoticeAudience(classIds: ['c1']),
}) =>
    ProfessorNotice(
      id: id,
      kind: kind,
      title: title,
      body: 'Sábado às 10h, aulão aberto.',
      status: status,
      pollOptions: kind == ProfessorNoticeKind.enquete ? options : const [],
      audience: audience,
      professorName: 'Carlos Professor',
      sentAt: sentAt ??
          (status == ProfessorNoticeStatus.sent
              ? DateTime.utc(2026, 10, 19, 23, 10)
              : null),
      scheduledAt: scheduledAt,
      updatedAt: updatedAt ?? DateTime.utc(2026, 10, 19, 12),
      recipientIds:
          status == ProfessorNoticeStatus.sent ? recipients : const [],
      recipientCount:
          status == ProfessorNoticeStatus.sent ? recipients.length : 0,
      readCount: read,
      answers: answers,
    );

/// Repositório em memória: grava as chamadas e muda o estado.
class FakeProfessorNoticesRepository implements ProfessorNoticesRepository {
  FakeProfessorNoticesRepository({
    List<ProfessorNotice>? notices,
    Map<String, List<ProfessorNoticeRecipient>>? recipients,
    this.previewCount = 7,
  })  : notices = notices ?? [],
        recipients = recipients ?? {};

  List<ProfessorNotice> notices;
  Map<String, List<ProfessorNoticeRecipient>> recipients;
  int previewCount;

  /// Respostas do aluno (lado do atleta), por comunicado.
  final myReplies = <String, ProfessorNoticeRecipient>{};
  final saved = <Map<String, Object?>>[];
  final sent = <Map<String, Object?>>[];
  final deleted = <String>[];
  final reminded = <String>[];
  final previews = <Map<String, Object?>>[];
  final responses = <({String noticeId, String? answer})>[];
  final _changes = StreamController<void>.broadcast();

  Stream<T> _watch<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  @override
  Stream<List<ProfessorNotice>> watchMyNotices(String uid) =>
      _watch(() => List.of(notices));

  @override
  Stream<List<ProfessorNoticeRecipient>> watchRecipients(String noticeId) =>
      _watch(() => List.of(recipients[noticeId] ?? const []));

  @override
  Future<String> save(ProfessorNoticeInput input) async {
    saved.add(input.toPayload());
    return input.noticeId ?? 'draft-${saved.length}';
  }

  @override
  Future<ProfessorNoticeSent> send(ProfessorNoticeInput input) async {
    sent.add(input.toPayload());
    final scheduled = input.scheduledAt != null;
    return (
      noticeId: input.noticeId ?? 'sent-${sent.length}',
      status: scheduled
          ? ProfessorNoticeStatus.scheduled
          : ProfessorNoticeStatus.sent,
      recipientCount: scheduled ? 0 : previewCount,
    );
  }

  @override
  Future<void> delete(String noticeId) async {
    deleted.add(noticeId);
    notices = [
      for (final n in notices)
        if (n.id != noticeId) n,
    ];
    _changes.add(null);
  }

  @override
  Future<int> remind(String noticeId) async {
    reminded.add(noticeId);
    return 2;
  }

  @override
  Future<int> previewAudience(ProfessorNoticeAudience audience) async {
    previews.add(audience.toMap());
    return audience.isEmpty ? 0 : previewCount;
  }

  @override
  Stream<ProfessorNotice?> watchNotice(String noticeId) => _watch(() {
        for (final n in notices) {
          if (n.id == noticeId) return n;
        }
        return null;
      });

  @override
  Stream<ProfessorNoticeRecipient?> watchMyReply(String noticeId, String uid) =>
      _watch(() => myReplies[noticeId]);

  @override
  Future<String?> respond(String noticeId, {String? answer}) async {
    responses.add((noticeId: noticeId, answer: answer));
    final before = myReplies[noticeId];
    myReplies[noticeId] = ProfessorNoticeRecipient(
      athleteId: professorStudentsTestUid,
      readAt: DateTime.utc(2026, 10, 20),
      answer: answer ?? before?.answer,
    );
    _changes.add(null);
    return myReplies[noticeId]!.answer;
  }
}

List<RouteBase> get professorNoticeRoutes => [
      GoRoute(
        path: AppRoutes.professorNotices,
        name: AppRouteNames.professorNotices,
        builder: (_, __) => const ProfessorNoticesPage(),
      ),
      GoRoute(
        path: AppRoutes.professorNoticeNew,
        name: AppRouteNames.professorNoticeNew,
        builder: (_, __) => const ProfessorNoticeEditorPage(),
      ),
      GoRoute(
        path: AppRoutes.professorNoticeEdit,
        name: AppRouteNames.professorNoticeEdit,
        builder: (_, state) => ProfessorNoticeEditorPage(
          noticeId: state.pathParameters['noticeId'],
        ),
      ),
      GoRoute(
        path: AppRoutes.professorNoticeReport,
        name: AppRouteNames.professorNoticeReport,
        builder: (_, state) => ProfessorNoticeReportPage(
          noticeId: state.pathParameters['noticeId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.professorNoticeForStudent,
        name: AppRouteNames.professorNoticeForStudent,
        builder: (_, state) => ProfessorNoticeStudentPage(
          noticeId: state.pathParameters['noticeId'] ?? '',
        ),
      ),
    ];

Future<GoRouter> pumpProfessorNoticesApp(
  WidgetTester tester, {
  required FakeProfessorNoticesRepository notices,
  required String location,
  FakeProfessorWalletRepository? wallet,
  ProfessorStudentsSnapshot? snapshot,
}) =>
    pumpProfessorStudentsApp(
      tester,
      repo: FakeProfessorStudentsRepository(
          [snapshot ?? professorStudentsSnapshot()]),
      walletRepo: wallet ?? FakeProfessorWalletRepository(),
      location: location,
      extraRoutes: [...professorNoticeRoutes, ...professorWalletRoutes],
      overrides: [
        professorNoticesRepositoryProvider.overrideWithValue(notices),
        professorLinksClockProvider.overrideWithValue(() => agendaNow),
      ],
    );
