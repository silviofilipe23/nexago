import '../../../core/formatting/app_currency_format.dart';

/// Textos do carrinho, do checkout e dos pedidos da Loja (app 03–08). Os
/// rótulos de status, etapas e recados vêm das regras
/// (`store_order_rules.dart`), iguais aos do portal.
abstract final class StoreCheckoutCopy {
  StoreCheckoutCopy._();

  static String price(int cents) => formatBRLFromCents(cents);

  /// "− R$ 9,50".
  static String discount(int cents) => '− ${price(cents)}';

  static String units(int n) => '$n ${n == 1 ? 'item' : 'itens'}';

  // 03 Carrinho
  static const cartTitle = 'Carrinho';
  static const cartLoadError = 'Não deu pra carregar o carrinho';
  static const cartEmptyTitle = 'Seu carrinho está vazio';
  static const cartEmptyBody =
      'Escolha bolas, viseiras e camisetas na vitrine — retire na arena ou '
      'receba em casa.';
  static const seeStore = 'Ver a loja';
  static const myOrders = 'Meus pedidos';
  static const personalized = 'Personalizada';
  static const unknownProduct = 'Produto';
  static const qtyLess = 'Diminuir';
  static const qtyMore = 'Aumentar';
  static String remove(String name) => 'Remover $name';
  static const cartUpdateError =
      'Não deu pra atualizar o carrinho. Tente de novo em instantes.';

  static const receiveTitle = 'COMO RECEBER';
  static const receivePickup = 'Retirar na arena';
  static const receiveDelivery = 'Entregar';
  static const receiveNone =
      'A loja ainda não abriu retirada nem entrega. Volte em breve.';
  static const free = 'Grátis';

  // 04 Entrega
  static const addressesTitle = 'MEUS ENDEREÇOS';
  static const addressMain = 'PRINCIPAL';
  static const addAddress = 'Adicionar endereço';
  static const firstAddressTitle = 'Cadastre um endereço';
  static const firstAddressHint = 'Digite o CEP e a gente preenche o resto';
  static String editAddress(String label) => 'Editar $label';
  static const deadlineTitle = 'PRAZO';
  static String freeShippingGap(int cents) =>
      'Faltam ${price(cents)} pro frete grátis.';
  static const needAddress = 'Cadastre um endereço de entrega.';

  // Pagamento e cupom
  static const paymentTitle = 'PAGAMENTO';
  static const pix = 'Pix';
  static String pixOff(int pct) => ' · $pct% off';
  static const pixInstant = 'Aprovação na hora';
  static const couponHint = 'Cupom de desconto';
  static const couponApply = 'Aplicar';
  static const couponRemove = 'Remover';
  static const couponInvalid = 'Cupom inválido.';
  static const couponBlocker = 'Remova ou troque o cupom pra seguir.';

  // Resumo
  static String subtotal(int units) =>
      'Subtotal (${StoreCheckoutCopy.units(units)})';
  static String couponRow(String code) => 'Cupom $code';
  static const pixDiscount = 'Desconto Pix';
  static const pickupRow = 'Retirada na arena';
  static String shippingRow(String mode) => 'Frete · $mode';
  static const total = 'Total';
  static const totalWithShipping = 'Total com frete';
  static const quoting = 'Calculando o total…';
  static const quoteRetry = 'Tentar de novo';
  static const pay = 'Pagar com Pix';
  static const paying = 'Gerando o Pix…';
  static const totalChanged =
      'O total mudou · confira o novo valor antes de pagar.';
  static String safe(int exchangeDays) =>
      'Pagamento seguro · troca em $exchangeDays dias';

  // CPF
  static const cpfLabel = 'CPF DE QUEM PAGA';
  static const cpfHint = '000.000.000-00';
  static const cpfHelp = 'Sai no comprovante do Pix. Só pedimos uma vez.';
  static const cpfInvalid = 'CPF com 11 números.';

  // 05 Novo endereço
  static const newAddressTitle = 'Novo endereço';
  static const editAddressTitle = 'Editar endereço';
  static const cep = 'CEP';
  static const cepNotFound =
      'Não achamos esse CEP. Confira ou preencha na mão.';
  static const street = 'Rua';
  static const number = 'Número';
  static const complement = 'Complemento';
  static const complementHint = 'Apto, bloco…';
  static const district = 'Bairro';
  static const city = 'Cidade';
  static const uf = 'UF';
  static const recipient = 'Quem recebe';
  static const phone = 'Celular';
  static const phoneHint = '(00) 00000-0000';
  static const phoneHelp = 'Pra transportadora avisar na entrega';
  static const saveAs = 'SALVAR COMO';
  static const makeMain = 'Tornar endereço principal';
  static const saveAddress = 'Salvar endereço';
  static const savingAddress = 'Salvando…';
  static const deleteAddress = 'Excluir endereço';
  static const addressLimit =
      'Limite de endereços · exclua um antigo pra cadastrar outro.';
  static const addressSaveError =
      'Não deu pra salvar o endereço. Confira a conexão e tente de novo.';
  static const addressDeleteError =
      'Não deu pra excluir o endereço. Tente de novo em instantes.';
  static const addressDeleted = 'Endereço excluído';

