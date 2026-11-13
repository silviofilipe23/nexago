/// Caminhos das imagens da arena no Storage — nome NOVO a cada envio, igual ao
/// portal da arena (`arena-image-path.ts`).
///
/// Sobrescrever o mesmo arquivo troca o token de download na hora: a URL que
/// está no Firestore passa a responder 403 antes de a nova ser gravada. Se o
/// "Salvar" não chegasse ao Firestore (rede caída, app fechado no meio), a capa
/// publicada da arena quebrava. Com um nome por envio, a anterior segue válida
/// até a nova ser gravada (mesma solução do avatar do atleta,
/// `profileImageFileName`).
library;

/// `arenas/{arenaId}/cover-{ms}`. O storage.rules aceita esse nome do gestor.
String arenaCoverStoragePath(String arenaId, DateTime now) =>
    'arenas/$arenaId/cover-${now.millisecondsSinceEpoch}';

/// `arenas/{arenaId}/products/{productId}-{ms}.jpg`.
String arenaProductImageStoragePath(
  String arenaId,
  String productId,
  DateTime now,
) =>
    'arenas/$arenaId/products/$productId-${now.millisecondsSinceEpoch}.jpg';

/// A foto antiga do produto que pode ser apagada depois que o doc passou a
/// apontar para outra: só arquivo da pasta de produtos DESTA arena e diferente
/// do novo. [previousPath]/[nextPath] são caminhos no bucket (`fullPath`).
bool isReplacedArenaProductImage({
  required String arenaId,
  required String? previousPath,
  required String? nextPath,
}) {
  final previous = previousPath ?? '';
  return previous.startsWith('arenas/$arenaId/products/') &&
      previous != nextPath;
}
