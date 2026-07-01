import 'package:cloud_firestore/cloud_firestore.dart';

/// Planos de assinatura da arena. Espelha `functions/src/arena-plans.ts` e a
/// seção de planos do site (`ArenaPlanos`). Valores ainda placeholder.
enum ArenaPlanTier { essencial, pro, parceiro }

enum ArenaBillingCycle { monthly, yearly }

extension ArenaPlanTierX on ArenaPlanTier {
  String get id => switch (this) {
        ArenaPlanTier.essencial => 'essencial',
        ArenaPlanTier.pro => 'pro',
        ArenaPlanTier.parceiro => 'parceiro',
      };

  static ArenaPlanTier? fromId(String? id) => switch (id?.trim()) {
        'essencial' => ArenaPlanTier.essencial,
        'pro' => ArenaPlanTier.pro,
        'parceiro' => ArenaPlanTier.parceiro,
        _ => null,
      };
}

extension ArenaBillingCycleX on ArenaBillingCycle {
  String get id => this == ArenaBillingCycle.yearly ? 'yearly' : 'monthly';
}

class ArenaPlan {
  const ArenaPlan({
    required this.tier,
    required this.name,
    required this.tagline,
    required this.monthlyCents,
    required this.yearlyCents,
    required this.features,
    this.popular = false,
  });

  final ArenaPlanTier tier;
  final String name;
  final String tagline;

  /// Valor mensal em centavos (0 = grátis).
  final int monthlyCents;

  /// Valor anual total em centavos (0 = grátis).
  final int yearlyCents;
  final List<String> features;
  final bool popular;

  bool get free => monthlyCents == 0 && yearlyCents == 0;

  int priceCents(ArenaBillingCycle cycle) =>
      cycle == ArenaBillingCycle.yearly ? yearlyCents : monthlyCents;
}

// TODO: valores PLACEHOLDER — manter alinhado com functions/src/arena-plans.ts
// (a tabela oficial de planos ainda será confirmada).
const List<ArenaPlan> arenaPlansCatalog = [
  ArenaPlan(
    tier: ArenaPlanTier.essencial,
    name: 'Essencial',
    tagline: 'Para começar a aparecer para a comunidade da areia.',
    monthlyCents: 0,
    yearlyCents: 0,
    features: [
      'Perfil público da arena',
      'Listagem na busca de arenas',
      'Até 5 fotos da estrutura',
    ],
  ),
  ArenaPlan(
    tier: ArenaPlanTier.pro,
    name: 'Pro',
    tagline: 'Para encher as quadras e receber torneios.',
    monthlyCents: 19900,
    yearlyCents: 190800,
    popular: true,
    features: [
      'Tudo do Essencial',
      'Receber etapas e torneios',
      'Destaque na busca',
      'Agenda e disponibilidade',
      'Métricas de visualização',
    ],
  ),
  ArenaPlan(
    tier: ArenaPlanTier.parceiro,
    name: 'Parceiro',
    tagline: 'Para redes e arenas que sediam a Liga nexaGO.',
    monthlyCents: 49900,
    yearlyCents: 478800,
    features: [
      'Tudo do Pro',
      'Prioridade em etapas da Liga',
      'Múltiplas quadras / unidades',
      'Gerente de conta dedicado',
    ],
  ),
];

ArenaPlan? arenaPlanByTier(ArenaPlanTier? tier) {
  if (tier == null) return null;
  for (final plan in arenaPlansCatalog) {
    if (plan.tier == tier) return plan;
  }
  return null;
}

/// Estado do plano da arena, lido dos campos públicos de `arenas/{id}`
/// (gravados apenas pelas Cloud Functions).
class ArenaPlanStatus {
  const ArenaPlanStatus({this.tier, required this.status, this.activeUntil});

  final ArenaPlanTier? tier;

  /// `active` | `overdue` | `pending` | `none`.
  final String status;
  final DateTime? activeUntil;

  static const ArenaPlanStatus none = ArenaPlanStatus(status: 'none');

  bool get isActive => status == 'active';
  bool get isOverdue => status == 'overdue';

  factory ArenaPlanStatus.fromArenaDoc(Map<String, dynamic>? data) {
    if (data == null) return ArenaPlanStatus.none;
    final status = (data['planStatus'] as String?)?.trim();
    return ArenaPlanStatus(
      tier: ArenaPlanTierX.fromId(data['planTier'] as String?),
      status: (status == null || status.isEmpty) ? 'none' : status,
      activeUntil: (data['planActiveUntil'] as Timestamp?)?.toDate(),
    );
  }
}
