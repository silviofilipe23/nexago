import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/center_leads.dart';
import '../infrastructure/firebase_center_leads_repository.dart';
import 'center_coach_providers.dart';

/// Quem cuida da captação: gestão, recepção e `enroll_students` (rules).
bool centerCanManageLeads(String centerId, Ref ref) {
  final m = ref.watch(centerMembershipProvider(centerId));
  return m != null && m.has('enroll_students');
}

/// Interessados do centro — vazio sem permissão (a rule negaria a leitura).
final centerLeadsProvider = StreamProvider.autoDispose
    .family<List<CenterLead>, String>((ref, centerId) {
  if (!centerCanManageLeads(centerId, ref)) return Stream.value(const []);
  return ref.watch(centerLeadsRepositoryProvider).watchLeads(centerId);
});

/// Config da captação (padrões sem o doc ou sem permissão de leitura).
final centerLeadSettingsProvider = StreamProvider.autoDispose
    .family<CenterLeadSettings, String>((ref, centerId) {
  if (!centerCanManageLeads(centerId, ref)) {
    return Stream.value(const CenterLeadSettings());
  }
  return ref.watch(centerLeadsRepositoryProvider).watchSettings(centerId);
});
