import 'package:nexago_app/features/arenas/data/lancar_placar_draft_store.dart';

/// Rascunho do placar digitado em memória (o real usa SharedPreferences).
class MemoryLancarPlacarDraftStore implements LancarPlacarDraftStore {
  final drafts = <String, LancarPlacarDraft>{};

  @override
  Future<void> clear(String bookingId) async => drafts.remove(bookingId);

  @override
  Future<LancarPlacarDraft?> load(String bookingId) async => drafts[bookingId];

  @override
  Future<void> save(String bookingId, LancarPlacarDraft draft) async =>
      drafts[bookingId] = draft;
}
