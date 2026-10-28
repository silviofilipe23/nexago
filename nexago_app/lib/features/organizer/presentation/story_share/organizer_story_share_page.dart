import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../core/layout/nexa_app_bar.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../../core/ui/nexa_share.dart';
import '../../domain/story_share/organizer_story_share.dart';
import '../../domain/story_share/organizer_story_share_providers.dart';

/// Abre a folha nativa com UM PNG. `true` quando o organizador escolheu um
/// destino; `false` quando fechou a folha sem escolher.
typedef OrganizerStoryLauncher = Future<bool> Function(
  BuildContext context,
  Uint8List png,
  String fileName,
);

/// Mesmo mecanismo do story da reserva (`captureBookingStoryPng`): PNG num
/// arquivo temporário e `Share.shareXFiles`. Não há Facebook App ID, então não
/// existe deep link direto para o Stories — o Instagram aparece na folha.
Future<bool> shareOrganizerStoryPng(
  BuildContext context,
  Uint8List png,
  String fileName,
) async {
  final origin = nexaSharePositionOrigin(context);
  final file = File('${Directory.systemTemp.path}/$fileName');
  await file.writeAsBytes(png, flush: true);
  final result = await Share.shareXFiles(
    [XFile(file.path, mimeType: 'image/png', name: fileName)],
    sharePositionOrigin: origin,
  );
  return result.status != ShareResultStatus.dismissed;
}

final organizerStoryLauncherProvider =
    Provider<OrganizerStoryLauncher>((ref) => shareOrganizerStoryPng);

/// Artes do Stories enviadas do painel web ("Enviar para o celular"). O push
/// abre esta tela, que baixa as imagens e já abre a folha de compartilhar com
/// o primeiro story; os seguintes saem um por toque, na ordem — o Instagram
/// recebe uma imagem por vez.
class OrganizerStorySharePage extends ConsumerStatefulWidget {
  const OrganizerStorySharePage({
    super.key,
    required this.shareId,
    this.autoShare = true,
  });

  final String shareId;

  /// Abre a folha com o primeiro story assim que as imagens chegam.
  final bool autoShare;

  @override
  ConsumerState<OrganizerStorySharePage> createState() =>
      _OrganizerStorySharePageState();
}

