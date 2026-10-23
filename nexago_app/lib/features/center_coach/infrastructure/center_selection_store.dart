import 'package:shared_preferences/shared_preferences.dart';

/// Último centro escolhido na troca, por conta — quem dá aula em mais de um
/// CT reabre o app no mesmo centro. Falha de plataforma vira "sem escolha".
class CenterSelectionStore {
  const CenterSelectionStore();

  static String _key(String uid) => 'center_coach_selected_$uid';

  Future<String?> load(String uid) async {
    if (uid.isEmpty) return null;
    try {
      final v = (await SharedPreferences.getInstance()).getString(_key(uid));
      return v == null || v.trim().isEmpty ? null : v;
    } catch (_) {
      return null;
    }
  }

  Future<void> save(String uid, String centerId) async {
    if (uid.isEmpty) return;
    try {
      await (await SharedPreferences.getInstance()).setString(
        _key(uid),
        centerId,
      );
    } catch (_) {
      // Canal indisponível (teste, hot restart): a escolha vale só na sessão.
    }
  }
}
