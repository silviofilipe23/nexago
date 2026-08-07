/// Mensagem que o atleta leva ao WhatsApp da arena pré-cadastrada.
///
/// Ela é o produto da feature: a arena precisa entender, na primeira linha, que
/// aquele contato veio da nexaGO. É o que transforma o clique em argumento de
/// venda depois ("esses atletas chegaram até você pela plataforma").
///
/// Puro de propósito — sem Firebase, sem BuildContext — para poder ser testado
/// e para manter a mesma frase no app e no portal web.
String buildArenaContactWhatsAppMessage({required String arenaName}) {
  final name = arenaName.trim();
  final target = name.isEmpty ? 'a arena' : name;
  return 'Olá! Cheguei até vocês pela nexaGO. '
      'Vi $target no app e queria saber sobre horários e valores para jogar.';
}
