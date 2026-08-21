/// A hashtag da campanha, escrita num lugar só.
///
/// Vale para as duas pontas de um compartilhamento: a ARTE do card e a LEGENDA
/// que vai com a imagem na folha nativa. Elas usam caixas diferentes de
/// propósito — ver [nexaHashtagStamp].
library;

/// A hashtag na legenda. Caixa baixa porque é a forma que as redes indexam e
/// transformam em link; `#VAMOSNEXA` na legenda vira a mesma tag, mas escrita
/// aos berros.
const String nexaHashtag = '#vamosnexa';

/// A hashtag desenhada nos cards, onde o resto do rodapé também é caixa alta.
const String nexaHashtagStamp = '#VAMOSNEXA';

/// Acrescenta a hashtag ao fim de [text], sem duplicar se ela já estiver lá.
///
/// No FIM de propósito: no WhatsApp e no Instagram é a primeira linha que entra
/// no preview, e ela pertence ao jogo — a campanha vem depois.
String withNexaHashtag(String text) {
  final base = text.trim();
  if (base.toLowerCase().contains(nexaHashtag)) return base;
  return base.isEmpty ? nexaHashtag : '$base $nexaHashtag';
}
