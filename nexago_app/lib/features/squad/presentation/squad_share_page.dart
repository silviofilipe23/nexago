import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_share.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../tournaments/domain/tournament_discovery_models.dart';
import '../../tournaments/domain/tournament_discovery_providers.dart';
import '../application/squad_providers.dart';
import '../domain/squad_models.dart';
import '../domain/squad_rules.dart';
import 'squad_page.dart' show SquadLoadingList, SquadNotMember;
import 'widgets/squad_share_card.dart';
import 'widgets/squad_ui.dart';

/// Torneios com inscrição aberta nos próximos dias, para o card "Torneio".
List<SquadShareEvent> squadShareEventsFrom(
  List<DiscoveryTournament> list,
  DateTime now,
) {
  final today = DateTime(now.year, now.month, now.day);
  final open =
      list
          .where(
            (t) =>
                (t.status == TournamentListingStatus.open ||
                    t.status == TournamentListingStatus.almostFull) &&
                !t.startDate.isBefore(today),
          )
          .toList()
        ..sort((a, b) => a.startDate.compareTo(b.startDate));
  return [
    for (final t in open.take(6))
      SquadShareEvent(
        tournamentId: t.id,
        name: t.name,
        eyebrow: squadEventEyebrow(t.startDate, t.location),
        coverUrl: t.imageUrl,
      ),
  ];
}

/// App 02 · Compartilhar card — Story, Torneio ou QR, com o link de indicação.
class SquadSharePage extends ConsumerWidget {
  const SquadSharePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(mySquadProvider);
    return async.when(
      skipLoadingOnRefresh: true,
      loading: () =>
          const SquadScaffold(title: 'Compartilhar', body: SquadLoadingList()),
      error: (e, _) => SquadScaffold(
        title: 'Compartilhar',
        body: SquadMessage(
          title: 'Não foi possível carregar seu código',
          message: e.toString(),
          actionLabel: 'Tentar de novo',
          onAction: () => ref.invalidate(mySquadProvider),
          icon: Icons.wifi_off_rounded,
        ),
      ),
      data: (squad) {
        final m = squad.member;
        if (m == null) {
          return SquadScaffold(
            title: 'Compartilhar',
            body: SquadNotMember(invite: squad.invite),
          );
        }
        return _ShareView(member: m);
      },
    );
  }
}

class _ShareView extends ConsumerStatefulWidget {
  const _ShareView({required this.member});

  final SquadMember member;

  @override
  ConsumerState<_ShareView> createState() => _ShareViewState();
}

class _ShareViewState extends ConsumerState<_ShareView> {
  final _cardKey = GlobalKey();
  SquadShareFormat? _format;
  int _event = 0;
  bool _busy = false;

