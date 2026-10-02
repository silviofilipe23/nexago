import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_review_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_providers.dart';

void main() {
  final future = DateTime.now().add(const Duration(days: 5));
  final past = DateTime.now().subtract(const Duration(days: 1));

  TournamentReviewInvite invite(String id, DateTime closesAt,
          [TournamentReviewInviteStatus status = TournamentReviewInviteStatus.pending]) =>
      TournamentReviewInvite(
          tournamentId: id, tournamentName: 'Copa', closesAt: closesAt, status: status);

  ProviderContainer container(_FakeReviewService service) {
    final c = ProviderContainer(overrides: [
      authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
      tournamentReviewServiceProvider.overrideWithValue(service),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  test('pendentes: descarta convite com prazo vencido mesmo marcado pending', () async {
    final c = container(_FakeReviewService(
        pending: [invite('vencido', past), invite('aberto', future)]));
    final sub = c.listen(pendingTournamentReviewsProvider, (_, __) {});
    addTearDown(sub.close);
    await c.read(authProvider.future);

    final list = await c.read(pendingTournamentReviewsProvider.future);

    expect(list.map((i) => i.tournamentId), ['aberto']);
  });

  test('avaliação própria: só lê depois de o convite dizer submitted', () async {
    final pendingService = _FakeReviewService(invite: invite('t1', future));
    final c1 = container(pendingService);
    final s1 = c1.listen(tournamentReviewInviteProvider('t1'), (_, __) {});
    addTearDown(s1.close);
    await c1.read(authProvider.future);
    await c1.read(tournamentReviewInviteProvider('t1').future);
    expect(await c1.read(myTournamentReviewProvider('t1').future), isNull);
    expect(pendingService.fetchCalls, isEmpty);

    final submittedService = _FakeReviewService(
        invite: invite('t1', future, TournamentReviewInviteStatus.submitted));
    final c2 = container(submittedService);
    final s2 = c2.listen(tournamentReviewInviteProvider('t1'), (_, __) {});
    addTearDown(s2.close);
    await c2.read(authProvider.future);
    await c2.read(tournamentReviewInviteProvider('t1').future);
    expect((await c2.read(myTournamentReviewProvider('t1').future))!.overall, 4);
    expect(submittedService.fetchCalls, ['u1/t1']);
  });
}

class _FakeReviewService implements TournamentReviewService {
  _FakeReviewService({this.pending = const [], this.invite});

  final List<TournamentReviewInvite> pending;
  final TournamentReviewInvite? invite;
  final fetchCalls = <String>[];

  @override
  Stream<List<TournamentReviewInvite>> watchPendingInvites(String uid) =>
      Stream.value(pending);

  @override
  Stream<TournamentReviewInvite?> watchInvite(String uid, String tournamentId) =>
      Stream.value(invite);

  @override
  Future<MyTournamentReview?> fetchMyReview(String uid, String tournamentId) async {
    fetchCalls.add('$uid/$tournamentId');
    return const MyTournamentReview(overall: 4, aspects: {});
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('O dublê não implementa ${invocation.memberName}.');
}