class _OrganizerStorySharePageState
    extends ConsumerState<OrganizerStorySharePage> {
  /// Espera a transição da rota terminar antes de abrir a folha por cima.
  static const _autoShareDelay = Duration(milliseconds: 450);

  final Set<int> _shared = {};
  int _page = 0;
  bool _busy = false;
  bool _autoShareStarted = false;
  bool _linkCopied = false;

  int? _nextPage(int pageCount) {
    for (var i = 0; i < pageCount; i++) {
      if (!_shared.contains(i)) return i;
    }
    return null;
  }

  void _maybeAutoShare(OrganizerStoryShare share, List<Uint8List> pages) {
    if (!widget.autoShare || _autoShareStarted || pages.isEmpty) return;
    _autoShareStarted = true;
    Future<void>.delayed(_autoShareDelay, () {
      if (mounted) _post(share, pages, 0);
    });
  }

  Future<void> _copyLink(String link, {bool announce = false}) async {
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    setState(() => _linkCopied = true);
    if (announce) {
      ScaffoldMessenger.maybeOf(context)
        ?..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Link copiado')));
    }
  }

  Future<void> _post(
    OrganizerStoryShare share,
    List<Uint8List> pages,
    int index,
  ) async {
    if (_busy || index >= pages.length) return;
    setState(() {
      _busy = true;
      _page = index;
    });
    try {
      // De carona: a figurinha "Link" do Instagram já encontra o link copiado.
      if (share.link != null) await _copyLink(share.link!);
      if (!mounted) return;
      final sent = await ref.read(organizerStoryLauncherProvider)(
        context,
        pages[index],
        'nexago-story-${index + 1}-de-${pages.length}.png',
      );
      if (!mounted || !sent) return;
      setState(() {
        _shared.add(index);
        _page = _nextPage(pages.length) ?? index;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          const SnackBar(
            content: Text('Não foi possível abrir o compartilhamento. Tente de novo.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _finish(OrganizerStoryShare share) {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(
      AppRoutes.organizerTournamentDetail
          .replaceAll(':tournamentId', share.tournamentId),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shareAsync = ref.watch(organizerStoryShareProvider(widget.shareId));
    final share = shareAsync.valueOrNull;
    final pagesAsync = share == null
        ? null
        : ref.watch(organizerStorySharePagesProvider(widget.shareId));
    final pages = pagesAsync?.valueOrNull;
    final ready = share != null &&
        pages != null &&
        pages.length == share.pageCount &&
        !share.isExpiredAt(DateTime.now());

    if (ready) _maybeAutoShare(share, pages);

    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Postar no Stories',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      bottomNavigationBar: ready
          ? _PostBar(
              label: organizerStoryShareButtonLabel(
                pageCount: share.pageCount,
                nextPage: _nextPage(share.pageCount),
              ),
              done: _nextPage(share.pageCount) == null,
              busy: _busy,
              onPressed: () {
                final next = _nextPage(share.pageCount);
                if (next == null) {
                  _finish(share);
                } else {
                  _post(share, pages, next);
                }
              },
            )
          : null,
      body: shareAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: AppInlineErrorView(
            message: 'Não foi possível abrir as artes.',
            error: e,
          ),
        ),
        data: (share) {
          if (share == null || share.isExpiredAt(DateTime.now())) {
            return const AppEmptyView(
              icon: Icons.hide_image_outlined,
              title: 'Artes indisponíveis',
              subtitle: 'As artes ficam 7 dias no app. Gere de novo no painel '
                  'do organizador, em Inscrições › Compartilhar no Stories.',
            );
          }
          return _ShareBody(
            share: share,
            pagesAsync: pagesAsync!,
            page: _page,
            shared: _shared,
            linkCopied: _linkCopied,
            onSelectPage: (i) => setState(() => _page = i),
            onCopyLink: () => _copyLink(share.link!, announce: true),
            onRetry: () => ref.invalidate(
              organizerStorySharePagesProvider(widget.shareId),
            ),
          );
        },
      ),
    );
  }
}

class _ShareBody extends StatelessWidget {
  const _ShareBody({
    required this.share,
    required this.pagesAsync,
    required this.page,
    required this.shared,
    required this.linkCopied,
    required this.onSelectPage,
    required this.onCopyLink,
    required this.onRetry,
  });

  /// Prévia em 0,6× da base 360×640, como no story da reserva.
  static const double previewWidth = 216;

  final OrganizerStoryShare share;
  final AsyncValue<List<Uint8List>> pagesAsync;
  final int page;
  final Set<int> shared;
  final bool linkCopied;
  final ValueChanged<int> onSelectPage;
  final VoidCallback onCopyLink;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final unit = share.unitLabel;
    final title = '${unit[0].toUpperCase()}${unit.substring(1)} inscritas';
    final pages = pagesAsync.valueOrNull;
    final shown = pages == null || pages.isEmpty
        ? null
        : pages[page.clamp(0, pages.length - 1)];

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      children: [
        Text(
          'DIVULGAÇÃO · INSTAGRAM',
          style: AppTypography.mono(
            fontSize: 10,
            letterSpacing: 1.4,
            color: colors.onSurface.withValues(alpha: 0.55),
          ),
        ),
        const SizedBox(height: 6),
        Text(title, style: AppTypography.titleL.copyWith(color: colors.onSurface)),
        const SizedBox(height: 4),
        Text(
          [share.tournamentName, share.categoryName]
              .where((s) => s.isNotEmpty)
              .join(' · '),
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
        const SizedBox(height: 20),
        Center(
          child: Container(
            width: previewWidth,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.5),
                  blurRadius: 40,
                  offset: const Offset(0, 18),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: AspectRatio(
                aspectRatio: 9 / 16,
                child: pagesAsync.hasError
                    ? _DownloadError(onRetry: onRetry)
                    : shown == null
                        ? _Downloading(pageCount: share.pageCount)
                        : Image.memory(
                            shown,
                            key: ValueKey('organizer-story-preview-$page'),
                            fit: BoxFit.cover,
                            gaplessPlayback: true,
                            semanticLabel:
                                'Prévia do story ${page + 1} de ${share.pageCount}',
                          ),
              ),
            ),
          ),
        ),
        if (pages != null && pages.length > 1) ...[
          const SizedBox(height: 14),
          _Thumbs(
            pages: pages,
            current: page,
            shared: shared,
            onSelect: onSelectPage,
          ),
        ],
        if (shared.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            shared.length == share.pageCount
                ? (share.pageCount == 1
                    ? 'Story enviado'
                    : '${share.pageCount} stories enviados')
                : '${shared.length} de ${share.pageCount} stories enviados',
            key: const Key('organizer-story-progress'),
            textAlign: TextAlign.center,
            style: AppTypography.labelS.copyWith(color: colors.win),
          ),
        ],
        const SizedBox(height: 24),
        _Steps(steps: organizerStoryShareSteps(share)),
        if (share.link != null) ...[
          const SizedBox(height: 16),
          _LinkRow(link: share.link!, copied: linkCopied, onCopy: onCopyLink),
        ],
      ],
    );
  }
}

