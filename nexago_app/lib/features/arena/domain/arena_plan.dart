import 'package:cloud_firestore/cloud_firestore.dart';

/// Planos de assinatura da arena. Espelha `functions/src/arena-plans.ts` e a
/// seção de planos do site (`ArenaPlanos`).
///
/// Eixo de valor: não existe mais plano grátis — toda arena sem assinatura
/// ativa é "sem plano" (tier `null`) e paga 8% por reserva. O Starter cobre o
/// básico para operar online (site, agenda, reservas, carteira PIX) com taxa
/// de 8%. O Pro vende a operação completa da arena (PDV/comandas, estoque,
/// promoções, clubinho, métricas e receber torneios) e reduz a taxa para 6%.
/// O Elite adiciona escala (multi-unidade), suporte prioritário e taxa de 5%
/// sem tarifa de saque.
enum ArenaPlanTier { starter, pro, elite }

enum ArenaBillingCycle { monthly, yearly }

extension ArenaPlanTierX on ArenaPlanTier {
  String get id => switch (this) {
        ArenaPlanTier.starter => 'starter',
        ArenaPlanTier.pro => 'pro',
        ArenaPlanTier.elite => 'elite',
      };

  /// Aceita ids legados gravados em docs antigos: 'parceiro' → elite;
  /// 'essencial' (grátis extinto) → null (sem plano).
  static ArenaPlanTier? fromId(String? id) => switch (id?.trim()) {
        'starter' => ArenaPlanTier.starter,
        'pro' => ArenaPlanTier.pro,
        'elite' || 'parceiro' => ArenaPlanTier.elite,
        _ => null,
      };
}

extension ArenaBillingCycleX on ArenaBillingCycle {
  String get id => this == ArenaBillingCycle.yearly ? 'yearly' : 'monthly';
}

