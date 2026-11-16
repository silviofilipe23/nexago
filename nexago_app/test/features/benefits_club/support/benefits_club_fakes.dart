import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/location/user_location_providers.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/benefits_club/application/benefits_club_onboarding_store.dart';
import 'package:nexago_app/features/benefits_club/application/benefits_club_providers.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_repository.dart';
import 'package:nexago_app/features/benefits_club/domain/my_benefits.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';
import 'package:nexago_app/features/benefits_club/domain/partner_lead.dart';
import 'package:nexago_app/features/benefits_club/presentation/benefit_partner_page.dart';
import 'package:nexago_app/features/benefits_club/presentation/benefits_club_page.dart';
import 'package:nexago_app/features/benefits_club/presentation/my_benefits_page.dart';
import 'package:nexago_app/features/benefits_club/presentation/benefits_search_page.dart';
import 'package:nexago_app/features/benefits_club/presentation/partner_lead_form_page.dart';

const testUid = 'abcd1234';

typedef TrackedEvent = ({
  BenefitEventType type,
  BenefitSource source,
  String? partnerId,
});

/// Callables do clube sem Firebase: guarda eventos, leads, resgates e
/// respostas; `getMyBenefits` devolve [myBenefits].
class FakeBenefitsClubService implements BenefitsClubService {
  FakeBenefitsClubService({this.myBenefits = MyBenefits.empty});

  final events = <TrackedEvent>[];
  final leads = <PartnerLeadSubmission>[];
  final claims = <String>[];
  final answers = <({String partnerId, bool used})>[];
  String successMessage = 'Pronto! A LinQ vai falar com você pelo WhatsApp';
  Exception? leadError;
  Exception? claimError;
  String? claimCoupon = 'SQUAD20';
  MyBenefits myBenefits;

  List<TrackedEvent> of(BenefitEventType type) =>
      events.where((e) => e.type == type).toList();

  @override
  Future<void> trackEvent({
    required BenefitEventType type,
    required BenefitSource source,
    String? partnerId,
  }) async {
    events.add((type: type, source: source, partnerId: partnerId));
  }

  @override
  Future<String> submitLead(PartnerLeadSubmission lead) async {
    final error = leadError;
    if (error != null) throw error;
    leads.add(lead);
    return successMessage;
  }

  @override
  Future<String?> claimBenefit({
    required String partnerId,
    required BenefitSource source,
  }) async {
    final error = claimError;
    if (error != null) throw error;
    claims.add(partnerId);
    return claimCoupon;
  }

  @override
  Future<MyBenefits> getMyBenefits() async => myBenefits;

  @override
  Future<void> answerBenefitUse({
    required String partnerId,
    required bool used,
  }) async {
    answers.add((partnerId: partnerId, used: used));
  }
}

/// Salvos sem Firestore (a vitrine e a flag vêm pelos overrides).
class FakeBenefitsClubRepository implements BenefitsClubRepository {
  FakeBenefitsClubRepository({Set<String> saved = const {}})
    : _saved = {...saved};

  final Set<String> _saved;
  final _controller = StreamController<Set<String>>.broadcast();
  final writes = <({String partnerId, bool saved})>[];

  Set<String> get saved => Set.unmodifiable(_saved);

  @override
  Stream<List<Partner>> watchActivePartners() => const Stream.empty();

  @override
  Stream<BenefitsClubConfig> watchConfig() => const Stream.empty();

  @override
  Stream<Set<String>> watchSavedPartnerIds(String uid) async* {
    yield saved;
    yield* _controller.stream;
  }

  @override
  Future<void> setSaved({
    required String uid,
    required String partnerId,
    required bool saved,
  }) async {
    writes.add((partnerId: partnerId, saved: saved));
    saved ? _saved.add(partnerId) : _saved.remove(partnerId);
    _controller.add(this.saved);
  }
}

/// "Como funciona o clube" já visto (ou não, com [seen] falso).
class FakeOnboardingStore extends BenefitsClubOnboardingStore {
  FakeOnboardingStore({this.seen = true});

  bool seen;
  int marks = 0;

  @override
  Future<bool> hasSeenHowItWorks(String uid) async => seen;

  @override
  Future<void> markHowItWorksSeen(String uid) async {
    marks++;
    seen = true;
  }
}

/// Relógio fixo dos testes (16/11/2026, meio-dia).
final DateTime testNow = DateTime(2026, 11, 16, 12);