  // 06 Pix
  static const pixTitle = 'Pagamento';
  static String orderSubtitle(String number) => 'Pedido #$number';
  static const payWithPix = 'Pague com Pix';
  static String expiresIn(String countdown) => 'EXPIRA EM $countdown';
  static const qrLabel = 'QR CODE PIX';
  static const copyPix = 'Copiar código Pix';
  static const copied = 'Copiado!';
  static const copyError = 'Não deu pra copiar. Tente de novo.';
  static const pixWillNotify = 'Assim que o Pix cair, a gente avisa por aqui.';
  static const bankStepsTitle = 'COMO PAGAR';
  static const bankSteps = [
    'Abra o app do seu banco e entre em Pix.',
    'Escolha Ler QR code ou Pix copia e cola.',
    'Confirme o valor. Esta tela muda sozinha quando o pagamento cair.',
  ];
  static const waitingPayment = 'Aguardando o pagamento…';
  static const pixExpiredKicker = 'PIX VENCIDO';
  static const pixExpiredTitle = 'O prazo do Pix acabou';
  static const pixExpiredBody =
      'Se você já pagou, a gente confirma em instantes. Se não, o pedido é '
      'cancelado e as peças voltam pra loja.';
  static const rebuildCart = 'Montar o carrinho de novo';
  static const paidTitle = 'Pagamento aprovado!';
  static const paidArena = 'Avisamos quando estiver pronto pra retirar.';
  static const paidHome = 'Avisamos quando sair pra entrega.';

  // 07 Pronto pra retirar / detalhe
  static const orderTitle = 'Meu pedido';
  static String orderSubtitleWithUnits(String number, int units) =>
      '#$number · ${StoreCheckoutCopy.units(units)}';
  static const pickupCode = 'CÓDIGO DE RETIRADA';
  static String showAt(String? counter) => 'Mostre no ${counter ?? 'balcão'}';
  static String pickupUntil(String deadline) => 'Retire até $deadline';
  static const directions = 'Como chegar';
  static const statusTitle = 'STATUS';
  static const personalizedTag = 'PERSONALIZADO';
  static String cancelReason(String reason) => 'Motivo: $reason';
  static String track(String? carrier) =>
      carrier != null ? 'Rastrear · $carrier' : 'Rastrear';
  static const rebuy = 'Comprar de novo';
  static const itemsTitle = 'ITENS';
  static const pickupWhere = 'RETIRADA';
  static const homeWhere = 'ENTREGA';
  static String refunded(int cents) => 'Reembolso: ${price(cents)}';
  static const detailsSoon = 'Os detalhes do pedido aparecem em instantes.';
  static const allOrders = 'Ver todos os pedidos';
  static const notFoundTitle = 'Não achamos esse pedido';
  static const notFoundBody =
      'Confira se entrou com a mesma conta da compra. Seus pedidos ficam em '
      '"Meus pedidos".';
  static const openLinkError = 'Não deu pra abrir o link.';

  // 08 Meus pedidos
  static const ordersTitle = 'Meus pedidos';
  static const ordersLoadError = 'Não deu pra carregar seus pedidos';
  static const ordersEmptyTitle = 'Você ainda não fez pedidos';
  static const ordersEmptyBody =
      'Quando comprar na Loja, o pedido aparece aqui — com o Pix, o código de '
      'retirada e a entrega.';
  static const searchHint = 'Buscar pedido ou produto';
  static const sectionActive = 'EM ANDAMENTO';
  static const sectionPast = 'ANTERIORES';
  static const noneWithFilter = 'Nenhum pedido com esse filtro.';
  static const payPix = 'Pagar Pix';
  static const seeCode = 'Ver código';
  static const trackShort = 'Rastrear';
  static const rebuyNothing =
      'Nada pra repor: os itens desse pedido saíram da loja ou são '
      'personalizados.';
  static const rebuyPartial =
      'Alguns itens ficaram de fora: personalizados ou fora da loja não '
      'voltam pro carrinho.';
  static const rebuyError =
      'Não deu pra montar o carrinho. Tente de novo em instantes.';
  static String orderNumber(String number) => '#$number';
  static const helpTitle = 'Precisa de ajuda?';
  static const helpExchange = 'Trocar ou devolver';
  static String helpExchangeBody(int days) =>
      'Até $days dias, na arena da retirada';
  static const helpRefunds = 'Reembolsos';
  static const helpRefundsBody =
      'Cancelado depois de pago gera reembolso, e a gente avisa';
}
