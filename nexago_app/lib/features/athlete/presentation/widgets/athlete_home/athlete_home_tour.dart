import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_motion.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../data/athlete_home_tour_store.dart';
import '../../../domain/athlete_profile_providers.dart';
import '../../../domain/athlete_shell_providers.dart';

/// O que o tour da Início destaca, na ordem em que aparece.
enum AthleteHomeTourTarget { account, notifications, navBar }

class AthleteHomeTourStep {
  const AthleteHomeTourStep({
    required this.target,
    required this.title,
    required this.body,
    this.holePadding = 8,
    this.holeRadius = 16,
  });

  final AthleteHomeTourTarget target;
  final String title;
  final String body;
  final double holePadding;
  final double holeRadius;
}

/// Os três passos: os atletas não achavam o menu da conta no avatar, nem
/// sabiam para que servia cada aba.
const athleteHomeTourSteps = [
  AthleteHomeTourStep(
    target: AthleteHomeTourTarget.account,
    title: 'Sua conta fica aqui',
    body: 'Toque na sua foto para abrir o perfil, as configurações e trocar '
        'de papel. Ela está no topo de todas as abas.',
    holeRadius: 999,
  ),
  AthleteHomeTourStep(
    target: AthleteHomeTourTarget.notifications,
    title: 'Avisos e convites',
    body: 'Convites de dupla, confirmações de reserva e novidades dos seus '
        'torneios chegam no sino.',
  ),
  AthleteHomeTourStep(
    target: AthleteHomeTourTarget.navBar,
    title: 'Navegue pelas abas',
    body: 'Agenda, Reservar, Hub e mais: toque numa aba para trocar de seção.',
    holePadding: 0,
    holeRadius: 32,
  ),
];

/// Marca um widget como alvo do tour. Sem `GlobalKey` de propósito: a casca
/// do atleta pode aparecer duas vezes na pilha, e chave global repetida
/// derruba a árvore. Aqui o último alvo montado vence.
class AthleteHomeTourAnchor extends StatefulWidget {
  const AthleteHomeTourAnchor({
    super.key,
    required this.target,
    required this.child,
  });

  final AthleteHomeTourTarget target;
  final Widget child;

  /// Retângulo do alvo em coordenadas globais; `null` quando ele não está
  /// montado ou ainda não passou pelo layout.
  static Rect? rectOf(AthleteHomeTourTarget target) {
    final box = _anchors[target]?.context.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  static final _anchors =
      <AthleteHomeTourTarget, _AthleteHomeTourAnchorState>{};

  @override
  State<AthleteHomeTourAnchor> createState() => _AthleteHomeTourAnchorState();
}

class _AthleteHomeTourAnchorState extends State<AthleteHomeTourAnchor> {
  @override
  void initState() {
    super.initState();
    AthleteHomeTourAnchor._anchors[widget.target] = this;
  }

  @override
  void didUpdateWidget(AthleteHomeTourAnchor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.target == widget.target) return;
    _unregister(oldWidget.target);
    AthleteHomeTourAnchor._anchors[widget.target] = this;
  }

  @override
  void dispose() {
    _unregister(widget.target);
    super.dispose();
  }

  void _unregister(AthleteHomeTourTarget target) {
    if (identical(AthleteHomeTourAnchor._anchors[target], this)) {
      AthleteHomeTourAnchor._anchors.remove(target);
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Abre o tour por cima da tela. É um [PopupRoute] (via `showGeneralDialog`)
/// para a barra nativa do iOS dar lugar à cápsula Flutter enquanto ele está
/// aberto — a nativa é desenhada por cima de tudo o que é Flutter.
Future<void> showAthleteHomeTour(
  BuildContext context, {
  List<AthleteHomeTourStep> steps = athleteHomeTourSteps,
}) {
  // Só os passos com alvo na tela: o contador "1 de 3" não pode pular número.
  final visible = steps
      .where((s) => AthleteHomeTourAnchor.rectOf(s.target) != null)
      .toList(growable: false);
  if (visible.isEmpty) return Future.value();
  final reduceMotion = MediaQuery.disableAnimationsOf(context);
  return showGeneralDialog<void>(
    context: context,
    useRootNavigator: true,
    barrierDismissible: false,
    barrierColor: Colors.transparent,
    barrierLabel: 'Tour da Início',
    transitionDuration: reduceMotion ? Duration.zero : AppMotion.base,
    pageBuilder: (_, __, ___) => AthleteHomeTourOverlay(steps: visible),
    transitionBuilder: (_, animation, __, child) => FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: AppMotion.curve),
      child: child,
    ),
  );
}

class AthleteHomeTourOverlay extends StatefulWidget {
  const AthleteHomeTourOverlay({super.key, required this.steps});

  final List<AthleteHomeTourStep> steps;

  @override
  State<AthleteHomeTourOverlay> createState() => _AthleteHomeTourOverlayState();
}

class _AthleteHomeTourOverlayState extends State<AthleteHomeTourOverlay> {
  var _index = 0;

