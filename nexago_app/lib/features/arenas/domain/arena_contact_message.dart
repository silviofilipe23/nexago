/// Mensagem que o atleta leva ao WhatsApp da arena pré-cadastrada.
///
/// Ela é o produto da feature: a arena precisa entender, na primeira linha, que
/// aquele contato veio da nexaGO. É o que transforma o clique em argumento de
/// venda depois ("esses atletas chegaram até você pela plataforma").
///
/// Puro de propósito — sem Firebase, sem BuildContext — para poder ser testado
/// e para manter a mesma frase no app e no portal web.
/// WhatsApp comercial da nexaGO, em E.164 (ex.: `5562999999999`).
///
/// ÚNICO lugar a preencher no app: é daqui que sai o botão "Gostaria de ver sua
/// arena aqui?". Enquanto estiver vazio, o botão cai no e-mail comercial —
/// nunca gera um `wa.me` quebrado. Paridade com `NEXAGO_SALES_WHATSAPP` (web).
const String kNexagoSalesWhatsApp = '';

/// Canal de vendas já usado na tela de planos do portal da arena.
const String kNexagoSalesEmail = 'contato@nexago.com.br';

const String _salesSubject = 'Quero cadastrar minha arena na nexaGO';
const String _salesMessage =
    'Olá! Tenho uma arena e gostaria de cadastrá-la na nexaGO '
    'para aparecer para os atletas.';

/// Destino do "Gostaria de ver sua arena aqui?": WhatsApp comercial quando
/// configurado, e-mail de vendas caso contrário.
String buildNexagoArenaSignupContactUrl() {
  final digits = kNexagoSalesWhatsApp.replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 12) {
    return 'https://wa.me/$digits?text=${Uri.encodeComponent(_salesMessage)}';
  }
  final query = Uri(
    queryParameters: {'subject': _salesSubject, 'body': _salesMessage},
  ).query;
  return 'mailto:$kNexagoSalesEmail?$query';
}

String buildArenaContactWhatsAppMessage({required String arenaName}) {
  final name = arenaName.trim();
  final target = name.isEmpty ? 'a arena' : name;
  return 'Olá! Cheguei até vocês pela nexaGO. '
      'Vi $target no app e queria saber sobre horários e valores para jogar.';
}
