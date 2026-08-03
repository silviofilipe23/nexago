/** Termo de uso de imagem e proteção de dados exibido na inscrição em torneios.
 *
 *  O texto é a fonte de verdade da versão `LGPD_TERM_VERSION` — qualquer mudança
 *  de conteúdo deve subir a versão aqui E em `functions/src/tournament-partner-invite.ts`
 *  (constante `LGPD_TERM_VERSION`), que carimba o aceite gravado na inscrição.
 *  O app Flutter duplica este texto em `lib/features/tournaments/domain/lgpd_term.dart`. */
export const LGPD_TERM_VERSION = '2026-08';

export const LGPD_TERM_TITLE = 'Termo de uso de imagem e proteção de dados (LGPD)';

export const LGPD_TERM_PARAGRAPHS: readonly string[] = [
  'Ao me inscrever neste evento, autorizo, a título gratuito e por prazo indeterminado, o uso da minha imagem e voz em fotos e vídeos captados durante o evento, para divulgação do torneio, do organizador e da plataforma nexaGO em redes sociais, sites, transmissões e materiais promocionais.',
  'Declaro estar ciente de que meus dados pessoais informados na inscrição (nome, contato, categoria e resultados) serão tratados pelo organizador e pela plataforma nexaGO exclusivamente para a operação do evento — chaveamento, comunicação, ranking e divulgação de resultados — nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados).',
  'Posso solicitar ao organizador, a qualquer momento, informações sobre o tratamento dos meus dados. A revogação desta autorização quanto a usos futuros pode ser solicitada ao organizador, sem efeito retroativo sobre materiais já divulgados.',
];

export const LGPD_CHECKBOX_LABEL = 'Li e aceito o termo de uso de imagem e proteção de dados (LGPD).';
