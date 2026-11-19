import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete_billing/presentation/widgets/athlete_billing_widgets.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../domain/agenda/agenda_pendencies.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';

/// "Precisa de você": a fila de pendências no topo da Agenda. Mostra as
/// [kAgendaPendenciesVisible] mais urgentes e abre o resto em "Ver todas".
class AgendaPendenciesSection extends StatefulWidget {
  const AgendaPendenciesSection({super.key, required this.items});

  final List<AgendaPendency> items;

  @override
  State<AgendaPendenciesSection> createState() =>
      _AgendaPendenciesSectionState();
}

class _AgendaPendenciesSectionState extends State<AgendaPendenciesSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) return const SizedBox.shrink();
    final view = visibleAgendaPendencies(widget.items, expanded: _expanded);
    final canCollapse =
        _expanded && widget.items.length > kAgendaPendenciesVisible;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(count: widget.items.length),
          const SizedBox(height: 10),
          for (final item in view.items) ...[
            _PendencyRow(item: item),
            const SizedBox(height: 8),
          ],
          if (view.hiddenCount > 0 || canCollapse)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: const Key('agenda-pendencies-toggle'),
                onPressed: () => setState(() => _expanded = !_expanded),
                child: Text(
                  view.hiddenCount > 0
                      ? 'Ver todas (${widget.items.length})'
                      : 'Mostrar menos',
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Container(
          width: 3,
          height: 18,
          decoration: BoxDecoration(
            color: AppColors.brand,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          'Precisa de você',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
        const SizedBox(width: 8),
        Text(
          '$count',
          style: AppTypography.mono(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: colors.readableTone(AppColors.brand),
          ),
        ),
      ],
    );
  }
}

class _PendencyRow extends StatelessWidget {
  const _PendencyRow({required this.item});

  final AgendaPendency item;

  @override
  Widget build(BuildContext context) {
    return switch (item) {
      AgendaChargePendency(:final charge) => AthleteChargeRow(
          charge: charge,
          onTap: () => openAthleteCharge(context, charge),
        ),
      final AgendaInvitePendency invite => _InviteRow(invite: invite),
    };
  }
}

/// Convite de dupla no mesmo desenho da linha de cobrança.
class _InviteRow extends StatelessWidget {
  const _InviteRow({required this.invite});

  final AgendaInvitePendency invite;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tone = colors.readableTone(athleteAgendaTournamentAccent);
    return ProfessorLinksCard(
      key: Key('agenda-pendency-${invite.id}'),
      padding: const EdgeInsets.all(13),
      onTap: () => context.pushNamed(
        AppRouteNames.tournamentPartnerInvite,
        pathParameters: {'inviteId': invite.inviteId},
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: athleteAgendaTournamentAccent.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(11),
              border: Border.all(
                color: athleteAgendaTournamentAccent.withValues(alpha: 0.27),
              ),
            ),
            child: Icon(Icons.group_add_outlined, size: 18, color: tone),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Convite de dupla',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${invite.inviterName} convidou você para um torneio',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          // Mesmo tom de "a pagar" das cobranças: o selo marca o estado
          // (esperando o atleta), não o tipo.
          Text(
            'RESPONDER',
            style: ProfessorLinksStyle.mono(9.5, color: colors.pending)
                .copyWith(letterSpacing: 0.4),
          ),
        ],
      ),
    );
  }
}
