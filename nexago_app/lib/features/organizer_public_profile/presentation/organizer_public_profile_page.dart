import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/deep_link/app_domains.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_share.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import '../../organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import '../domain/organizer_event.dart';
import '../domain/organizer_public_profile_logic.dart';
import '../domain/organizer_public_profile_models.dart';
import '../domain/organizer_public_profile_providers.dart';
import 'widgets/organizer_profile_header_parts.dart';
import 'widgets/organizer_profile_hero.dart';
import 'widgets/organizer_profile_tabs.dart';

/// Perfil público do organizador (`/competir/organizadores/:organizerId`).
///
/// Com [ownerPreview], é o próprio organizador olhando a vitrine de dentro do modo organizador
/// (`/organizer/perfil-publico/visualizar`): sem Seguir, e os eventos abrem o detalhe
/// operacional — as rotas de atleta não existem para o papel organizer.
class OrganizerPublicProfilePage extends ConsumerStatefulWidget {
  const OrganizerPublicProfilePage({
    super.key,
    required this.organizerId,
    this.ownerPreview = false,
  });

  final String organizerId;
  final bool ownerPreview;

  @override
  ConsumerState<OrganizerPublicProfilePage> createState() =>
      _OrganizerPublicProfilePageState();
}

class _OrganizerPublicProfilePageState
    extends ConsumerState<OrganizerPublicProfilePage> {
  OrganizerProfileTab _tab = OrganizerProfileTab.overview;

  /// Estado otimista do botão Seguir: vale até o stream do doc de seguidor confirmar.
  bool? _optimisticFollowing;
  bool _followBusy = false;

  String get _organizerId => widget.organizerId.trim();

  void _back() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(
      widget.ownerPreview
          ? AppRoutes.organizerPublicProfileEdit
          : AppRoutes.organizersDirectory,
    );
  }

  void _retry() {
    ref.invalidate(organizerPublicProfileProvider(_organizerId));
    ref.invalidate(organizerEventsProvider(_organizerId));
  }

  void _openEvent(OrganizerEvent event) {
    context.pushNamed(
      widget.ownerPreview
          ? AppRouteNames.organizerTournamentDetail
          : AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': event.id},
    );
  }

  Future<void> _share(OrganizerPublicProfile profile) async {
    final link = AppShareLinks.organizerProfile(profile.uid);
    await nexaShareText(
      context,
      'Conheça ${profile.name}, organizador no nexaGO: $link',
      subject: profile.name,
    );
  }

  Future<void> _openWhatsapp(Uri uri) async {
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!opened && mounted) {
      showAppSnackBar(
        context,
        'Não foi possível abrir o WhatsApp.',
        isError: true,
      );
    }
  }

  Future<void> _toggleFollow(bool currentlyFollowing) async {
    if (_followBusy) return;
    final uid = ref.read(authProvider).valueOrNull?.uid.trim() ?? '';
    if (uid.isEmpty) {
      showAppSnackBar(context, 'Entre na sua conta para seguir organizadores.');
      return;
    }
    final target = !currentlyFollowing;
    setState(() {
      _optimisticFollowing = target;
      _followBusy = true;
    });
    final repository = ref.read(organizerPublicProfileRepositoryProvider);
    try {
      if (target) {
        await repository.follow(organizerId: _organizerId, followerId: uid);
      } else {
        await repository.unfollow(organizerId: _organizerId, followerId: uid);
      }
      if (!mounted) return;
      final confirmed =
          ref.read(organizerIsFollowedProvider(_organizerId)).valueOrNull;
      setState(() {
        _followBusy = false;
        // O stream pode ter confirmado antes do fim da escrita: aí ele volta a mandar.
        if (confirmed == target) _optimisticFollowing = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _followBusy = false;
        _optimisticFollowing = null;
      });
      showAppSnackBar(
        context,
        target
            ? 'Não foi possível seguir agora. Tente de novo.'
            : 'Não foi possível deixar de seguir agora. Tente de novo.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync =
        ref.watch(organizerPublicProfileProvider(_organizerId));
    final topInset = MediaQuery.paddingOf(context).top;

    final body = profileAsync.when(
      skipLoadingOnReload: true,
      loading: () => _LoadingSkeleton(topInset: topInset),
      error: (error, stackTrace) => AppErrorView(
        title: 'Não foi possível carregar',
        message: 'Confira sua conexão e tente de novo.',
        retryLabel: 'Tentar de novo',
        onRetry: _retry,
      ),
      data: (profile) {
        if (profile == null || !profile.isDisplayable) {
          return _NotFound(
            ownerPreview: widget.ownerPreview,
            onAction: widget.ownerPreview
                ? _back
                : () => context.goNamed(AppRouteNames.organizersDirectory),
          );
        }
        return _buildProfile(context, profile);
      },
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: Stack(
        children: [
          Positioned.fill(child: body),
          // Fora do Scrollable de propósito: um botão dentro da lista fica sem resposta
          // enquanto ela desliza por inércia.
          Positioned(
            top: topInset + 6,
            left: 12,
            child: _BackButton(onTap: _back),
          ),
        ],
      ),
    );
  }

  Widget _buildProfile(BuildContext context, OrganizerPublicProfile profile) {
    final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
    final isSelf = widget.ownerPreview || uid == profile.uid;
    final reputation =
        ref.watch(organizerReputationProvider(_organizerId)).valueOrNull;
    final eventsAsync = ref.watch(organizerEventsProvider(_organizerId));
    final events = eventsAsync.valueOrNull ?? const <OrganizerEvent>[];
    final championNames =
        ref.watch(organizerChampionNamesProvider(_organizerId)).valueOrNull ??
            const <String, String>{};
    final followedAsync = isSelf
        ? const AsyncValue<bool>.data(false)
        : ref.watch(organizerIsFollowedProvider(_organizerId));
    if (!isSelf) {
      // O stream alcançou o otimista depois da escrita: daqui pra frente ele manda.
      ref.listen(organizerIsFollowedProvider(_organizerId), (_, next) {
        final value = next.valueOrNull;
        if (!_followBusy &&
            _optimisticFollowing != null &&
            value == _optimisticFollowing) {
          setState(() => _optimisticFollowing = null);
        }
      });
    }
    final isFollowing =
        _optimisticFollowing ?? followedAsync.valueOrNull ?? false;

    final now = DateTime.now();
    final upcoming = organizerUpcomingEvents(events, now);
    final completed = organizerCompletedEvents(events);
    final reputationView = organizerReputationView(reputation);
    final whatsapp = organizerWhatsappUri(profile.whatsapp);

    final tabContent = switch (_tab) {
      OrganizerProfileTab.overview => OrganizerOverviewTab(
          profile: profile,
          upcoming: upcoming,
          completed: completed,
          championNames: championNames,
          reputation: reputationView,
          inviteToFollow: !isSelf,
          onOpenEvent: _openEvent,
          onSeeEvents: () => setState(() => _tab = OrganizerProfileTab.events),
          onSeeReviews: () =>
              setState(() => _tab = OrganizerProfileTab.reviews),
        ),
      OrganizerProfileTab.events => OrganizerEventsTab(
          upcoming: upcoming,
          completed: completed,
          championNames: championNames,
          onOpenEvent: _openEvent,
        ),
      OrganizerProfileTab.results => OrganizerResultsTab(
          completed: completed,
          championNames: championNames,
          onOpenEvent: _openEvent,
        ),
      OrganizerProfileTab.reviews => _ReviewsTabLoader(
          organizerId: _organizerId,
          reputation: reputationView,
          events: events,
        ),
    };

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      slivers: [
        SliverToBoxAdapter(
          child: OrganizerProfileHero(
            name: profile.name,
            initials: organizerInitials(profile.name),
            verified: profile.verified,
            locationLine: organizerLocationLine(profile.city, profile.state),
            sinceLabel: organizerSinceLabel(profile.stats.organizerSince),
            logo: organizerNetworkImage(profile.logoUrl),
            cover: organizerNetworkImage(profile.coverUrl),
          ),
        ),
        SliverToBoxAdapter(
          child: OrganizerProfileStatsRow(
            stats: organizerHeaderStats(profile, reputation),
          ),
        ),
        SliverToBoxAdapter(
          child: OrganizerProfileActions(
            showFollow: !isSelf,
            isFollowing: isFollowing,
            followBusy: _followBusy || !followedAsync.hasValue,
            onFollow: () => _toggleFollow(isFollowing),
            onShare: () => _share(profile),
            onMessage: whatsapp == null ? null : () => _openWhatsapp(whatsapp),
          ),
        ),
        if (profile.stats.sports.isNotEmpty)
          SliverToBoxAdapter(
            child: OrganizerSportChips(sports: profile.stats.sports),
          ),
        SliverToBoxAdapter(
          child: OrganizerProfileTabBar(
            selected: _tab,
            eventsCount: upcoming.length + completed.length,
            onChanged: (tab) => setState(() => _tab = tab),
          ),
        ),
        SliverToBoxAdapter(child: tabContent),
        SliverToBoxAdapter(
          child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 40),
        ),
      ],
    );
  }
}