/// Recursos liberados por plano. Fonte única de verdade do gate no app —
/// evita `if (tier == pro)` espalhado. O gate de segurança correspondente vive
/// em `firestore.rules` (helper `arenaEntitled`); este aqui é UX/entitlement.
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
/// Sem titularidade ([ArenaPlanStatus.entitled] falso — sem plano, atraso
/// fora da carência, cancelamento já expirado) cai para o comportamento de
/// "sem plano": sem capabilities Pro.
Set<ArenaCapability> capabilitiesFor(
  ArenaPlanTier? tier, {
  required bool entitled,
}) {
  final effectiveTier = entitled ? tier : null;
  return switch (effectiveTier) {
    ArenaPlanTier.elite => {
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
    ArenaPlanTier.starter || null => const <ArenaCapability>{},
  };
}

/// Máximo de quadras por plano. `null` = ilimitado. Sem titularidade cai para
/// o teto de "sem plano". Espelha o gate em `firestore.rules`
/// (`arenaCanAddCourt`).
int? maxCourtsFor(ArenaPlanTier? tier, {required bool entitled}) {
  final effectiveTier = entitled ? tier : null;
  return switch (effectiveTier) {
    ArenaPlanTier.elite => null,
    ArenaPlanTier.pro => 5,
    ArenaPlanTier.starter || null => 2,
  };
}

/// Plano que destrava mais quadras a partir do tier atual. `null` quando já
/// não há teto (Elite). Sem plano/Starter (teto 2) sobem para o Pro (teto 5);
/// Pro sobe para o Elite (ilimitado) — mandar uma arena Pro "assinar o Pro"
/// vende o plano que ela já tem.
ArenaPlanTier? nextCourtsTierFor(ArenaPlanTier? tier, {required bool entitled}) {
  final effectiveTier = entitled ? tier : null;
  return switch (effectiveTier) {
    ArenaPlanTier.elite => null,
    ArenaPlanTier.pro => ArenaPlanTier.elite,
    ArenaPlanTier.starter || null => ArenaPlanTier.pro,
  };
}

/// Máximo de horários fixos (séries recorrentes) ativos por plano.
/// `null` = ilimitado. Espelha o gate server-side em
/// `functions/src/arena-recurring-booking.ts`.
int? maxRecurringBookingsFor(ArenaPlanTier? tier, {required bool entitled}) {
  final effectiveTier = entitled ? tier : null;
  return switch (effectiveTier) {
    ArenaPlanTier.pro || ArenaPlanTier.elite => null,
    ArenaPlanTier.starter || null => 3,
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

  /// Valor mensal em centavos.
  final int monthlyCents;

  /// Valor anual total em centavos.
  final int yearlyCents;
  final List<String> features;
  final bool popular;

  int priceCents(ArenaBillingCycle cycle) =>
      cycle == ArenaBillingCycle.yearly ? yearlyCents : monthlyCents;
}

/// Ativação única na primeira assinatura (R$97) — cobrada pelo servidor na
/// 1ª fatura; aqui só para exibição.
const int arenaActivationFeeCents = 9700;

// Manter alinhado com functions/src/arena-plans.ts (fonte da verdade dos preços
// no servidor) e a seção de planos do site (ArenaPlanos).
const List<ArenaPlan> arenaPlansCatalog = [
  ArenaPlan(
    tier: ArenaPlanTier.starter,
    name: 'Starter',
    tagline: 'Ideal para pequenas arenas começarem online.',
    monthlyCents: 9900,
    yearlyCents: 108000,
    features: [
      'Até 2 quadras · 1 admin',
      'Site institucional + perfil na busca',
      'Agenda e reservas online (site e app)',
      'Avaliações e reputação',
      'Pagamento e saque via PIX',
      'Taxa de 8% por reserva',
    ],
  ),
  ArenaPlan(
    tier: ArenaPlanTier.pro,
    name: 'Pro',
    tagline: 'A operação completa da arena.',
    monthlyCents: 24900,
    yearlyCents: 273600,
    popular: true,
    features: [
      'Tudo do Starter · até 5 quadras',
      'Torneios ilimitados e ranking da arena',
      'Inscrições com pagamento online',
      'Relatórios e dashboard',
      'PDV, comandas e estoque',
      'Push para atletas · taxa de 6%',
    ],
  ),
  ArenaPlan(
    tier: ArenaPlanTier.elite,
    name: 'Elite',
    tagline: 'Para arenas grandes e redes.',
    monthlyCents: 49900,
    yearlyCents: 548400,
    features: [
      'Tudo do Pro · usuários ilimitados',
      'Análise financeira + consultoria semanal',
      'Landing pages ilimitadas',
      'Área de patrocinadores',
      'Suporte prioritário',
      'Taxa de 5% · saque PIX sem tarifa',
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

/// Conteúdo da tela "Plano ativado" para os 3 tiers pagos
/// (Starter / Pro / Elite).
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
    ArenaPlanTier.elite => ArenaPlanActivationContent(
        tier: tier,
        title: 'Plano $name ativado!',
        subtitle: 'Sua arena está pronta para operar em grande escala.',
        highlights: const [
          ArenaPlanActivationHighlight(
            title: 'Taxa de 5% por reserva',
            subtitle: 'Já aplicada automaticamente',
          ),
          ArenaPlanActivationHighlight(
            title: 'Saque PIX sem tarifa',
            subtitle: 'Disponível agora',
          ),
          ArenaPlanActivationHighlight(
            title: 'Suporte prioritário',
            subtitle: 'Canal exclusivo',
          ),
        ],
      ),
    ArenaPlanTier.starter => ArenaPlanActivationContent(
        tier: tier,
        title: 'Plano $name ativado!',
        subtitle: 'Sua arena já está pronta para receber reservas online.',
        highlights: const [
          ArenaPlanActivationHighlight(
            title: 'Site institucional',
            subtitle: 'Disponível agora',
          ),
          ArenaPlanActivationHighlight(
            title: 'Reservas online',
            subtitle: 'Disponível agora',
          ),
          ArenaPlanActivationHighlight(
            title: 'Carteira e saque PIX',
            subtitle: 'Disponível agora',
          ),
        ],
      ),
  };
}

/// Carência após o vencimento em que a arena `overdue` ainda mantém o plano,
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