class _Downloading extends StatelessWidget {
  const _Downloading({required this.pageCount});

  final int pageCount;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ColoredBox(
      color: colors.surfaceRaised,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          ),
          const SizedBox(height: 12),
          Text(
            pageCount == 1 ? 'Baixando a arte…' : 'Baixando $pageCount artes…',
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

class _DownloadError extends StatelessWidget {
  const _DownloadError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ColoredBox(
      color: colors.surfaceRaised,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded, color: colors.onSurfaceMuted),
            const SizedBox(height: 10),
            Text(
              'Não foi possível baixar as artes.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(color: colors.onSurface),
            ),
            const SizedBox(height: 10),
            TextButton(
              key: const Key('organizer-story-retry'),
              onPressed: onRetry,
              child: const Text('Tentar de novo'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Thumbs extends StatelessWidget {
  const _Thumbs({
    required this.pages,
    required this.current,
    required this.shared,
    required this.onSelect,
  });

  final List<Uint8List> pages;
  final int current;
  final Set<int> shared;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 10,
      runSpacing: 10,
      children: [
        for (var i = 0; i < pages.length; i++)
          Semantics(
            button: true,
            selected: i == current,
            label: 'Ver story ${i + 1} de ${pages.length}',
            child: GestureDetector(
              key: ValueKey('organizer-story-thumb-$i'),
              onTap: () => onSelect(i),
              child: Container(
                width: 47,
                height: 81,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    width: 2,
                    color: i == current ? AppColors.brand : Colors.transparent,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.memory(pages[i], fit: BoxFit.cover),
                      if (shared.contains(i))
                        Positioned(
                          right: 3,
                          bottom: 3,
                          child: Container(
                            width: 16,
                            height: 16,
                            decoration: const BoxDecoration(
                              color: AppColors.win,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.check_rounded,
                              size: 11,
                              color: Color(0xFF0A0A0A),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps({required this.steps});

  final List<String> steps;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          for (var i = 0; i < steps.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                border: i == steps.length - 1
                    ? null
                    : Border(
                        bottom: BorderSide(
                          color: colors.onSurface.withValues(alpha: 0.08),
                        ),
                      ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 28,
                    child: Text(
                      '0${i + 1}',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: colors.brandText,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      steps[i],
                      style: AppTypography.bodyM.copyWith(color: colors.onSurface),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({
    required this.link,
    required this.copied,
    required this.onCopy,
  });

  final String link;
  final bool copied;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'LINK DE INSCRIÇÃO',
          style: AppTypography.mono(
            fontSize: 10,
            letterSpacing: 1.4,
            color: colors.onSurface.withValues(alpha: 0.55),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          height: 48,
          padding: const EdgeInsets.only(left: 14, right: 6),
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.link_rounded, size: 18, color: colors.onSurfaceMuted),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  link.replaceFirst(RegExp(r'^https?://'), ''),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(fontSize: 12, color: colors.onSurface),
                ),
              ),
              TextButton(
                key: const Key('organizer-story-copy-link'),
                onPressed: onCopy,
                child: Text(
                  copied ? 'Copiado' : 'Copiar',
                  style: TextStyle(color: copied ? colors.win : null),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PostBar extends StatelessWidget {
  const _PostBar({
    required this.label,
    required this.done,
    required this.busy,
    required this.onPressed,
  });

  final String label;

  /// Todos os stories já saíram: o botão só fecha a tela.
  final bool done;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: SizedBox(
          height: 54,
          width: double.infinity,
          child: FilledButton.icon(
            key: const Key('organizer-story-post'),
            onPressed: busy ? null : onPressed,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: const Color(0xFF0A0A0A),
              disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.5),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            icon: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Color(0xFF0A0A0A),
                    ),
                  )
                : Icon(
                    done ? Icons.check_rounded : Icons.ios_share_rounded,
                    size: 20,
                  ),
            label: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            ),
          ),
        ),
      ),
    );
  }
}
