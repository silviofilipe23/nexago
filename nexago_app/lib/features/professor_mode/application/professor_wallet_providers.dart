import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../domain/professor_wallet.dart';
import '../domain/professor_wallet_logic.dart';
import '../infrastructure/professor_wallet_repository.dart';

export '../infrastructure/professor_wallet_repository.dart'
    show professorWalletRepositoryProvider;

/// Carteira do professor independente (fase 3), em tempo real. Sem login,
/// tudo vazio.

final professorPayoutAccountProvider =
    StreamProvider.autoDispose<ProfessorPayoutAccount?>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(null);
  return ref.watch(professorWalletRepositoryProvider).watchAccount(uid);
});

final professorWalletPlansProvider =
    StreamProvider.autoDispose<List<ProfessorWalletPlan>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorWalletRepositoryProvider)
      .watchPlans(uid)
      .map(professorSortedPlans);
});

/// Todos os alunos da carteira (ativos e arquivados).
final professorWalletAllStudentsProvider =
    StreamProvider.autoDispose<List<ProfessorWalletStudent>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorWalletRepositoryProvider).watchStudents(uid);
});

/// Os da carteira (ativos e convidados), por nome — arquivado sai.
final professorWalletStudentsProvider =
    Provider.autoDispose<AsyncValue<List<ProfessorWalletStudent>>>((ref) {
  return ref.watch(professorWalletAllStudentsProvider).whenData(
        (all) => [
          for (final s in all)
            if (s.inWallet) s,
        ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase())),
      );
});

final professorWalletChargesProvider =
    StreamProvider.autoDispose<List<ProfessorCharge>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorWalletRepositoryProvider)
      .watchCharges(uid)
      .map(professorSortedCharges);
});

/// Hoje (`YYYY-MM-DD`, São Paulo) — atrasado, mês do resumo, vencimento.
final professorWalletTodayKeyProvider = Provider.autoDispose<String>((ref) {
  return nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
});

/// Algum vínculo `INDEPENDENT` (qualquer status) — a régua do servidor para
/// a carteira.
final professorHasIndependentLinkProvider = Provider.autoDispose<bool>((ref) {
  final links = ref.watch(myProfessorLinksProvider).valueOrNull ?? const [];
  return links.any((l) => l.type == ArenaProfessorLinkType.independent);
});

/// Mostra o grupo "Dinheiro" no Mais: independente ou já com conta.
final professorWalletVisibleProvider = Provider.autoDispose<bool>((ref) {
  return ref.watch(professorHasIndependentLinkProvider) ||
      ref.watch(professorPayoutAccountProvider).valueOrNull != null;
});

/// Lado do atleta: o convite do professor [professorUid] (`null` = não
/// existe ou não é para quem está logado).
final professorStudentInviteProvider = StreamProvider.autoDispose
    .family<ProfessorWalletStudent?, String>((ref, professorUid) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty || professorUid.isEmpty || professorUid.contains('/')) {
    return Stream.value(null);
  }
  return ref
      .watch(professorWalletRepositoryProvider)
      .watchInvite(professorUid: professorUid, athleteUid: uid);
});
