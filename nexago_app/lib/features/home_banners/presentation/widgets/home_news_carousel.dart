import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../athlete/presentation/widgets/athlete_home/athlete_home_section_header.dart';
import '../../domain/home_banner.dart';
import '../home_banner_navigation.dart';

const _onBrand = Color(0xFF0A0A0A);
const _cardPadding = 16.0;
const _artWidth = 112.0;
const _artHeight = 132.0;
const _artGap = 16.0;

/// Espaço entre os cards; o vizinho aparece nessa fresta e convida a arrastar.
const _pageGap = 10.0;
const _topRowHeight = 32.0;
const _ctaHeight = 40.0;

/// Carrossel "Novidades no app" (Home): um card por novidade, arrasta pro
/// lado, troca sozinho a cada [autoAdvance] e o X dispensa. Com um card só,
/// sem contador nem pontos. A altura é a do card mais alto, medida com o
/// texto de verdade — título longo ou fonte grande não estouram o card.
class HomeNewsCarousel extends StatefulWidget {
  const HomeNewsCarousel({
    super.key,
    required this.banners,
    required this.onOpen,
    required this.onDismiss,
    required this.onSeen,
    this.autoAdvance = const Duration(seconds: 5),
  });

  final List<HomeBanner> banners;
  final ValueChanged<HomeBanner> onOpen;
  final ValueChanged<HomeBanner> onDismiss;

  /// O card que entrou na tela (o primeiro e cada troca de página).
  final ValueChanged<HomeBanner> onSeen;
  final Duration autoAdvance;

  @override
  State<HomeNewsCarousel> createState() => _HomeNewsCarouselState();
}

