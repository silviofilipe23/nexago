import 'package:cloud_firestore/cloud_firestore.dart';

/// Planos de assinatura da arena. Espelha `functions/src/arena-plans.ts` e a
/// seção de planos do site (`ArenaPlanos`).
///
/// Eixo de valor: o Essencial (grátis) já entrega reservas online com PIX e
/// carteira — a plataforma monetiza via taxa sobre reservas. O Pro vende a
/// operação da arena (PDV/comandas, estoque, destaque, promoções, métricas e
/// receber torneios). O Parceiro adiciona escala (multi-unidade), prioridade
/// na Liga nexaGO e gerente de conta.
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

/// Recursos liberados por plano. Fonte única de verdade do gate no app —
/// evita `if (tier == pro)` espalhado. O gate de segurança correspondente vive
/// em `firestore.rules` (helper `arenaHasPlan`); este aqui é UX/entitlement.
enum ArenaCapability {
  /// PDV / comandas (abrir e operar comandas).
  pdvComandas,

  /// Catálogo de produtos e controle de estoque.
  estoque,

  /// Promoções de horário na agenda.
  promocoes,

  /// Clubinho: jogo aberto com lista pública e PIX por sessão.
  clubinho,

  /// Dashboard completo: insights e seguidores.
  metricasCompletas,

  /// Pode sediar etapas e torneios.
  receberTorneios,

  /// Múltiplas quadras / unidades, sem limite.
  multiUnidade,
}

/// Capabilities de uma arena a partir do seu tier e titularidade.
///
/// Sem titularidade ([ArenaPlanStatus.entitled] falso — Essencial, atraso fora
/// da carência, cancelamento já expirado) cai para o comportamento do
/// Essencial: sem capabilities Pro.
Set<ArenaCapability> capabilitiesFor(
  ArenaPlanTier? tier, {
  required bool entitled,
}) {
  final effectiveTier = entitled ? tier : ArenaPlanTier.essencial;
  return switch (effectiveTier) {
    ArenaPlanTier.parceiro => {
        ArenaCapability.pdvComandas,
        ArenaCapability.estoque,
        ArenaCapability.promocoes,
        ArenaCapability.clubinho,
        ArenaCapability.metricasCompletas,
        ArenaCapability.receberTorneios,
        ArenaCapability.multiUnidade,
      },
    ArenaPlanTier.pro => {
        ArenaCapability.pdvComandas,
        ArenaCapability.estoque,
        ArenaCapability.promocoes,
        ArenaCapability.clubinho,
        ArenaCapability.metricasCompletas,
        ArenaCapability.receberTorneios,
      },
    ArenaPlanTier.essencial || null => const <ArenaCapability>{},
  };
}

/// Máximo de quadras por plano. `null` = ilimitado. Sem titularidade cai para o
/// teto do Essencial. Espelha o gate em `firestore.rules` (`arenaCanAddCourt`).
int? maxCourtsFor(ArenaPlanTier? tier, {required bool entitled}) {
  final effectiveTier = entitled ? tier : ArenaPlanTier.essencial;
  return switch (effectiveTier) {
    ArenaPlanTier.pro || ArenaPlanTier.parceiro => null,
    ArenaPlanTier.essencial || null => 2,
  };
}