/// A aba Avaliações é a única que lê `tournamentReviewSummaries`: o stream só abre quando o
/// atleta chega nela.
class _ReviewsTabLoader extends ConsumerWidget {
  const _ReviewsTabLoader({
    required this.organizerId,
    required this.reputation,
    required this.events,
  });

  final String organizerId;
  final OrganizerReputationView? reputation;
  final List<OrganizerEvent> events;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaries = reputation == null
        ? const <TournamentReviewSummary>[]
        : ref
                .watch(organizerReviewSummariesProvider(organizerId))
                .valueOrNull ??
            const <TournamentReviewSummary>[];
    return OrganizerReviewsTab(
      reputation: reputation,
      eventRows: organizerEventReviewRows(summaries, {
        for (final event in events) event.id: event,
      }),
    );
  }
}

class _NotFound extends StatelessWidget {
  const _NotFound({required this.ownerPreview, required this.onAction});

  final bool ownerPreview;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    if (ownerPreview) {
      return AppEmptyView(
        icon: Icons.storefront_outlined,
        title: 'Seu perfil público ainda não está no ar',
        subtitle:
            'Ele aparece alguns instantes depois que você salva o perfil. Os números chegam '
            'com o primeiro evento publicado.',
        actionLabel: 'Voltar',
        onAction: onAction,
      );
    }
    return AppEmptyView(
      icon: Icons.storefront_outlined,
      title: 'Organizador não encontrado',
      subtitle: 'O perfil pode ter sido removido ou o link está desatualizado.',
      actionLabel: 'Ver organizadores',
      onAction: onAction,
    );
  }
}

class _LoadingSkeleton extends StatelessWidget {
  const _LoadingSkeleton({required this.topInset});

  final double topInset;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NexaSkeleton(
          height: width / OrganizerProfileHero.coverAspectRatio + topInset,
          radius: BorderRadius.zero,
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.lg,
            AppSpacing.screenH,
            0,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: const [
              NexaSkeleton(height: 28, width: 220, radius: AppRadii.smAll),
              SizedBox(height: AppSpacing.md),
              NexaSkeleton(height: 56, radius: AppRadii.mdAll),
              SizedBox(height: AppSpacing.lg),
              NexaSkeleton(height: 180, radius: AppRadii.lgAll),
            ],
          ),
        ),
      ],
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.45),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: const SizedBox(
          width: 40,
          height: 40,
          child: Icon(
            Icons.arrow_back_rounded,
            color: Colors.white,
            semanticLabel: 'Voltar',
          ),
        ),
      ),
    );
  }
}