class _HomeNewsCarouselState extends State<HomeNewsCarousel> {
  PageController? _controller;
  double? _width;
  int _index = 0;
  Timer? _timer;
  ValueListenable<TickerModeData>? _tickerMode;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onSeen(widget.banners[_index]);
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _tickerMode = TickerMode.getValuesNotifier(context);
    final width = MediaQuery.sizeOf(context).width;
    if (width != _width) {
      _width = width;
      final old = _controller;
      // Página = card + fresta; centralizada, sobra metade da fresta + a
      // margem da tela de cada lado e o vizinho espia.
      _controller = PageController(
        initialPage: _index,
        viewportFraction: ((width - 2 * AppSpacing.screenH + _pageGap) / width)
            .clamp(0.5, 1.0),
      );
      if (old != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
      }
    }
    _restartTimer();
  }

  @override
  void didUpdateWidget(HomeNewsCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Card dispensado sai da lista: a página atual não pode ficar no vazio.
    final last = widget.banners.length - 1;
    if (_index > last) {
      _index = last;
      final controller = _controller;
      if (controller != null && controller.hasClients) {
        controller.jumpToPage(last);
      }
    }
    if (oldWidget.banners.length != widget.banners.length) _restartTimer();
    // Outro card ocupou a página atual (o anterior foi dispensado): ele
    // também entrou na tela.
    final before =
        _index < oldWidget.banners.length ? oldWidget.banners[_index].id : null;
    if (before != widget.banners[_index].id) {
      final banner = widget.banners[_index];
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onSeen(banner);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  /// Troca sozinho só com mais de um card e sem "reduzir movimento" ou leitor
  /// de tela — carrossel que anda atrapalha quem navega por foco.
  bool get _canAutoAdvance {
    final media = MediaQuery.maybeOf(context);
    return widget.banners.length > 1 &&
        widget.autoAdvance > Duration.zero &&
        !(media?.disableAnimations ?? false) &&
        !(media?.accessibleNavigation ?? false);
  }

  void _restartTimer() {
    _timer?.cancel();
    if (!_canAutoAdvance) return;
    _timer = Timer.periodic(widget.autoAdvance, (_) {
      final controller = _controller;
      // Aba fora de cena (TickerMode desligado) não gira à toa.
      if (!mounted || controller == null || !controller.hasClients) return;
      if (!(_tickerMode?.value.enabled ?? true)) return;
      final next = (_index + 1) % widget.banners.length;
      controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  void _onPageChanged(int index) {
    setState(() => _index = index);
    widget.onSeen(widget.banners[index]);
  }

  @override
  Widget build(BuildContext context) {
    final banners = widget.banners;
    final count = banners.length;
    final current = _index.clamp(0, count - 1);
    final colors = context.themeColors;
    final width = _width ?? MediaQuery.sizeOf(context).width;
    final cardWidth = width - 2 * AppSpacing.screenH;
    final height = _cardHeight(context, banners, cardWidth);

    return Semantics(
      container: true,
      label: 'Novidades no app',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
            child: AthleteHomeSectionHeader(
              title: 'Novidades no app',
              trailingAccent: count > 1 ? '${current + 1} de $count' : null,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: height,
            child: count == 1
                ? Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenH,
                    ),
                    child: _NewsCard(
                      banner: banners.first,
                      onOpen: widget.onOpen,
                      onDismiss: widget.onDismiss,
                    ),
                  )
                : NotificationListener<ScrollStartNotification>(
                    // O atleta arrastou: o relógio recomeça, o card não foge
                    // da mão.
                    onNotification: (n) {
                      if (n.dragDetails != null) _restartTimer();
                      return false;
                    },
                    child: PageView.builder(
                      controller: _controller,
                      itemCount: count,
                      onPageChanged: _onPageChanged,
                      itemBuilder: (context, i) => Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: _pageGap / 2,
                        ),
                        child: _NewsCard(
                          key: ValueKey(banners[i].id),
                          banner: banners[i],
                          onOpen: widget.onOpen,
                          onDismiss: widget.onDismiss,
                        ),
                      ),
                    ),
                  ),
          ),
          if (count > 1) ...[
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < count; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == current ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == current
                          ? AppColors.brand
                          : colors.onSurface.withValues(alpha: 0.16),
                      borderRadius: AppRadii.pillAll,
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

TextStyle _titleStyle(Color color) => AppTypography.soraRegular(
      fontSize: 19,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.475,
      height: 1.1,
      color: color,
    );

TextStyle _descriptionStyle(Color color) => AppTypography.soraRegular(
      fontSize: 12.5,
      fontWeight: FontWeight.w400,
      height: 1.4,
      color: color,
    );

TextStyle _tagStyle(Color color) => AppTypography.soraRegular(
      fontSize: 10.5,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.42,
      color: color,
    );

TextStyle get _ctaStyle => AppTypography.soraRegular(
      fontSize: 13.5,
      fontWeight: FontWeight.w700,
      color: _onBrand,
    );

/// Altura do card mais alto da lista: o texto medido na largura real e na
/// escala de fonte do aparelho; nunca menos que a imagem.
double _cardHeight(
  BuildContext context,
  List<HomeBanner> banners,
  double cardWidth,
) {
  final scaler = MediaQuery.textScalerOf(context);
  // O `Text` herda do tema o que o estilo não diz (espaçamento, altura de
  // linha): medir com o mesmo estilo efetivo, senão a conta erra a quebra.
  final inherited = DefaultTextStyle.of(context).style;
  final heightBehavior = DefaultTextHeightBehavior.maybeOf(context);
  final textWidth = math.max(
    80.0,
    cardWidth - 2 * _cardPadding - _artWidth - _artGap,
  );
  double measure(String text, TextStyle style, int maxLines) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: inherited.merge(style)),
      maxLines: maxLines,
      ellipsis: '…',
      textDirection: TextDirection.ltr,
      textScaler: scaler,
      textHeightBehavior: heightBehavior,
    )..layout(maxWidth: textWidth);
    final h = painter.height;
    painter.dispose();
    return h;
  }

  const color = Colors.white;
  final top =
      math.max(_topRowHeight, measure('NOVO', _tagStyle(color), 1) + 12);
  final cta = math.max(_ctaHeight, measure('Ag', _ctaStyle, 1) + 20);
  var tallest = 0.0;
  for (final b in banners) {
    final content = top +
        6 +
        measure(b.title, _titleStyle(color), 2) +
        5 +
        measure(b.description, _descriptionStyle(color), 3) +
        10 +
        cta;
    tallest = math.max(tallest, content);
  }
  return math.max(_artHeight, tallest) + 2 * _cardPadding;
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({
    super.key,
    required this.banner,
    required this.onOpen,
    required this.onDismiss,
  });

  final HomeBanner banner;
  final ValueChanged<HomeBanner> onOpen;
  final ValueChanged<HomeBanner> onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceRaised,
      borderRadius: AppRadii.xlAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('home-news-card-${banner.id}'),
        // O card inteiro abre o destino; o botão é o convite visual.
        onTap: () => onOpen(banner),
        child: Padding(
          padding: const EdgeInsets.all(_cardPadding),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Art(banner: banner),
              const SizedBox(width: _artGap),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          margin: const EdgeInsets.only(top: 4),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.brand.withValues(alpha: 0.14),
                            borderRadius: AppRadii.pillAll,
                          ),
                          child: Text(
                            'NOVO',
                            style: _tagStyle(colors.brandText),
                          ),
                        ),
                        const Spacer(),
                        if (banner.dismissible)
                          HomeNewsDismissButton(
                            key: Key('home-news-dismiss-${banner.id}'),
                            onTap: () => onDismiss(banner),
                          )
                        else
                          const SizedBox(height: _topRowHeight),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      banner.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: _titleStyle(colors.onSurface),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      banner.description,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: _descriptionStyle(colors.onSurfaceMuted),
                    ),
                    const Spacer(),
                    const SizedBox(height: 10),
                    _Cta(label: banner.ctaLabel, onTap: () => onOpen(banner)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Art extends StatelessWidget {
  const _Art({required this.banner});

  final HomeBanner banner;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    // Sem imagem (ou enquanto carrega): o ícone do destino num fundo da marca.
    final fallback = DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.08),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.18)),
        borderRadius: const BorderRadius.all(Radius.circular(18)),
      ),
      child: Center(
        child: Icon(
          homeBannerIcon(banner.destination),
          size: 40,
          color: colors.brandText,
        ),
      ),
    );
    final imageUrl = banner.imageUrl;
    return ClipRRect(
      borderRadius: const BorderRadius.all(Radius.circular(18)),
      child: SizedBox(
        width: _artWidth,
        height: _artHeight,
        child: imageUrl == null
            ? fallback
            : CachedNetworkImage(
                imageUrl: imageUrl,
                fit: BoxFit.cover,
                placeholder: (_, _) => fallback,
                errorWidget: (_, _, _) => fallback,
              ),
      ),
    );
  }
}

class _Cta extends StatelessWidget {
  const _Cta({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.brand,
      borderRadius: const BorderRadius.all(Radius.circular(14)),
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: _ctaHeight),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: _ctaStyle,
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(
                  Icons.arrow_forward_rounded,
                  size: 15,
                  color: _onBrand,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// O X do banner.
class HomeNewsDismissButton extends StatelessWidget {
  const HomeNewsDismissButton({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      label: 'Dispensar novidade',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          width: _topRowHeight,
          height: _topRowHeight,
          decoration: BoxDecoration(
            color: colors.onSurface.withValues(alpha: 0.06),
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.close_rounded,
            size: 16,
            color: colors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}
