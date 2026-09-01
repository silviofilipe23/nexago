import 'tournament_discovery_models.dart';

/// Textos do passo 3 (condições da inscrição) por variante.
///
/// Puro de propósito: as quatro variantes (dupla obrigatória, dupla com
/// reserva solo, equipe trio+, convite recebido) são regra de produto, e regra
/// testada em módulo puro não some quando alguém mexe no layout.
class RegistrationTermsCopy {
  const RegistrationTermsCopy({
    required this.eyebrow,
    required this.title,
    required this.body,
    required this.ctaLabel,
    required this.allowsSolo,
    this.secondaryLabel,
  });

  final String eyebrow;
  final String title;
  final String body;
  final String ctaLabel;

  /// A categoria aceita guardar a vaga sem parceiro definido.
  final bool allowsSolo;

  /// Rótulo da ação secundária (`null` = sem ação secundária).
  final String? secondaryLabel;
}

RegistrationTermsCopy registrationTermsCopy({
  required TournamentCategoryOffer category,
  required bool requireFormedPair,
  required bool hasReceivedInvite,
  String? inviterName,
}) {
  if (hasReceivedInvite) {
    final who = (inviterName ?? '').trim();
    return RegistrationTermsCopy(
      eyebrow: 'CONVITE RECEBIDO',
      title: who.isEmpty
          ? 'Você foi convidado para esta categoria'
          : '$who quer jogar com você',
      body: 'Ao aceitar, vocês ficam com a vaga reservada e o pagamento abre '
          'em seguida.',
      ctaLabel: 'Aceitar convite',
      allowsSolo: false,
    );
  }

  final teamSize = category.teamSize;
  if (teamSize != null && teamSize > 2) {
    return RegistrationTermsCopy(
      eyebrow: 'EQUIPE',
      title: 'Esta categoria é disputada em equipe de $teamSize',
      body: 'Você monta o elenco e convida os integrantes. A inscrição fecha '
          'quando o elenco estiver completo.',
      ctaLabel: 'Montar meu elenco',
      allowsSolo: false,
    );
  }

  if (requireFormedPair) {
    return const RegistrationTermsCopy(
      eyebrow: 'DUPLA OBRIGATÓRIA',
      title: 'Este torneio só aceita inscrição com dupla',
      body: 'O organizador não abre vaga individual nesta categoria. Defina o '
          'parceiro para seguir com a inscrição.',
      ctaLabel: 'Definir meu parceiro',
      allowsSolo: false,
    );
  }

  return const RegistrationTermsCopy(
    eyebrow: 'DUPLA',
    title: 'Escolha com quem você joga',
    body: 'Você pode convidar o parceiro agora ou guardar sua vaga e definir '
        'depois, enquanto as inscrições estiverem abertas.',
    ctaLabel: 'Escolher meu parceiro',
    allowsSolo: true,
    secondaryLabel: 'Guardar minha vaga sem parceiro',
  );
}
