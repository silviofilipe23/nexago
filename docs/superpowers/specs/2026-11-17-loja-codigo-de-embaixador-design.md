# Código de embaixador na Loja

17/11/2026. Decisões tomadas com o dono no chat; o resto segue o que já existe no Squad
(atribuição por link/código, `codeScope`, ciclo de comissão) e no checkout da Loja.

## Decisões do dono

1. **Um desconto só por pedido, vale o maior.** Cupom da Loja e código de embaixador
   não somam. O checkout calcula os dois e aplica o maior.
2. **Cupom da Loja que vence tira o embaixador do pedido.** Sem desconto de indicação,
   sem comissão, sem registro de conversão.
3. **Comissão na Loja: % do contrato**, só na **1ª compra do seguidor na Loja**. É contada
   à parte das inscrições: comprar na Loja não tira a comissão da inscrição, e vice-versa.
4. **Soma com o Pix.** O % do embaixador sai dos produtos; o desconto automático do Pix
   sai do que sobrou (como um cupom que acumula com o Pix).
5. **Loja nasce desligada.** Quarta área no "Código vale em"; ninguém passa a valer na Loja
   sem alguém ligar.
6. "Cupons próprios" = os cupons da Loja (Backoffice › Loja › Cupons), que já funcionam no
   checkout. O trabalho é conviverem com o código de embaixador.

## Escopo: Loja como 4ª área (`store`)

`FollowerDiscountKind` ganha `store`.

| Camada | Campo | Ausente | Papel na Loja |
|---|---|---|---|
| Global | `rules.attribution.followerDiscountScope.store` | **desligada** | interruptor do programa na Loja |
| Nível | `rules.tiers.<nível>.codeScope.store` | ligada | só restringe |
| Contrato | `squadAmbassadors/{uid}.codeScope.store` | ligada | só restringe |

Na Loja o código existe só se **global ∧ nível ∧ contrato** deixam. Fora disso não há
atribuição (nem prévia, nem desconto, nem comissão). Nas outras áreas nada muda: o global
continua ligando/desligando só o desconto.

Por que a global é o interruptor: os pacotes dos níveis ficam congelados por versão no
contrato. Se a Loja nascesse desligada no nível, ligar exigiria aditivo para cada contrato.
Na global, ligar vale para todos já; nível e contrato restringem quem não deve.

Escopos gravados antes (sem `store`) continuam válidos: a validação aceita `store`
ausente.

## Preço (`priceCheckout`)

- Entrada nova: `squad` = atribuição resolvida no servidor (código digitado ou link) com
  o % de desconto que vale para o pagador (% do contrato; "só na primeira" por área, como
  na reserva).
- `squadCents = round(produtos × pct)`, nunca deixando o pedido abaixo do mínimo do Asaas.
  Sem frete, sem acréscimo do cartão.
- Com cupom válido **e** embaixador: aplica o maior. Empate: o cupom (é o que o atleta
  digitou por último na Loja).
  - Cupom vence → `squad.applied = false`, `squad.reason = "cupom_maior"`; o pedido sai
    sem embaixador.
  - Embaixador vence → o cupom volta com `problem = "nao_acumula"` (não bloqueia o
    checkout; a tela explica e deixa remover).
- O Pix incide sobre `produtos − desconto aplicado`.

## Pedido, comissão e pagamento

- `createStoreOrder` recalcula tudo no servidor. Com embaixador aplicado:
  - grava no pedido `squad: {ambassadorId, code, origin, pct, discountCents}`;
  - registra o desconto em `squadChargeDiscounts/{paymentId}` (`kind: "store"`,
    `sourceId: orderId`) — a nexaGO banca, o "só na primeira" usa esse registro;
  - cria a comissão pendente `squadCommissions/store_{orderId}` se o pagador ainda não tem
    conversão viva **na Loja**: `source: "store"`, `orderId`, `tournamentName: "Loja nexaGO"`,
    `categoryName: "Pedido NX-…"` (as telas de comissão já mostram esses dois campos),
    `baseRatio = (produtos pagos) / total` para a comissão não incidir sobre o frete.
- Código digitado inválido/fora do escopo no `createStoreOrder`: erro com
  `details.field = "squadCode"`, antes de cobrar. Link inválido: ignora em silêncio.
- Webhook da Loja:
  - confirmado → comissão `released` (`net × baseRatio`), desconto marcado como usado;
  - Pix vencido / pedido cancelado sem pagar → comissão `canceled` (`payment_failed`);
  - pago depois de cancelado (estornado) → comissão já cancelada, nada a fazer.
- "Uma conversão por atleta" passa a ser **por área**: inscrição olha só comissões de
  inscrição; Loja olha só as da Loja.

## Telas

- **Portal (`/loja/carrinho`) e app (carrinho):** o mesmo campo "Tem código de embaixador?"
  das inscrições (`purpose: "store"`), com a indicação por link já mostrada. O resumo ganha a
  linha "Indicação de {nome} · −R$". Cupom que perdeu para o embaixador mostra o motivo sem
  travar o botão de pagar.
- **Backoffice:** "Loja" nos toggles de "Código vale em" (nível, convite) e em "Onde o desconto
  do seguidor vale" (global, desligado por padrão); perfil/resumo mostram "Loja".
- **Meu Squad (portal e app):** a oferta do embaixador lista "Loja" quando valer.

## Fora

- Benefício do próprio embaixador comprando na Loja.
- Cupons do Clube de Vantagens na Loja.
- Estorno de pedido pago pela tela de Trocas & devoluções: o dinheiro ainda não sai por lá
  (fica pendente até o Financeiro da Loja); o cancelamento manual da comissão no backoffice
  continua sendo o caminho.