/// Máximo de horários fixos (séries recorrentes) ativos por plano.
/// `null` = ilimitado. Espelha o gate server-side em
/// `functions/src/arena-recurring-booking.ts` (ESSENCIAL_MAX_ACTIVE_RECURRING).
int? maxRecurringBookingsFor(ArenaPlanTier? tier, {required bool entitled}) {
  final effectiveTier = entitled ? tier : ArenaPlanTier.essencial;
  return switch (effectiveTier) {
    ArenaPlanTier.pro || ArenaPlanTier.parceiro => null,
    ArenaPlanTier.essencial || null => 3,
  };
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

// Manter alinhado com functions/src/arena-plans.ts (fonte da verdade dos preços
// no servidor) e a seção de planos do site (ArenaPlanos). Ciclo anual = 2 meses
// grátis.
const List<ArenaPlan> arenaPlansCatalog = [
  ArenaPlan(
    tier: ArenaPlanTier.essencial,
    name: 'Essencial',
    tagline: 'Comece a receber reservas online sem pagar mensalidade.',
    monthlyCents: 0,
    yearlyCents: 0,
    features: [
      'Perfil público e listagem na busca',
      'Reservas online com pagamento PIX',
      'Agenda e disponibilidade das quadras',
      'Avaliações da arena',
      'Carteira e saque via PIX',
    ],
  ),
  ArenaPlan(
    tier: ArenaPlanTier.pro,
    name: 'Pro',
    tagline: 'A operação completa da arena, do balcão ao torneio.',
    monthlyCents: 14900,
    yearlyCents: 149000,
    popular: true,
    features: [
      'Tudo do Essencial',
      'PDV e comandas',
      'Controle de estoque e produtos',
      'Destaque na busca e promoções de horário',
      'Dashboard completo, insights e seguidores',
      'Receber etapas e torneios',
    ],
  ),
  ArenaPlan(
    tier: ArenaPlanTier.parceiro,
    name: 'Parceiro',
    tagline: 'Para redes e arenas que sediam a Liga nexaGO.',
    monthlyCents: 39900,
    yearlyCents: 399000,
    features: [
      'Tudo do Pro',
      'Múltiplas quadras / unidades, sem limite',
      'Prioridade em etapas da Liga nexaGO',
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

/// Destaque exibido na tela de plano ativado (pós-pagamento).
class ArenaPlanActivationHighlight {
  const ArenaPlanActivationHighlight({
    required this.title,
    required this.subtitle,
    this.routeName,
  });

  final String title;
  final String subtitle;

  /// Nome da rota go_router ([AppRouteNames]) para deep link opcional.
  final String? routeName;
}

/// Copy e destaques da celebração de ativação por tier pago.
class ArenaPlanActivationContent {
  const ArenaPlanActivationContent({
    required this.tier,
    required this.title,
    required this.subtitle,
    required this.highlights,
  });

  final ArenaPlanTier tier;
  final String title;
  final String subtitle;
  final List<ArenaPlanActivationHighlight> highlights;
}

/// Conteúdo da tela "Plano ativado" para tiers pagos (Pro / Parceiro).
ArenaPlanActivationContent arenaPlanActivationContent(ArenaPlanTier tier) {
  final plan = arenaPlanByTier(tier);
  final name = plan?.name ?? tier.id;

  return switch (tier) {
    ArenaPlanTier.pro => ArenaPlanActivationContent(
        tier: tier,
        title: 'Plano $name ativado!',
        subtitle: 'Sua arena está pronta para a operação completa.',
        highlights: const [
          ArenaPlanActivationHighlight(
            title: 'PDV e comandas',
            subtitle: 'Disponível agora',
            routeName: 'arenaComandas',
          ),
          ArenaPlanActivationHighlight(
            title: 'Dashboard e Insights',
            subtitle: 'Disponível agora',
            routeName: 'arenaDashboard',
          ),
          ArenaPlanActivationHighlight(
            title: 'Torneios e etapas',
            subtitle: 'Disponível agora',
            routeName: 'arenaSettings',
          ),
        ],
      ),
    ArenaPlanTier.parceiro => ArenaPlanActivationContent(
        tier: tier,
        title: 'Plano $name ativado!',
        subtitle: 'Sua rede está pronta para sediar a Liga nexaGO.',
        highlights: const [
          ArenaPlanActivationHighlight(
            title: 'Múltiplas unidades',
            subtitle: 'Sem limite de quadras',
          ),
          ArenaPlanActivationHighlight(
            title: 'Liga nexaGO',
            subtitle: 'Prioridade nas etapas',
          ),
          ArenaPlanActivationHighlight(
            title: 'Gerente dedicado',
            subtitle: 'Suporte exclusivo',
          ),
        ],
      ),
    ArenaPlanTier.essencial => throw ArgumentError(
        'Essencial não possui tela de ativação paga.',
      ),
  };
}

/// Carência após o vencimento em que a arena `overdue` ainda mantém o Pro,
/// enquanto o Asaas re-tenta a cobrança. Espelha o gate em `firestore.rules`.
const Duration arenaOverdueGrace = Duration(days: 7);

/// Estado do plano da arena, lido dos campos públicos de `arenas/{id}`
/// (gravados apenas pelas Cloud Functions).
class ArenaPlanStatus {
  const ArenaPlanStatus({this.tier, required this.status, this.activeUntil});

  final ArenaPlanTier? tier;

  /// `active` | `overdue` | `canceling` | `pending` | `none`.
  final String status;
  final DateTime? activeUntil;

  static const ArenaPlanStatus none = ArenaPlanStatus(status: 'none');

  /// Status cru (para exibição). Titularidade real é [entitled].
  bool get isActive => status == 'active';
  bool get isOverdue => status == 'overdue';
  bool get isCanceling => status == 'canceling';

  /// A arena tem titularidade do plano pago neste momento?
  ///
  /// - `active`: sim (confia no flag).
  /// - `overdue`: sim enquanto dentro da carência ([arenaOverdueGrace]).
  /// - `canceling`: sim até o fim do período já pago (`activeUntil`).
  /// - demais (`none`/refund/chargeback): não.
  bool entitledAt(DateTime now) {
    if (tier == null) return false;
    switch (status) {
      case 'active':
        return true;
      case 'overdue':
        final until = activeUntil;
        return until != null && now.isBefore(until.add(arenaOverdueGrace));
      case 'canceling':
        final until = activeUntil;
        return until != null && now.isBefore(until);
      default:
        return false;
    }
  }

  bool get entitled => entitledAt(DateTime.now());

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