  Future<File?> _capture() async {
    final boundary = _cardKey.currentContext?.findRenderObject();
    if (boundary is! RenderRepaintBoundary) return null;
    if (boundary.debugNeedsPaint) await WidgetsBinding.instance.endOfFrame;
    final image = await boundary.toImage(pixelRatio: 3);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return null;
    final file = File(
      '${Directory.systemTemp.path}/nexago_squad_${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(bytes.buffer.asUint8List());
    return file;
  }

  Future<void> _share({required String? text}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final file = await _capture();
      if (!mounted) return;
      if (file == null) {
        showAppSnackBar(
          context,
          'Não foi possível gerar o card. Tente de novo.',
        );
        return;
      }
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png', name: 'nexago_squad.png')],
        text: text,
        sharePositionOrigin: nexaSharePositionOrigin(context),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final m = widget.member;
    final events = squadShareEventsFrom(
      ref.watch(discoveryTournamentsProvider).valueOrNull ?? const [],
      DateTime.now(),
    );
    final photo = ref.watch(athleteProfileProvider).valueOrNull?.avatarUrl;
    final format =
        _format ??
        (events.isEmpty ? SquadShareFormat.story : SquadShareFormat.tournament);
    final event = format == SquadShareFormat.tournament && events.isNotEmpty
        ? events[_event.clamp(0, events.length - 1)]
        : null;
    final link = squadShareLink(
      code: m.code,
      tournamentId: event?.tournamentId,
    );
    final qrLink = squadShareLink(
      code: m.code,
      tournamentId: event?.tournamentId,
      viaQr: true,
    );
    final noEvents = format == SquadShareFormat.tournament && events.isEmpty;

    return SquadScaffold(
      title: 'Compartilhar',
      subtitle: 'Escolha o formato',
      bottomBar: SquadBottomBar(
        children: [
          SizedBox(
            width: 58,
            height: 58,
            child: Material(
              color: SquadStyle.soft(colors),
              borderRadius: BorderRadius.circular(18),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                key: const Key('squad-share-save'),
                onTap: _busy || noEvents ? null : () => _share(text: null),
                child: Semantics(
                  button: true,
                  label: 'Salvar imagem',
                  child: Icon(
                    Icons.download_rounded,
                    size: 20,
                    color: colors.onSurface,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SquadPrimaryButton(
              key: const Key('squad-share-card'),
              label: 'Compartilhar card',
              icon: Icons.ios_share_rounded,
              loading: _busy,
              onPressed: noEvents
                  ? null
                  : () => _share(
                      text: squadShareText(
                        member: m,
                        link: link,
                        tournamentName: event?.name,
                      ),
                    ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 140),
        children: [
          _FormatTabs(
            value: format,
            onChanged: (f) => setState(() {
              _format = f;
              _event = 0;
            }),
          ),
          const SizedBox(height: 18),
          Center(
            child: noEvents
                ? SizedBox.fromSize(
                    size: SquadShareCard.size,
                    child: const SquadMessage(
                      title: 'Sem torneios abertos agora',
                      message:
                          'Quando um torneio abrir inscrições, ele aparece aqui. '
                          'Use o formato Story enquanto isso.',
                      icon: Icons.event_busy_outlined,
                    ),
                  )
                : GestureDetector(
                    onHorizontalDragEnd: event == null
                        ? null
                        : (d) {
                            final v = d.primaryVelocity ?? 0;
                            if (v.abs() < 100) return;
                            setState(() {
                              _event = (_event + (v < 0 ? 1 : -1)).clamp(
                                0,
                                events.length - 1,
                              );
                            });
                          },
                    child: RepaintBoundary(
                      key: _cardKey,
                      child: SquadShareCard(
                        format: format,
                        code: m.code,
                        offer: squadOfferShort(m),
                        qrLink: qrLink,
                        photoUrl: photo,
                        event: event,
                      ),
                    ),
                  ),
          ),
          if (event != null && events.length > 1) ...[
            const SizedBox(height: 14),
            _Dots(
              count: events.length,
              index: _event,
              onTap: (i) => setState(() => _event = i),
            ),
          ],
          const SizedBox(height: 18),
          _CopyField(
            label: 'Link',
            value: squadLinkDisplay(link),
            copyValue: link,
          ),
        ],
      ),
    );
  }
}

class _FormatTabs extends StatelessWidget {
  const _FormatTabs({required this.value, required this.onChanged});

  final SquadShareFormat value;
  final ValueChanged<SquadShareFormat> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const tabs = [
      (SquadShareFormat.story, 'Story'),
      (SquadShareFormat.tournament, 'Torneio'),
      (SquadShareFormat.qr, 'QR'),
    ];
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: SquadStyle.soft(colors),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          for (final (f, label) in tabs)
            Expanded(
              child: GestureDetector(
                key: Key('squad-share-tab-${f.name}'),
                behavior: HitTestBehavior.opaque,
                onTap: () => onChanged(f),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: f == value ? colors.onSurface : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    label,
                    style: SquadStyle.display(
                      13.5,
                      color: f == value
                          ? colors.canvas
                          : SquadStyle.mute(colors),
                      weight: FontWeight.w700,
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

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index, required this.onTap});

  final int count;
  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          GestureDetector(
            onTap: () => onTap(i),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                width: i == index ? 18 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: i == index
                      ? AppColors.brand
                      : context.themeColors.onSurface.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _CopyField extends StatelessWidget {
  const _CopyField({
    required this.label,
    required this.value,
    required this.copyValue,
  });

  final String label;
  final String value;
  final String copyValue;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      height: 48,
      padding: const EdgeInsets.only(left: 14, right: 6),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: SquadStyle.line(colors)),
      ),
      child: Row(
        children: [
          const Icon(Icons.link_rounded, size: 17, color: AppColors.brand),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SquadLabel(label),
                const SizedBox(height: 2),
                Text(
                  value,
                  key: const Key('squad-share-link'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: SquadStyle.mono(14, color: colors.onSurface),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: SquadStyle.soft(colors),
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () async {
                await Clipboard.setData(ClipboardData(text: copyValue));
                if (context.mounted) showAppSnackBar(context, 'Link copiado.');
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 9,
                ),
                child: Row(
                  children: [
                    Icon(Icons.copy_rounded, size: 15, color: colors.onSurface),
                    const SizedBox(width: 6),
                    Text(
                      'Copiar',
                      style: SquadStyle.display(
                        12.5,
                        color: colors.onSurface,
                        weight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
