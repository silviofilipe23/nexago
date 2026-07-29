# Cupom de desconto — exibir nos detalhes da reserva + aplicar no checkout mobile

Data: 2026-07-21

## Contexto

O feature de cupom de desconto foi implementado em 21/07 em dois commits:

- `24859ae` — backend (`functions/src/arena-coupons.ts`) + data layer Flutter (`ArenaCoupon`, `CouponsRepository`).
- `1c724d4` — portal web (Angular arena: gestão de cupons em `/painel/cupons`; Angular athlete: aplicar cupom no checkout `arena-payment.component.ts`).

O backend (`quoteArenaBooking`/`createArenaBooking` em `functions/src/arena-booking-create.ts`) já valida o cupom, calcula o desconto (cupom nunca acumula com promoção automática — vale o maior desconto, `decideCouponVsPromotion`) e grava `couponId`/`couponCode`/`couponDiscountReais` em cada doc `arenaBookings`. Isso já funciona hoje via checkout web do atleta.

O que falta, e é o escopo deste documento:

1. Nenhuma tela de detalhe de reserva (web ou Flutter, lado atleta ou lado arena) exibe o cupom aplicado.
2. O checkout mobile (Flutter) ainda não tem UI para o atleta aplicar um cupom — só o web tem.

## Não-escopo

- Mudanças no backend: zero. Os dois callables já aceitam `couponCode` e já retornam/persistem os três campos de cupom.
- Gestão de cupons (criar/listar/desativar): já existe nos dois lados (Angular arena e `CouponsRepository` Flutter, embora sem UI Flutter — fora do escopo aqui).
- Promoções automáticas (`arenas/{id}/promotions`): feature distinta e já completa, não é tocada.

## Decisão de exibição

Uma linha condicional (só aparece quando a reserva tem cupom aplicado) no formato:

```
Cupom: CODIGO (-R$ X,XX)
```

posicionada junto ao valor/pagamento já exibido em cada tela, seguindo o padrão visual de cada plataforma.

## 1. Angular arena (painel do gestor)

- `frontend/projects/arena/src/app/painel/bookings/arena-booking.model.ts`
  - `ArenaBooking` ganha `couponCode: string | null` e `couponDiscountReais: number | null`.
  - `arenaBookingFromDoc` lê `d['couponCode']` e `d['couponDiscountReais']` (mesmo padrão de `optionalTrimmed`/campo numérico já usado para os outros campos).
- `frontend/projects/arena/src/app/painel/bookings/panel-booking-detail.component.ts`
  - Card "Pagamento" (linhas 81-85): nova linha condicional (`@if (booking()!.couponCode; as code)`) — `Cupom` / `{{ code }} (-{{ formatBRL(booking()!.couponDiscountReais) }})`.

## 2. Angular athlete (portal do atleta)

- `frontend/projects/athlete/src/app/data/arena-bookings-repository.ts`
  - `ArenaBookingDoc` ganha `couponCode: string | null` e `couponDiscountReais: number`.
  - `bookingFromSnapshot` lê os dois campos do doc.
- `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.ts` / `.html`
  - **Novo card "Pagamento"** na coluna lateral (`bd-col--side`), porque hoje não existe nenhum lugar fixo mostrando o valor total da reserva — ele só aparece dentro do card "Rachar pagamento" (`showSplitCard()`), que é condicional a pagamento parcial/split.
  - O novo card mostra: Valor total (`formatBRL(b.amountReais)`), Forma de pagamento (`paymentMethodLabel()` — computed já existente e hoje não usado no template) e, condicionalmente, Cupom.
  - Posição: entre o card "Localização" e o card "Gerenciar".

## 3. Flutter — telas de exibição (sem mudar o checkout ainda)

### Atleta — "Minhas reservas"

- `nexago_app/lib/features/arenas/domain/my_booking_item.dart`
  - `MyBookingItem` ganha `couponCode`/`couponDiscountReais`, parseados em `fromFirestore` a partir de `data['couponCode']`/`data['couponDiscountReais']`.
- `nexago_app/lib/features/arenas/presentation/my_bookings/my_bookings_details_sheet.dart` (`BookingDetailsSheet`)
  - Nova `_MetaRow` (ícone `Icons.local_offer_outlined`) logo após a linha de pagamento (linha ~81), condicional a `item.couponCode != null`: `Cupom ${item.couponCode} (-${formatBRL(item.couponDiscountReais)})`.

### Gestor de arena — detalhe da reserva

- `nexago_app/lib/features/arena/presentation/widgets/arena_booking_detail_payment.dart` (`ArenaBookingDetailPayment`)
  - Já recebe `bookingData` cru (mapa do Firestore), então `couponCode`/`couponDiscountReais` já estão acessíveis sem mudar `ArenaManagerBooking`.
  - Nova `_BreakdownRow` (mesmo padrão visual de "Sinal PIX (já pago)"/"Restante na chegada", linhas 198-215), condicional a `bookingData?['couponCode']` existir, mostrando o cupom e o valor descontado.

