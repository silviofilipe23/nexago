/// Lista de espera do nexaGO+ (plano pago do atleta, Fase 0 da spec
/// `docs/superpowers/specs/2026-11-03-nexago-plus-atleta-design.md`).
///
/// Mede interesse antes de existir cobrança: o card da Início abre a folha,
/// o atleta entra na lista ou dispensa. Uma gravação só por atleta
/// (`athletePlusWaitlist/{uid}`); as rules não deixam regravar.

/// O que o atleta fez com o convite.
enum AthletePlusWaitlistStatus { joined, dismissed }

AthletePlusWaitlistStatus? athletePlusWaitlistStatusFromKey(Object? key) {
  for (final s in AthletePlusWaitlistStatus.values) {
    if (s.name == key) return s;
  }
  return null;
}

/// Pilares do pacote — o "o que mais te interessa" da folha. As chaves vão
/// para o Firestore e o analytics; as rules conferem a mesma lista.
enum AthletePlusInterest {
  // Sem prometer "sem taxa": hoje o atleta não paga taxa de serviço (spec, bloqueio da Fase 1).
  savings('savings', 'Economia', 'Descontos nas inscrições de torneio'),
  evolution(
      'evolution', 'Evolução', 'Seu mês em números: rating, parceiros e metas'),
  status('status', 'Status', 'Selo de assinante no perfil e cards exclusivos'),
  priority('priority', 'Prioridade',
      'Inscrição antecipada quando o organizador abrir e escudo extra de sequência');

  const AthletePlusInterest(this.key, this.label, this.description);

  final String key;
  final String label;
  final String description;
}

/// Faixas de "quanto faz sentido pagar por mês". Calibram o preço (spec,
/// seção Preço); `unsure` é resposta válida, não ausência.
enum AthletePlusPriceBand {
  upTo10('up_to_10', 'Até R\$ 9,90'),
  upTo15('up_to_15', 'Até R\$ 14,90'),
  upTo20('up_to_20', 'Até R\$ 19,90'),
  upTo30('up_to_30', 'Até R\$ 29,90'),
  unsure('unsure', 'Não sei');

  const AthletePlusPriceBand(this.key, this.label);

  final String key;
  final String label;
}

/// Doc do atleta na lista. `null` no provider = ainda não respondeu.
class AthletePlusWaitlistEntry {
  const AthletePlusWaitlistEntry({required this.status});

  final AthletePlusWaitlistStatus status;

  /// Status desconhecido (versão futura) conta como respondido: o card não
  /// volta a aparecer por causa de um valor que este build não conhece.
  factory AthletePlusWaitlistEntry.fromMap(Map<String, Object?> data) =>
      AthletePlusWaitlistEntry(
        status: athletePlusWaitlistStatusFromKey(data['status']) ??
            AthletePlusWaitlistStatus.dismissed,
      );
}

/// Onde o atleta viu o convite (`source` no doc). Só a Início, por ora.
const kAthletePlusSourceHome = 'home';

/// Gravação e leitura da lista de espera e da flag.
abstract interface class AthletePlusRepository {
  /// `appConfig/athletePlus.waitlistEnabled`; doc ausente = desligado.
  Stream<bool> watchWaitlistEnabled();

  /// Doc do próprio atleta; `null` enquanto ele não respondeu.
  Stream<AthletePlusWaitlistEntry?> watchMyEntry(String uid);

  /// Entra na lista. [interests] e [priceBand] são opcionais.
  Future<void> join({
    required String uid,
    required Set<AthletePlusInterest> interests,
    AthletePlusPriceBand? priceBand,
  });

  /// "Agora não": o card some para esse atleta.
  Future<void> dismiss(String uid);
}
