import 'package:url_launcher/url_launcher.dart';

/// Abre [url] fora do app (navegador ou app dono do link). `false` quando não
/// deu — URL inválida ou nada no aparelho para abrir.
Future<bool> openExternalUrl(String url) async {
  try {
    return await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
  } catch (_) {
    return false;
  }
}