  @override
  void initState() {
    super.initState();
    // A barra troca da nativa para a cápsula Flutter quando o tour abre: o
    // retângulo dela só fica certo no frame seguinte.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() {});
    });
  }

  bool get _isLast => _index >= widget.steps.length - 1;

  void _next() {
    if (_isLast) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _index++);
  }

  void _skip() => Navigator.of(context).pop();

  @override
  Widget build(BuildContext context) {
    final step = widget.steps[_index];
    final target = AthleteHomeTourAnchor.rectOf(step.target);
    if (target == null) {
      // Alvo fora da tela (aba sem sino, por exemplo): pula o passo.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _next();
      });
      return const SizedBox.shrink();
    }

    final size = MediaQuery.sizeOf(context);
    final padding = MediaQuery.paddingOf(context);
    final hole = target.inflate(step.holePadding);
    final cardBelow = hole.center.dy < size.height / 2;
    final duration = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : AppMotion.base;

    return Material(
      type: MaterialType.transparency,
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _next,
              child: TweenAnimationBuilder<Rect?>(
                tween: RectTween(end: hole),
                duration: duration,
                curve: AppMotion.emphasized,
                builder: (_, rect, __) => CustomPaint(
                  painter: _ScrimPainter(
                    hole: rect ?? hole,
                    radius: step.holeRadius,
                  ),
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: duration,
            curve: AppMotion.emphasized,
            left: AppSpacing.screenH,
            right: AppSpacing.screenH,
            top: cardBelow ? hole.bottom + AppSpacing.lg : null,
            bottom: cardBelow ? null : size.height - hole.top + AppSpacing.lg,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: (cardBelow
                        ? size.height - hole.bottom - padding.bottom
                        : hole.top - padding.top) -
                    AppSpacing.lg * 2,
              ),
              child: _TourCard(
                key: ValueKey(_index),
                step: step,
                position: _index + 1,
                total: widget.steps.length,
                isLast: _isLast,
                onNext: _next,
                onSkip: _skip,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TourCard extends StatelessWidget {
  const _TourCard({
    super.key,
    required this.step,
    required this.position,
    required this.total,
    required this.isLast,
    required this.onNext,
    required this.onSkip,
  });

  final AthleteHomeTourStep step;
  final int position;
  final int total;
  final bool isLast;
  final VoidCallback onNext;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.md,
        ),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: AppRadii.lgAll,
          border: Border.all(color: colors.surfaceRaised),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$position DE $total',
                style: AppTypography.eyebrow.copyWith(color: AppColors.brand),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                step.title,
                style: AppTypography.titleM.copyWith(color: colors.onSurface),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                step.body,
                style: AppTypography.bodyM.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  if (!isLast)
                    TextButton(
                      key: const Key('athlete-home-tour-skip'),
                      onPressed: onSkip,
                      child: Text(
                        'Pular',
                        style: AppTypography.labelL.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  const Spacer(),
                  FilledButton(
                    key: const Key('athlete-home-tour-next'),
                    onPressed: onNext,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      minimumSize: const Size(96, 44),
                    ),
                    child: Text(
                      isLast ? 'Entendi' : 'Próximo',
                      style: AppTypography.labelL.copyWith(
                        color: AppColors.black,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Película escura com o recorte do alvo e um anel da marca em volta.
class _ScrimPainter extends CustomPainter {
  const _ScrimPainter({required this.hole, required this.radius});

  final Rect hole;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(
      hole,
      Radius.circular(radius.clamp(0, hole.shortestSide / 2)),
    );
    final scrim = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRRect(rrect);
    canvas.drawPath(
      scrim,
      Paint()..color = AppColors.black.withValues(alpha: 0.74),
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = AppColors.brand,
    );
  }

  @override
  bool shouldRepaint(_ScrimPainter old) =>
      old.hole != hole || old.radius != radius;
}

/// Abre o tour uma vez por conta, na Início, com a casca do atleta à vista —
/// mesmo desenho do `AppNewsStoriesAnnouncer`: por cima de uma inscrição, um
/// convite ou os stories, espera eles saírem.
///
/// "Viu" é gravado antes de abrir: fechar o app no meio não traz o tour de
/// volta.
class AthleteHomeTourAnnouncer extends ConsumerStatefulWidget {
  const AthleteHomeTourAnnouncer({super.key, required this.child});

  final Widget child;

  /// Folga para o hero assentar e para os stories das novidades, que abrem
  /// no mesmo momento, pegarem a vez primeiro.
  static const settleDelay = Duration(milliseconds: 900);

  @override
  ConsumerState<AthleteHomeTourAnnouncer> createState() =>
      _AthleteHomeTourAnnouncerState();
}

class _AthleteHomeTourAnnouncerState
    extends ConsumerState<AthleteHomeTourAnnouncer> {
  bool _opening = false;
  bool _done = false;

  bool _canOpen() =>
      mounted &&
      (ModalRoute.of(context)?.isCurrent ?? false) &&
      ref.read(athleteShellTabIndexProvider) == 0 &&
      AthleteHomeTourAnchor.rectOf(AthleteHomeTourTarget.account) != null;

  void _maybeOpen(String uid) {
    if (_opening || _done) return;
    _opening = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final store = ref.read(athleteHomeTourStoreProvider);
      if (!mounted) return;
      if (await store.seen(uid)) {
        _done = true;
        return;
      }
      await Future<void>.delayed(AthleteHomeTourAnnouncer.settleDelay);
      if (!_canOpen()) {
        _opening = false;
        return;
      }
      await store.markSeen(uid);
      _done = true;
      if (!mounted) return;
      await showAthleteHomeTour(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(authProvider).valueOrNull?.uid;
    // Perfil carregado = onboarding feito; antes disso a Início nem aparece.
    final hasProfile = ref.watch(athleteProfileProvider).valueOrNull != null;
    final onHome = ref.watch(athleteShellTabIndexProvider) == 0;
    // Assina a rota corrente: quando a rota de cima sai, este build roda de
    // novo e é a segunda chance do tour.
    final shellIsCurrent = ModalRoute.isCurrentOf(context) ?? false;
    if (uid != null && hasProfile && onHome && shellIsCurrent) {
      _maybeOpen(uid);
    }
    return widget.child;
  }
}
