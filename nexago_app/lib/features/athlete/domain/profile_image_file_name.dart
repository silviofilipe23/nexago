/// Nome do arquivo de uma foto do perfil (`avatar` ou `cover`) dentro de
/// `profiles/{uid}/`.
///
/// Cada envio ganha um nome NOVO. Sobrescrever o mesmo `avatar.jpg` trocava o
/// token de download na hora, e a URL antiga, ainda gravada no perfil,
/// passava a responder 403. Se a URL nova não chegasse ao Firestore (timeout,
/// rede caída, app fechado no meio), o atleta ficava sem foto em todo lugar.
/// Com um nome por envio, a foto antiga segue válida até a nova ser gravada.
String profileImageFileName(String kind, DateTime now) =>
    '$kind-${now.millisecondsSinceEpoch}.jpg';
