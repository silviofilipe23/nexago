import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/gamification_models.dart';
import '../domain/gamification_providers.dart';

/// Perfil do atleta.
///
/// Se [embedded] for true (ex.: aba do shell), não usa [CupertinoPageScaffold]
/// — o pai fornece o layout; o conteúdo usa fundo branco.
class AthleteProfilePage extends ConsumerWidget {
  const AthleteProfilePage({
    super.key,
    this.embedded = false,
    this.viewedUserId,
  });

  final bool embedded;
  final String? viewedUserId;

  static const Color _pageWhite = CupertinoColors.white;
  static const Color _muted = CupertinoColors.systemGrey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).valueOrNull;
    final viewed = viewedUserId?.trim();

    Widget bodyNotSignedIn() {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Faça login para ver seu perfil.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              color: _muted,
            ),
          ),
        ),
      );
    }

    if (viewed != null && viewed.isNotEmpty) {
      final profileAsync = ref.watch(athleteProfileByIdProvider(viewed));
      final emailAsync = ref.watch(athleteUserEmailProvider(viewed));

      Widget bodyOther() {
        if (user == null) return bodyNotSignedIn();
        return profileAsync.when(
          data: (doc) {
            final profile = doc ??
                AthleteProfile(
                  id: viewed,
                  name: 'Atleta',
                  sport: '',
                  level: '',
                  city: '',
                );
            final email = emailAsync.maybeWhen(
              data: (e) => e,
              orElse: () => null,
            );
            return _AthleteProfileBody(
              embedded: embedded,
              profile: profile,
              email: email,
              totalBookings: 0,
              nextBooking: null,
              gamificationSummary: GamificationSummary.initial(),
              badges: const <UserBadgeProgress>[],
              readOnly: true,
              onEdit: () {},
              onOpenAgenda: () {},
              onOpenSettings: () {},
            );
          },
          loading: () => const Center(child: CupertinoActivityIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Não foi possível carregar o perfil.\n$e',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 15,
                  color: CupertinoColors.systemRed,
                ),
              ),
            ),
          ),
        );
      }

      if (embedded) {
        return ColoredBox(
          color: _pageWhite,
          child: bodyOther(),
        );
      }

      return CupertinoPageScaffold(
        backgroundColor: _pageWhite,
        child: MediaQuery.removePadding(
          context: context,
          removeTop: true,
          child: bodyOther(),
        ),
      );
    }

    final profileAsync = ref.watch(athleteProfileProvider);
    final bookingsAsync = ref.watch(myBookingsStreamProvider);
    final gamificationSummaryAsync = ref.watch(gamificationSummaryProvider);
    final badgesAsync = ref.watch(gamificationBadgesProvider);

    Widget bodyContent() {
      if (user == null) return bodyNotSignedIn();
      return profileAsync.when(
        data: (doc) {
          final profile = doc ?? AthleteProfile.draft(user);
          return bookingsAsync.when(
            data: (bookings) => _AthleteProfileBody(
              embedded: embedded,
              profile: profile,
              email: user.email,
              totalBookings: _countCompletedBookings(bookings),
              nextBooking: _findNextBooking(bookings),
              gamificationSummary: gamificationSummaryAsync.valueOrNull ??
                  GamificationSummary.initial(),
              badges: badgesAsync.valueOrNull ?? const <UserBadgeProgress>[],
              readOnly: false,
              onEdit: () => context.pushNamed(AppRouteNames.athleteProfileEdit),
              onOpenAgenda: () => context.pushNamed(AppRouteNames.myBookings),
              onOpenSettings: () =>
                  context.pushNamed(AppRouteNames.athleteSettings),
            ),
            loading: () => const Center(child: CupertinoActivityIndicator()),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Não foi possível carregar reservas.\n$e',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 15,
                    color: CupertinoColors.systemRed,
                  ),
                ),
              ),
            ),
          );
        },
        loading: () => const Center(child: CupertinoActivityIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o perfil.\n$e',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 15,
                color: CupertinoColors.systemRed,
              ),
            ),
          ),
        ),
      );
    }

    if (embedded) {
      return ColoredBox(
        color: _pageWhite,
        child: bodyContent(),
      );
    }

    if (user == null) {
      return CupertinoPageScaffold(
        backgroundColor: _pageWhite,
        child: bodyNotSignedIn(),
      );
    }

    return CupertinoPageScaffold(
      backgroundColor: _pageWhite,
      child: MediaQuery.removePadding(
        context: context,
        removeTop: true,
        child: bodyContent(),
      ),
    );
  }
}

