import '../../../core/auth/app_mobile_role.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';

/// "Reservar como professor" mora no modo Professor: aparece só com esse
/// papel ativo e quando o vínculo com a arena deixa agora (`ACTIVE` +
/// "Reservar quadras"). No modo Atleta a reserva é sempre de atleta. A tela é
/// só dica: quem decide é a callable `createArenaBooking` (`asProfessor`),
/// relendo o vínculo.
bool canOfferBookingAsProfessor(
  ArenaProfessorLink? link, {
  required AppMobileRole? activeRole,
}) =>
    activeRole == AppMobileRole.professor &&
    link != null &&
    effectiveProfessorPermissions(link).canBookCourts;
