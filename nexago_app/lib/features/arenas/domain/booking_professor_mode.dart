import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';

/// "Reservar como professor" aparece quando o vínculo do usuário com a arena
/// deixa agora (`ACTIVE` + "Reservar quadras"). A tela é só dica: quem decide
/// é a callable `createArenaBooking` (`asProfessor`), relendo o vínculo.
bool canOfferBookingAsProfessor(ArenaProfessorLink? link) =>
    link != null && effectiveProfessorPermissions(link).canBookCourts;
