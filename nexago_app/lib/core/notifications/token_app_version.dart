/// Campos de versão do app gravados junto do token FCM em
/// `users/{uid}/tokens/{tokenId}`.
///
/// Existem para responder "quanto da base instalada está abaixo do build que
/// trouxe o gate de atualização obrigatória?" — pergunta que hoje não tem
/// resposta, porque o doc do token guarda plataforma mas não versão.
///
/// Recebe os valores crus do `PackageInfo` (ambos String, inclusive o build).
/// Devolve **mapa vazio** quando o build number não é utilizável: o write do
/// token é `merge`, então omitir preserva o valor bom que já esteja salvo,
/// enquanto gravar `0` o apagaria e faria o script de contagem ler a instalação
/// como anterior ao gate.
Map<String, Object> tokenAppVersionFields({
  required String version,
  required String buildNumber,
}) {
  final build = int.tryParse(buildNumber.trim());
  if (build == null || build <= 0) return const {};

  final trimmedVersion = version.trim();
  return <String, Object>{
    'buildNumber': build,
    if (trimmedVersion.isNotEmpty) 'appVersion': trimmedVersion,
  };
}