const fastAcai = Partner(
  id: 'fast-acai',
  name: 'Fast Açaí',
  category: PartnerCategory.food,
  benefitHighlight: '10% OFF',
  benefitTitle: '10% de desconto em todo pedido',
  description: 'Açaí no capricho, com entrega.',
  terms: 'Não cumulativo com outras promoções.',
  ctaType: PartnerCtaType.link,
  ctaLabel: 'Pedir com 10% off',
  link: 'https://fast.example/cardapio?loja=12',
  couponMode: PartnerCouponMode.fixed,
  couponCode: 'NEXAGO10',
  brandColor: '#5E1E7A',
  priority: 50,
  active: true,
);

const linq = Partner(
  id: 'linq',
  name: 'LinQ Telecom',
  category: PartnerCategory.services,
  benefitHighlight: 'GRÁTIS',
  benefitTitle: 'Instalação grátis',
  description: 'Internet fibra para quem vive o esporte.',
  ctaType: PartnerCtaType.leadForm,
  ctaLabel: 'Quero contratar',
  brandColor: '#0F62FE',
  isMasterSponsor: true,
  priority: 100,
  active: true,
  audience: PartnerAudience.testers,
);

const athleteProfile = AthleteProfile(
  id: testUid,
  name: 'Silvio Dionizio',
  sport: 'beach_tennis',
  level: 'C',
  city: 'Goiânia',
  phoneNumber: '+5562982406456',
);

/// Overrides que tiram o clube do Firebase.
List<Override> benefitsOverrides({
  required FakeBenefitsClubService service,
  BenefitsClubConfig config = const BenefitsClubConfig(enabled: true),
  Stream<BenefitsClubConfig>? configStream,
  List<Partner> partners = const [fastAcai, linq],
  Stream<List<Partner>>? partnersStream,
  String uid = testUid,
  bool isAdmin = false,
  AthleteProfile? profile = athleteProfile,
  FakeBenefitsClubRepository? repository,
  FakeOnboardingStore? onboarding,
  UserLocationSnapshot location = const UserLocationSnapshot(
    source: UserLocationSource.none,
  ),
  DateTime? memberSince,
  DateTime? now,
}) => [
  benefitsClubUidProvider.overrideWithValue(uid),
  benefitsClubConfigProvider.overrideWith(
    (ref) => configStream ?? Stream.value(config),
  ),
  benefitsClubIsAdminProvider.overrideWith((ref) async => isAdmin),
  benefitsActivePartnersProvider.overrideWith(
    (ref) => partnersStream ?? Stream.value(partners),
  ),
  athleteProfileProvider.overrideWith((ref) => Stream.value(profile)),
  benefitsClubServiceProvider.overrideWithValue(service),
  benefitsClubRepositoryProvider.overrideWithValue(
    repository ?? FakeBenefitsClubRepository(),
  ),
  benefitsOnboardingStoreProvider.overrideWithValue(
    onboarding ?? FakeOnboardingStore(),
  ),
  userLocationProvider.overrideWith((ref) async => location),
  benefitsMemberSinceProvider.overrideWithValue(memberSince),
  benefitsClockProvider.overrideWithValue(() => now ?? testNow),
];

BenefitSource _source(GoRouterState state) => BenefitSource.fromQuery(
  state.uri.queryParameters[BenefitSource.queryParam],
);

/// As quatro rotas do clube (como no app_router) mais uma Início de mentira.
GoRouter benefitsTestRouter(String initialLocation) => GoRouter(
  initialLocation: initialLocation,
  routes: [
    GoRoute(
      path: '/',
      builder: (_, __) => const Scaffold(body: Text('início')),
    ),
    GoRoute(
      path: AppRoutes.benefitsClub,
      name: AppRouteNames.benefitsClub,
      builder: (_, state) => BenefitsClubPage(source: _source(state)),
    ),
    GoRoute(
      path: AppRoutes.benefitsMine,
      name: AppRouteNames.benefitsMine,
      builder: (_, __) => const MyBenefitsPage(),
    ),
    GoRoute(
      path: AppRoutes.benefitsSearch,
      name: AppRouteNames.benefitsSearch,
      builder: (_, __) => const BenefitsSearchPage(),
    ),
    GoRoute(
      path: AppRoutes.benefitsPartner,
      name: AppRouteNames.benefitsPartner,
      builder: (_, state) => BenefitPartnerPage(
        partnerId: state.pathParameters['partnerId'] ?? '',
        source: _source(state),
      ),
    ),
    GoRoute(
      path: AppRoutes.benefitsPartnerLead,
      name: AppRouteNames.benefitsPartnerLead,
      builder: (_, state) => PartnerLeadFormPage(
        partnerId: state.pathParameters['partnerId'] ?? '',
        source: _source(state),
      ),
    ),
  ],
);

/// Stream que nunca emite (provider preso em "carregando").
Stream<T> pendingStream<T>() => StreamController<T>().stream;
