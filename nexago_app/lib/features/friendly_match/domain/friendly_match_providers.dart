import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/friendly_match_repository.dart';
import 'friendly_match_models.dart';

export '../data/friendly_match_repository.dart'
    show friendlyMatchRepositoryProvider;
export '../data/friendly_match_service.dart'
    show friendlyMatchServiceProvider, FriendlyMatchActionException;

/// Uid autenticado (vazio deixa os streams vazios sem quebrar as rules).
String _uidOf(Ref ref) =>
    ref.watch(authProvider).value?.uid.trim() ?? '';

Stream<List<FriendlyMatch>> _emptyWhenLoggedOut(
  String uid,
  Stream<List<FriendlyMatch>> Function(String uid) source,
) {
  if (uid.isEmpty) return Stream.value(const []);
  return source(uid);
}

/// Config do recurso (kill-switch `enabled` + janelas).
final friendlyMatchConfigProvider = StreamProvider<FriendlyMatchConfig>((ref) {
  return ref.watch(friendlyMatchRepositoryProvider).watchConfig();
});

/// Convites aguardando MINHA resposta (recebidos + contrapropostas de volta).
final friendlyMatchToRespondProvider =
    StreamProvider<List<FriendlyMatch>>((ref) {
  final repo = ref.watch(friendlyMatchRepositoryProvider);
  final uid = _uidOf(ref);
  return _emptyWhenLoggedOut(uid, repo.incomingInvites);
});

final friendlyMatchCountersToRespondProvider =
    StreamProvider<List<FriendlyMatch>>((ref) {
  final repo = ref.watch(friendlyMatchRepositoryProvider);
  final uid = _uidOf(ref);
  return _emptyWhenLoggedOut(uid, repo.countersToRespond);
});

/// Convites que enviei/contrapropus e aguardam o outro lado.
final friendlyMatchSentWaitingProvider =
    StreamProvider<List<FriendlyMatch>>((ref) {
  final repo = ref.watch(friendlyMatchRepositoryProvider);
  final uid = _uidOf(ref);
  return _emptyWhenLoggedOut(uid, repo.sentWaiting);
});

final friendlyMatchCountersWaitingProvider =
    StreamProvider<List<FriendlyMatch>>((ref) {
  final repo = ref.watch(friendlyMatchRepositoryProvider);
  final uid = _uidOf(ref);
  return _emptyWhenLoggedOut(uid, repo.countersWaiting);
});

/// Jogos vivos (confirmados + aguardando avaliação).
final friendlyMatchActiveProvider = StreamProvider<List<FriendlyMatch>>((ref) {
  final repo = ref.watch(friendlyMatchRepositoryProvider);
  final uid = _uidOf(ref);
  return _emptyWhenLoggedOut(uid, repo.activeMatches);
});

/// Histórico (estados terminais), mais recente primeiro.
final friendlyMatchHistoryProvider = StreamProvider<List<FriendlyMatch>>((ref) {
  final repo = ref.watch(friendlyMatchRepositoryProvider);
  final uid = _uidOf(ref);
  return _emptyWhenLoggedOut(uid, repo.historyMatches);
});

/// Detalhe reativo de um jogo.
final friendlyMatchProvider =
    StreamProvider.family<FriendlyMatch?, String>((ref, matchId) {
  return ref.watch(friendlyMatchRepositoryProvider).watchMatch(matchId);
});

/// Lista combinada "Recebidos" do hub: convites + contrapropostas a responder.
final friendlyMatchInboxProvider = Provider<AsyncValue<List<FriendlyMatch>>>((ref) {
  final invites = ref.watch(friendlyMatchToRespondProvider);
  final counters = ref.watch(friendlyMatchCountersToRespondProvider);
  if (invites.hasError) return AsyncValue.error(invites.error!, StackTrace.current);
  if (counters.hasError) {
    return AsyncValue.error(counters.error!, StackTrace.current);
  }
  if (invites.isLoading || counters.isLoading) return const AsyncValue.loading();
  final merged = <FriendlyMatch>[...?invites.value, ...?counters.value]
    ..sort((a, b) => (b.createdAt ?? b.scheduledAt)
        .compareTo(a.createdAt ?? a.scheduledAt));
  return AsyncValue.data(merged);
});

/// Lista combinada "Enviados": aguardando o outro lado.
final friendlyMatchOutboxProvider = Provider<AsyncValue<List<FriendlyMatch>>>((ref) {
  final sent = ref.watch(friendlyMatchSentWaitingProvider);
  final counters = ref.watch(friendlyMatchCountersWaitingProvider);
  if (sent.hasError) return AsyncValue.error(sent.error!, StackTrace.current);
  if (counters.hasError) {
    return AsyncValue.error(counters.error!, StackTrace.current);
  }
  if (sent.isLoading || counters.isLoading) return const AsyncValue.loading();
  final merged = <FriendlyMatch>[...?sent.value, ...?counters.value]
    ..sort((a, b) => (b.createdAt ?? b.scheduledAt)
        .compareTo(a.createdAt ?? a.scheduledAt));
  return AsyncValue.data(merged);
});

/// Badge: quantos itens aguardam ação minha (responder + check-in + avaliar).
final friendlyMatchPendingCountProvider = Provider<int>((ref) {
  final inbox = ref.watch(friendlyMatchInboxProvider).value ?? const [];
  final active = ref.watch(friendlyMatchActiveProvider).value ?? const [];
  final uid = _uidOf(ref);
  if (uid.isEmpty) return 0;
  final now = DateTime.now();
  var count = inbox.length;
  for (final match in active) {
    if (match.status == FriendlyMatchStatus.completed && !match.hasReviewed(uid)) {
      count++;
    } else if (match.status == FriendlyMatchStatus.confirmed &&
        !match.hasCheckedIn(uid) &&
        match.checkInOpenAt != null &&
        now.isAfter(match.checkInOpenAt!) &&
        match.checkInCloseAt != null &&
        now.isBefore(match.checkInCloseAt!)) {
      count++;
    }
  }
  return count;
});
