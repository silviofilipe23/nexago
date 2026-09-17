import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/firebase/firebase_providers.dart';
import '../../../tournaments/data/tournament_detail_lookup.dart';
import '../../../tournaments/domain/tournament_detail_model.dart';
import '../../../tournaments/domain/tournament_listing_status.dart';
import '../tournament_ops/tournament_ops_providers.dart';
import 'tournament_staff_models.dart';

/// Torneio em que o usuário logado atua como staff — espelho
/// `users/{uid}/tournamentStaff/{tournamentId}` mantido por Cloud Function.
class MyTournamentStaffEntry {
  const MyTournamentStaffEntry({
    required this.tournamentId,
    required this.role,
    required this.status,
    this.tournamentName = '',
    this.startAt,
    this.endAt,
  });

  final String tournamentId;
  final TournamentStaffRole role;
  final String status;
  final String tournamentName;
  final DateTime? startAt;
  final DateTime? endAt;

  bool get isActive => status == 'active';

  factory MyTournamentStaffEntry.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? const <String, dynamic>{};
    final startAt = data['startAt'];
    final endAt = data['endAt'];
    return MyTournamentStaffEntry(
      tournamentId: doc.id,
      role: TournamentStaffRole.fromValue(data['role'] as String?),
      status: (data['status'] as String?) ?? 'active',
      tournamentName: (data['tournamentName'] as String?) ?? '',
      startAt: startAt is Timestamp ? startAt.toDate() : null,
      endAt: endAt is Timestamp ? endAt.toDate() : null,
    );
  }
}

/// Torneios em que o usuário logado é staff ativo. Mantido vivo (sem
/// autoDispose): o guard de rotas lê este provider a cada navegação para
/// liberar `/organizer/tournaments/...` a atletas que operam torneios.
final myTournamentStaffEntriesProvider =
    StreamProvider<List<MyTournamentStaffEntry>>((ref) {
  final user = ref.watch(authProvider).valueOrNull;
  if (user == null) return Stream.value(const []);
  return FirebaseFirestore.instance
      .collection('users/${user.uid}/tournamentStaff')
      .snapshots()
      .map((snap) {
    final entries = snap.docs
        .map(MyTournamentStaffEntry.fromFirestore)
        .where((entry) => entry.isActive)
        .toList();
    entries.sort((a, b) {
      final aDate = a.startAt;
      final bDate = b.startAt;
      if (aDate == null && bDate == null) return 0;
      if (aDate == null) return 1;
      if (bDate == null) return -1;
      return bDate.compareTo(aDate);
    });
    return entries;
  });
});

final _staffTournamentDetailProvider =
    FutureProvider.family<TournamentDetail?, String>((ref, tournamentId) {
  return loadTournamentDetailById(ref.watch(firestoreProvider), tournamentId);
});

/// Staff ativo com torneio ainda não cancelado/concluído — usado na Home,
/// que só deve destacar torneios em aberto. O guard de rotas continua usando
/// [myTournamentStaffEntriesProvider] sem esse filtro.
final myOngoingTournamentStaffEntriesProvider =
    Provider<List<MyTournamentStaffEntry>>((ref) {
  final entries =
      ref.watch(myTournamentStaffEntriesProvider).valueOrNull ?? const [];
  return entries.where((entry) {
    final detail = ref
        .watch(_staffTournamentDetailProvider(entry.tournamentId))
        .valueOrNull;
    if (detail == null) return true;
    return !isTournamentTerminal(detail.status);
  }).toList();
});

/// Papel de staff do usuário logado em um torneio (null = não é staff).
final myStaffRoleForTournamentProvider =
    Provider.family<TournamentStaffRole?, String>((ref, tournamentId) {
  final entries =
      ref.watch(myTournamentStaffEntriesProvider).valueOrNull ?? const [];
  for (final entry in entries) {
    if (entry.tournamentId == tournamentId.trim()) return entry.role;
  }
  return null;
});

/// O usuário logado é o dono deste torneio?
///
/// Vem do `managerId` do documento do torneio — a mesma conta que
/// `organizer_tournament_detail_page.dart` faz. É a resposta que existe junto
/// com os dados que a tela precisa para mostrar qualquer número, e por isso
/// serve de base segura para a guarda de dinheiro.
/// `autoDispose` porque observa o stream do detalhe do torneio: sem isso o
/// listener do Firestore ficaria de pé para cada torneio visitado na sessão.
final isOrganizerTournamentOwnerProvider =
    Provider.autoDispose.family<bool, String>((ref, tournamentId) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) return false;
  final detail =
      ref.watch(organizerTournamentDetailProvider(tournamentId)).valueOrNull;
  return detail?.tournament?['managerId'] == uid;
});

/// Os números de dinheiro do evento aparecem para quem está logado?
///
/// Vale para toda tela sob `/organizer/tournaments/...`, que é rota operável
/// por staff: o administrador do evento chega nela e não pode ver arrecadação
/// nem repasse. A fronteira de verdade é o servidor (rules e callable); esta é
/// a da tela, para o número não chegar aos olhos de quem não deve vê-lo.
///
/// Junta as duas coisas que a regra precisa: se é o dono (pelo `managerId`) e
/// se o papel de staff já é **conhecido** — `AsyncValue.hasValue` do espelho.
/// Sem distinguir "carregando" de "carregado", papel ainda não emitido virava
/// "pode ver" e mostrava dinheiro nos primeiros frames de um link direto.
final organizerSeesTournamentMoneyProvider =
    Provider.autoDispose.family<bool, String>((ref, tournamentId) {
  return tournamentStaffSeesMoney(
    isOwner: ref.watch(isOrganizerTournamentOwnerProvider(tournamentId)),
    roleLoaded: ref.watch(myTournamentStaffEntriesProvider).hasValue,
    role: ref.watch(myStaffRoleForTournamentProvider(tournamentId)),
  );
});

/// True se o usuário tem ao menos um torneio como staff ativo. Aguarda a
/// primeira emissão do stream (uma leitura; depois fica em cache).
Future<bool> hasActiveTournamentStaffAccess(Ref ref) async {
  try {
    final entries = await ref.read(myTournamentStaffEntriesProvider.future);
    return entries.isNotEmpty;
  } catch (_) {
    return false;
  }
}