void _showBriefCupertinoAlert(
  BuildContext context,
  String title,
  String message,
) {
  showCupertinoDialog<void>(
    context: context,
    builder: (ctx) => CupertinoAlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        CupertinoDialogAction(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}

class _AthleteProfileBody extends StatelessWidget {
  const _AthleteProfileBody({
    required this.embedded,
    required this.profile,
    required this.email,
    required this.totalBookings,
    required this.nextBooking,
    required this.gamificationSummary,
    required this.badges,
    this.readOnly = false,
    required this.onEdit,
    required this.onOpenAgenda,
    required this.onOpenSettings,
  });

  final bool embedded;
  final AthleteProfile profile;
  final String? email;
  final int totalBookings;
  final MyBookingItem? nextBooking;
  final GamificationSummary gamificationSummary;
  final List<UserBadgeProgress> badges;
  final bool readOnly;
  final VoidCallback onEdit;
  final VoidCallback onOpenAgenda;
  final VoidCallback onOpenSettings;

  static const Color _purple = Color(0xFF6657F6);

  /// Hero: capa full-bleed + overlay; avatar sobrepõe a área branca abaixo.
  static const double _heroHeight = 260;
  static const double _avatarSize = 110;
  static const double _avatarCornerRadius = 24;
  static const Color _avatarBorder = Color(0xFF1C1C1E);

  String _tagline() {
    final parts = <String>[
      profile.sport.trim(),
      profile.level.trim(),
      profile.city.trim(),
    ].where((e) => e.isNotEmpty).join(' • ');
    final bio = profile.bio?.trim();
    if (bio != null && bio.isNotEmpty) {
      final short = bio.length > 72 ? '${bio.substring(0, 69)}…' : bio;
      if (parts.isEmpty) return short;
      return '$parts • $short';
    }
    const tail = 'Em busca de boas conexões competitivas';
    if (parts.isEmpty) return tail;
    return '$parts • $tail';
  }

  int _progressPercent() {
    final p = gamificationSummary.progressToNextLevel;
    return (p * 100).round().clamp(0, 100);
  }

  @override
  Widget build(BuildContext context) {
    final url = profile.avatarUrl?.trim();
    final cover = profile.coverPhotoUrl?.trim();
    final hasCover = cover != null && cover.isNotEmpty;
    final heroBgUrl = hasCover ? cover : url;
    final hasHeroImage = heroBgUrl != null && heroBgUrl.isNotEmpty;
    final name = profile.name.trim().isNotEmpty ? profile.name.trim() : 'Atleta';
    final levelLabel =
        profile.level.trim().isNotEmpty ? profile.level.trim() : 'Atleta';

    return ColoredBox(
      color: CupertinoColors.white,
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          SliverToBoxAdapter(
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.bottomCenter,
              children: [
                // Camada base: hero + sombra (profundidade sobre o branco).
                Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    boxShadow: [
                      BoxShadow(
                        color: CupertinoColors.black.withValues(alpha: 0.14),
                        blurRadius: 28,
                        offset: const Offset(0, 18),
                        spreadRadius: -10,
                      ),
                      BoxShadow(
                        color: CupertinoColors.black.withValues(alpha: 0.06),
                        blurRadius: 12,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: SizedBox(
                    height: _heroHeight,
                    width: double.infinity,
                    child: ClipRect(
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          // 1) Cover (object-fit: cover, centralizado).
                          if (hasHeroImage)
                            Positioned.fill(
                              child: hasCover
                                  ? CachedNetworkImage(
                                      key: ValueKey<String>('cover_$heroBgUrl'),
                                      imageUrl: heroBgUrl,
                                      fit: BoxFit.cover,
                                      alignment: Alignment.center,
                                      fadeInDuration: Duration.zero,
                                      placeholder: (context, _) =>
                                          const ColoredBox(
                                        color: Color(0xFF2C2C2E),
                                        child: Center(
                                          child: CupertinoActivityIndicator(
                                            color: CupertinoColors.white,
                                          ),
                                        ),
                                      ),
                                      errorWidget: (context, _, _) =>
                                          const ColoredBox(
                                        color: Color(0xFFE8E0FF),
                                      ),
                                    )
                                  : ImageFiltered(
                                      imageFilter: ImageFilter.blur(
                                        sigmaX: 18,
                                        sigmaY: 18,
                                      ),
                                      child: Transform.scale(
                                        scale: 1.15,
                                        child: CachedNetworkImage(
                                          key: ValueKey<String>('hero_$heroBgUrl'),
                                          imageUrl: heroBgUrl,
                                          fit: BoxFit.cover,
                                          alignment: Alignment.center,
                                          errorWidget: (context, _, _) =>
                                              const ColoredBox(
                                            color: Color(0xFFE8E0FF),
                                          ),
                                        ),
                                      ),
                                    ),
                            )
                          else
                            const DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    Color(0xFFE8E0FF),
                                    Color(0xFFF2F2F7),
                                  ],
                                ),
                              ),
                            ),
                          // 2) Overlay: transparente no topo → escuro na base.
                          if (hasHeroImage)
                            const DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Color(0x00000000),
                                    Color(0x66000000),
                                    Color(0xD9000000),
                                  ],
                                  stops: [0.0, 0.42, 1.0],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                // 3) Controles sobre o overlay.
                if (!embedded)
                  Positioned(
                    top: 8,
                    left: 4,
                    child: SafeArea(
                      bottom: false,
                      child: CupertinoButton(
                        padding: EdgeInsets.zero,
                        onPressed: () {
                          if (context.canPop()) {
                            context.pop();
                          } else {
                            context.go(AppRoutes.discover);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: hasHeroImage
                                ? CupertinoColors.black.withValues(alpha: 0.38)
                                : CupertinoColors.white.withValues(alpha: 0.92),
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: CupertinoColors.black
                                    .withValues(alpha: 0.18),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Icon(
                            CupertinoIcons.chevron_back,
                            size: 22,
                            color: hasHeroImage
                                ? CupertinoColors.white
                                : CupertinoColors.black,
                          ),
                        ),
                      ),
                    ),
                  ),
                // 4) Avatar acima da cover e do overlay (parcialmente fora).
                Positioned(
                  bottom: -_avatarSize / 2 + 12,
                  child: _HeroAvatar(
                    size: _avatarSize,
                    cornerRadius: _avatarCornerRadius,
                    borderColor: _avatarBorder,
                    imageUrl: url,
                    name: name,
                  ),
                ),
              ],
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                20,
                _avatarSize / 2 + 28,
                20,
                24,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: DefaultTextStyle.merge(
                    style: const TextStyle(
                      color: CupertinoColors.black,
                      decoration: TextDecoration.none,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          name,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.5,
                          ),
                        ),
                        if (email != null && email!.trim().isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            email!.trim(),
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 14,
                              color: CupertinoColors.systemGrey,
                            ),
                          ),
                        ],
                        const SizedBox(height: 10),
                        Text(
                          _tagline(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 14,
                            height: 1.35,
                            color: CupertinoColors.systemGrey,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            _Pill(
                              background: _purple,
                              foreground: CupertinoColors.white,
                              label: levelLabel,
                            ),
                            const SizedBox(width: 8),
                            _Pill(
                              background: const Color(0xFF34C759),
                              foreground: CupertinoColors.white,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    CupertinoIcons.heart_fill,
                                    size: 14,
                                    color: CupertinoColors.white,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    readOnly && gamificationSummary.xp == 0
                                        ? '—'
                                        : '${_progressPercent()}%',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                      color: CupertinoColors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        if (readOnly) ...[
                          _CupertinoWideButton(
                            label: 'Convidar para jogar',
                            filled: true,
                            onPressed: () => _showBriefCupertinoAlert(
                              context,
                              'Em breve',
                              'Convites estarão disponíveis em breve.',
                            ),
                          ),
                          const SizedBox(height: 10),
                          _CupertinoWideButton(
                            label: 'Seguir',
                            filled: false,
                            onPressed: () => _showBriefCupertinoAlert(
                              context,
                              'Em breve',
                              'Seguir atletas estará disponível em breve.',
                            ),
                          ),
                          const SizedBox(height: 10),
                          _CupertinoWideButton(
                            label: 'Instagram',
                            filled: false,
                            leading: const Icon(
                              CupertinoIcons.camera_fill,
                              size: 18,
                              color: CupertinoColors.black,
                            ),
                            onPressed: () => _showBriefCupertinoAlert(
                              context,
                              'Em breve',
                              'Link do Instagram poderá ser adicionado ao perfil em breve.',
                            ),
                          ),
                        ] else ...[
                          _CupertinoWideButton(
                            label: 'Editar perfil',
                            filled: true,
                            onPressed: onEdit,
                          ),
                          const SizedBox(height: 10),
                          _CupertinoWideButton(
                            label: 'Minha agenda',
                            filled: false,
                            onPressed: onOpenAgenda,
                          ),
                          const SizedBox(height: 10),
                          _CupertinoWideButton(
                            label: 'Configurações',
                            filled: false,
                            leading: const Icon(
                              CupertinoIcons.settings,
                              size: 18,
                              color: CupertinoColors.black,
                            ),
                            onPressed: onOpenSettings,
                          ),
                        ],
                        const SizedBox(height: 18),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              _AttrChip(
                                icon: CupertinoIcons.person_fill,
                                label: profile.sport.trim().isNotEmpty
                                    ? profile.sport.trim()
                                    : 'Esporte',
                              ),
                              const SizedBox(width: 8),
                              _AttrChip(
                                icon: CupertinoIcons.chart_bar_fill,
                                label: profile.level.trim().isNotEmpty
                                    ? profile.level.trim()
                                    : 'Nível',
                              ),
                              const SizedBox(width: 8),
                              _AttrChip(
                                icon: CupertinoIcons.location_solid,
                                label: profile.city.trim().isNotEmpty
                                    ? profile.city.trim()
                                    : 'Cidade',
                              ),
                              const SizedBox(width: 8),
                              _AttrChip(
                                icon: CupertinoIcons.phone_fill,
                                label: (profile.phoneNumber?.trim().isNotEmpty == true)
                                    ? profile.phoneNumber!.trim()
                                    : 'Contato',
                              ),
                            ],
                          ),
                        ),
                        if (!readOnly) ...[
                          const SizedBox(height: 22),
                          _ProfileSection(
                            title: 'Resumo',
                            child: Text(
                              '$totalBookings reservas • Nível ${gamificationSummary.level} • ${gamificationSummary.xp} XP\n${_nextBookingLabel(nextBooking)}',
                              style: const TextStyle(
                                fontSize: 15,
                                height: 1.4,
                                color: CupertinoColors.systemGrey,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          const _SectionDivider(),
                        ],
                        const SizedBox(height: 16),
                        _ProfileSection(
                          title: 'Sobre',
                          child: Text(
                            profile.bio?.trim().isNotEmpty == true
                                ? profile.bio!.trim()
                                : 'Nenhuma descrição ainda. Conte um pouco sobre você, seu estilo de jogo e o que busca na quadra.',
                            style: const TextStyle(
                              fontSize: 15,
                              height: 1.45,
                              color: CupertinoColors.black,
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        const _SectionDivider(),
                        const SizedBox(height: 16),
                        _ProfileSection(
                          title: 'Disponibilidade',
                          child: const Text(
                            'Em breve você poderá informar horários e dias preferidos para jogar.',
                            style: TextStyle(
                              fontSize: 15,
                              height: 1.4,
                              color: CupertinoColors.systemGrey,
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        const _SectionDivider(),
                        const SizedBox(height: 16),
                        _ProfileSection(
                          title: 'Objetivos',
                          child: badges.isEmpty
                              ? const Text(
                                  'Suas conquistas e metas aparecerão aqui conforme você joga.',
                                  style: TextStyle(
                                    fontSize: 15,
                                    height: 1.4,
                                    color: CupertinoColors.systemGrey,
                                  ),
                                )
                              : Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: badges
                                      .take(6)
                                      .map(
                                        (b) => Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 8,
                                          ),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFE8EFFF),
                                            borderRadius: BorderRadius.circular(
                                              20,
                                            ),
                                            border: Border.all(
                                              color: const Color(0xFFC8D2FF),
                                            ),
                                          ),
                                          child: Text(
                                            b.badge.title,
                                            style: const TextStyle(
                                              fontSize: 13,
                                              fontWeight: FontWeight.w600,
                                              color: Color(0xFF3249E8),
                                            ),
                                          ),
                                        ),
                                      )
                                      .toList(growable: false),
                                ),
                        ),
                        const SizedBox(height: 6),
                        const _SectionDivider(),
                        const SizedBox(height: 16),
                        _ProfileSection(
                          title: 'Conquistas',
                          child: badges.isEmpty
                              ? const Text(
                                  'Complete partidas para desbloquear badges.',
                                  style: TextStyle(
                                    fontSize: 15,
                                    height: 1.4,
                                    color: CupertinoColors.systemGrey,
                                  ),
                                )
                              : Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: badges
                                      .map(
                                        (b) => Padding(
                                          padding: const EdgeInsets.only(
                                            bottom: 8,
                                          ),
                                          child: Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                b.badge.icon,
                                                style: const TextStyle(
                                                  fontSize: 16,
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: Text(
                                                  b.badge.title,
                                                  style: const TextStyle(
                                                    fontSize: 15,
                                                    height: 1.35,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      )
                                      .toList(growable: false),
                                ),
                        ),
                        if (!readOnly) const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.background,
    required this.foreground,
    this.label,
    this.child,
  }) : assert(label != null || child != null);

  final Color background;
  final Color foreground;
  final String? label;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
      ),
      child: child ??
          Text(
            label!,
            style: TextStyle(
              color: foreground,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
    );
  }
}

class _CupertinoWideButton extends StatelessWidget {
  const _CupertinoWideButton({
    required this.label,
    required this.filled,
    required this.onPressed,
    this.leading,
  });

  final String label;
  final bool filled;
  final VoidCallback onPressed;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return CupertinoButton(
      padding: EdgeInsets.zero,
      onPressed: onPressed,
      child: Container(
        width: double.infinity,
        height: 48,
        decoration: BoxDecoration(
          color: filled
              ? _AthleteProfileBody._purple
              : const Color(0xFFF2F2F7),
          borderRadius: BorderRadius.circular(12),
          boxShadow: filled
              ? [
                  BoxShadow(
                    color: _AthleteProfileBody._purple.withValues(alpha: 0.28),
                    blurRadius: 12,
                    offset: const Offset(0, 6),
                  ),
                ]
              : null,
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (leading != null) ...[
              leading!,
              const SizedBox(width: 8),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: filled ? CupertinoColors.white : CupertinoColors.black,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttrChip extends StatelessWidget {
  const _AttrChip({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF2F2F7),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: CupertinoColors.systemGrey),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: CupertinoColors.black,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileSection extends StatelessWidget {
  const _ProfileSection({
    required this.title,
    required this.child,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.2,
          ),
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

class _SectionDivider extends StatelessWidget {
  const _SectionDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 1,
      color: const Color(0xFFE5E5EA),
    );
  }
}

class _HeroAvatar extends StatelessWidget {
  const _HeroAvatar({
    required this.size,
    required this.cornerRadius,
    required this.borderColor,
    required this.imageUrl,
    required this.name,
  });

  final double size;
  final double cornerRadius;
  final Color borderColor;
  final String? imageUrl;
  final String name;

  @override
  Widget build(BuildContext context) {
    final initial = _initialLetter(name);
    final r = BorderRadius.circular(cornerRadius);

    final Widget face = imageUrl != null && imageUrl!.isNotEmpty
        ? CachedNetworkImage(
            imageUrl: imageUrl!,
            fit: BoxFit.cover,
            width: size,
            height: size,
            alignment: Alignment.center,
            placeholder: (context, url) => Container(
              width: size,
              height: size,
              color: const Color(0xFFE5E5EA),
              alignment: Alignment.center,
              child: const CupertinoActivityIndicator(),
            ),
            errorWidget: (context, _, _) =>
                _FallbackAvatar(size: size, initial: initial),
          )
        : _FallbackAvatar(size: size, initial: initial);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: r,
        border: Border.all(color: borderColor, width: 2.5),
        boxShadow: [
          BoxShadow(
            color: CupertinoColors.black.withValues(alpha: 0.22),
            blurRadius: 24,
            offset: const Offset(0, 14),
            spreadRadius: -6,
          ),
          BoxShadow(
            color: CupertinoColors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: face,
    );
  }
}

String _initialLetter(String name) {
  final t = name.trim();
  if (t.isEmpty) return '?';
  final it = t.runes.iterator;
  if (!it.moveNext()) return '?';
  return String.fromCharCode(it.current).toUpperCase();
}

class _FallbackAvatar extends StatelessWidget {
  const _FallbackAvatar({
    required this.size,
    required this.initial,
  });

  final double size;
  final String initial;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      color: const Color(0xFFE5E5EA),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: TextStyle(
          fontSize: size * 0.36,
          fontWeight: FontWeight.w700,
          color: CupertinoColors.systemGrey,
        ),
      ),
    );
  }
}

int _countCompletedBookings(List<MyBookingItem> bookings) {
  return bookings.where((b) {
    final s = b.rawStatus.trim().toLowerCase();
    return s != 'canceled' && s != 'cancelled';
  }).length;
}

MyBookingItem? _findNextBooking(List<MyBookingItem> bookings) {
  final now = DateTime.now();
  MyBookingItem? next;
  DateTime? nextStart;
  for (final booking in bookings) {
    final status = booking.rawStatus.trim().toLowerCase();
    if (status == 'canceled' || status == 'cancelled') continue;
    final start = _parseBookingStart(booking);
    if (start == null || !start.isAfter(now)) continue;
    if (nextStart == null || start.isBefore(nextStart)) {
      nextStart = start;
      next = booking;
    }
  }
  return next;
}

DateTime? _parseBookingStart(MyBookingItem item) {
  if (item.dateRaw.length < 10) return null;
  final day = DateTime.tryParse(item.dateRaw.substring(0, 10));
  if (day == null) return null;
  final parts = item.startTime.split(':');
  final hh = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return DateTime(day.year, day.month, day.day, hh, mm);
}

String _nextBookingLabel(MyBookingItem? next) {
  if (next == null) return 'Próxima reserva: nenhuma';
  final start = _parseBookingStart(next);
  if (start == null) return 'Próxima reserva em ${next.arenaName}';
  final fmt = DateFormat("dd/MM 'às' HH:mm", 'pt_BR');
  return 'Próxima reserva: ${next.arenaName} • ${fmt.format(start)}';
}