## 4. Flutter — aplicar cupom no checkout mobile (capacidade nova)

Replica o padrão já existente em `arena-payment.component.ts` (Angular athlete).

### Camada de dados

- `nexago_app/lib/features/arenas/domain/arena_booking_quote.dart`
  - `ArenaBookingQuote` ganha `couponApplied` (bool), `couponId` (String?), `couponDiscountReais` (double).
- `nexago_app/lib/features/arenas/data/booking_service.dart`
  - `_bookingCallablePayload` ganha parâmetro opcional `couponCode`, incluído no payload só quando não-vazio (mesmo padrão do Angular `callablePayload`).
  - `quoteBooking({..., String? couponCode})` repassa pro payload; `_parseQuoteResponse` parseia os 3 campos de cupom da resposta.
  - `createBookingAtomically({..., String? couponCode})` repassa pro payload.
  - `CreateBookingResult` ganha `couponApplied`/`couponId`/`couponDiscountReais`, parseados da resposta do callable.

### Camada de UI — `ArenaBookingConfirmPage`

- Novo estado: `_couponController` (TextEditingController), `_couponApplying` (bool), `_couponError` (String?), `_appliedCouponCode` (String?), `_couponDiscountReais` (double).
- Novo método `_applyCoupon()`: chama `quoteBooking(args: args, couponCode: code)` **diretamente** (não passa pelo cache de `_maybeLoadQuote`/`_lastQuoteKey`, que não conhece cupom); atualiza `_quote` com o total já descontado.
  - Se `quote.couponApplied == false` (cupom digitado é pior que a promoção automática já aplicada) ou o callable lança erro (cupom inválido/expirado/esgotado): mostra a mensagem perto do campo via `_couponError`, **não bloqueia a reserva** — a cotação volta a valer sem cupom e o atleta segue em frente ou corrige o código. Mesma filosofia do web (`applyCoupon()`/`removeCoupon()`).
- Novo widget `widgets/booking_confirm/booking_confirm_coupon_field.dart`: campo de texto + botão "Aplicar"; quando aplicado, mostra chip "Cupom CODIGO aplicado (-R$ X,XX)" com opção de remover (`_removeCoupon()`, que volta a chamar `quoteBooking` sem `couponCode`). Inserido entre `BookingConfirmPriceSummary` e `BookingConfirmCancellationCard`.
- `_confirmWithPix` e `_finalizeBookingPayAtArena` passam `couponCode: _appliedCouponCode` para `createBookingAtomically`.
- `BookingConfirmPriceSummary` não muda: o total exibido já vem de `_displayAmount(args)` → `_quote?.amountReais`, que já reflete o desconto assim que o cupom é aplicado (mesmo mecanismo que já existe para promoções automáticas).

### Fora de escopo nesta camada

- `ArenaBookingPixPage`: não muda. Quando o fluxo PIX é usado, a reserva (já com cupom aplicado) é criada em `_confirmWithPix` antes de navegar pra essa tela — `amountToPayNowReais` retornado pelo servidor já vem descontado.

## Erros e casos de borda

- Cupom inválido/expirado/esgotado: erro mostrado perto do campo, reserva não é bloqueada (consistente nas 2 plataformas).
- Cupom pior que promoção automática já aplicada na quadra: mensagem explicativa, cupom não é aplicado, cotação segue com a promoção.
- Reserva sem cupom: nenhuma das novas linhas/cards aparece — comportamento hoje é preservado integralmente.
- Campos `couponCode`/`couponDiscountReais` ausentes em docs antigos (reservas criadas antes do cupom existir): tratados como `null`/`0`, mesma tolerância que os parsers já aplicam a outros campos opcionais.

## Testes

- **Flutter**: `flutter-test-engineer` deve cobrir `MyBookingItem.fromFirestore` (parse do cupom), `BookingService.quoteBooking`/`createBookingAtomically` (payload com/sem `couponCode`, parse da resposta) e o fluxo de `_applyCoupon`/`_removeCoupon` na página de confirmação (sucesso, cupom pior que promoção, erro de servidor).
- **Angular**: specs dos parsers (`arenaBookingFromDoc`, `bookingFromSnapshot`) cobrindo doc com e sem cupom.
- **QA manual em navegador** (obrigatório antes de fechar): aplicar cupom no checkout web (já existe, só validar que não regrediu), conferir exibição nas 4 telas de detalhe (Angular arena, Angular athlete, Flutter atleta, Flutter gestor) com reserva que tem cupom e reserva que não tem.
- **QA manual no simulador/dispositivo Flutter**: aplicar cupom no checkout mobile (sucesso, código inválido, cupom pior que promoção), confirmar reserva via PIX e via pagamento no local, conferir que o valor final bate com o mostrado no card de pagamento.
