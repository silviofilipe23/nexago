/// Formulário "Quero contratar": validação e textos espelhados de
/// `parseLead`, `defaultConsentText` e `defaultLeadSuccessMessage` em
/// `functions/src/benefits-club.ts`. As mensagens são as mesmas do servidor,
/// para o atleta ver o mesmo texto venha o erro do app ou da callable.
library;

import 'benefit_event.dart';
import 'partner.dart';

const int leadNameMax = 120;
const int leadNeighborhoodMax = 80;

final RegExp _partnerIdPattern = RegExp(r'^[A-Za-z0-9_-]{1,100}$');

bool isValidPartnerId(String value) => _partnerIdPattern.hasMatch(value);

/// Só dígitos.
String leadDigits(String value) => value.replaceAll(RegExp(r'\D+'), '');

/// Texto aparado e com espaços internos colapsados.
String collapseLeadText(String value) =>
    value.trim().replaceAll(RegExp(r'\s+'), ' ');

/// WhatsApp com DDD em dígitos com DDI (`55…`); `null` se não parece telefone.
String? normalizeLeadWhatsapp(String value) {
  var digits = leadDigits(value);
  if ((digits.length == 12 || digits.length == 13) && digits.startsWith('55')) {
    digits = digits.substring(2);
  }
  if (digits.length != 10 && digits.length != 11) return null;
  return '55$digits';
}

/// CEP com 8 dígitos ("74230-010" → "74230010").
String? normalizeLeadCep(String value) {
  final digits = leadDigits(value);
  return digits.length == 8 ? digits : null;
}

/// O que o atleta preencheu.
class PartnerLeadDraft {
  const PartnerLeadDraft({
    required this.partnerId,
    required this.name,
    required this.whatsapp,
    required this.neighborhood,
    required this.cep,
    required this.consent,
  });

  final String partnerId;
  final String name;
  final String whatsapp;
  final String neighborhood;
  final String cep;
  final bool consent;
}

/// Primeira mensagem de erro, na mesma ordem do `parseLead`; `null` = válido.
String? partnerLeadError(PartnerLeadDraft draft) {
  if (!isValidPartnerId(draft.partnerId)) return 'Parceiro inválido.';
  if (!draft.consent) {
    return 'Marque a autorização para enviarmos seus dados ao parceiro.';
  }
  final name = collapseLeadText(draft.name);
  if (name.length < 2 || name.length > leadNameMax) return 'Informe seu nome.';
  if (normalizeLeadWhatsapp(draft.whatsapp) == null) {
    return 'Informe um WhatsApp com DDD.';
  }
  final neighborhood = collapseLeadText(draft.neighborhood);
  if (neighborhood.length < 2 || neighborhood.length > leadNeighborhoodMax) {
    return 'Informe seu bairro.';
  }
  if (normalizeLeadCep(draft.cep) == null) {
    return 'Informe um CEP com 8 números.';
  }
  return null;
}

/// O que vai para a callable `submitPartnerLead`, já normalizado.
class PartnerLeadSubmission {
  const PartnerLeadSubmission({
    required this.partnerId,
    required this.name,
    required this.whatsapp,
    required this.neighborhood,
    required this.cep,
    required this.source,
  });

  /// Monta a partir de um rascunho que passou em [partnerLeadError].
  factory PartnerLeadSubmission.fromDraft(
    PartnerLeadDraft draft, {
    required BenefitSource source,
  }) => PartnerLeadSubmission(
    partnerId: draft.partnerId,
    name: collapseLeadText(draft.name),
    whatsapp:
        normalizeLeadWhatsapp(draft.whatsapp) ?? leadDigits(draft.whatsapp),
    neighborhood: collapseLeadText(draft.neighborhood),
    cep: normalizeLeadCep(draft.cep) ?? leadDigits(draft.cep),
    source: source,
  );

  final String partnerId;
  final String name;
  final String whatsapp;
  final String neighborhood;
  final String cep;
  final BenefitSource source;
}

/// Texto padrão do consentimento — IDÊNTICO ao do backend, que é o texto
/// guardado junto do lead.
String defaultConsentText(String partnerName) =>
    'Autorizo a NexaGO a compartilhar meu nome, WhatsApp, bairro e CEP com a '
    '$partnerName para que ela entre em contato comigo sobre esta oferta.';

String defaultLeadSuccessMessage(String partnerName) =>
    'Pronto! A $partnerName vai falar com você pelo WhatsApp';

String _leadPartnerName(Partner partner) =>
    partner.name.isEmpty ? 'parceiro' : partner.name;

/// O texto que a caixa de consentimento mostra: o do parceiro ou o padrão
/// (mesma escolha que o servidor faz ao gravar o lead).
String leadConsentTextFor(Partner partner) =>
    partner.leadConsentText ?? defaultConsentText(_leadPartnerName(partner));

/// Mensagem de sucesso: a da callable ou, se vier vazia, a padrão.
String leadSuccessMessageOrDefault(String message, Partner partner) {
  final text = message.trim();
  return text.isNotEmpty
      ? text
      : defaultLeadSuccessMessage(_leadPartnerName(partner));
}

/// Corpo da tela de sucesso: a tela já tem o "Pronto!" como título, então o
/// prefixo sai da mensagem, que ganha ponto final se não tiver.
String leadSuccessBody(String message) {
  final body = message.trim().replaceFirst(
    RegExp(r'^pronto!\s*', caseSensitive: false),
    '',
  );
  if (body.isEmpty) return '';
  return RegExp(r'[.!?…]$').hasMatch(body) ? body : '$body.';
}
