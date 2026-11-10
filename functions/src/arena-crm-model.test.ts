import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsToDate,
  aggregateBookings,
  buildOverview,
  contractView,
  conversionOf,
  customerKeyOf,
  installmentDueDate,
  renewalStartDate,
  subscriptionView,
  termEndDate,
  whatsappDigits,
  type BuildOverviewInput,
  type CrmBookingRecord,
  type CrmContractRecord,
  type CrmPlanOption,
  type ScheduleSubscriptionRecord,
} from "./arena-crm-model";

const TODAY = "2026-11-10"; // terça

function contract(o: Partial<CrmContractRecord> = {}): CrmContractRecord {
  return {
    id: "c1",
    arenaId: "arena1",
    customerKey: "a:u1",
    athleteId: "u1",
    customerName: "Rafael Moura",
    customerPhone: "(62) 98241-5530",
    planId: null,
    planName: "Noite 2x",
    period: "monthly",
    dueDay: 5,
    timesPerWeek: 2,
    monthlyPriceReais: 260,
    startDate: "2026-10-01",
    autoRenew: true,
    paidInstallments: 0,
    status: "active",
    canceledOn: null,
    cancelReason: null,
    renewedFromId: null,
    renewedToId: null,
    note: null,
    createdAt: null,
    ...o,
  };
}

function sub(o: Partial<ScheduleSubscriptionRecord> = {}): ScheduleSubscriptionRecord {
  return {
    id: "s1",
    planId: "p1",
    planName: "Futevôlei Noite",
    holderAthleteId: "u9",
    holderName: "Diego Santana",
    holderPhone: null,
    holderPhotoUrl: null,
    cycle: "monthly",
    monthlyPriceReais: 280,
    dueDay: 10,
    slotsCount: 1,
    status: "active",
    endsOn: null,
    endRequestedBy: null,
    startDate: "2026-06-01",
    ...o,
  };
}

function booking(o: Partial<CrmBookingRecord> = {}): CrmBookingRecord {
  return {athleteId: "u2", date: "2026-11-03", startTime: "19:00", status: "active", attendanceStatus: "pending", amountReais: 40, source: "platform", ...o};
}

/** Um avulso na mesma terça 19h nas últimas `weeks` semanas (a mais recente: 03/11). */
function tuesdays(weeks: number, o: Partial<CrmBookingRecord> = {}): CrmBookingRecord[] {
  return Array.from({length: weeks}, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 3 - 7 * i, 12));
    return booking({date: d.toISOString().slice(0, 10), ...o});
  });
}

describe("datas do contrato", () => {
  it("soma meses limitando o dia ao fim do mês", () => {
    assert.equal(addMonthsToDate("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonthsToDate("2026-11-15", 3), "2027-02-15");
  });

  it("o período termina um dia antes da mesma data N meses depois", () => {
    assert.equal(termEndDate("2026-11-15", "quarterly"), "2027-02-14");
    assert.equal(termEndDate("2026-01-01", "annual"), "2026-12-31");
    assert.equal(termEndDate("2026-03-01", "semiannual"), "2026-08-31");
  });

  it("a 1ª parcela vence no início; as outras no dia escolhido", () => {
    assert.equal(installmentDueDate("2026-11-15", 5, 0), "2026-11-15");
    assert.equal(installmentDueDate("2026-11-15", 5, 1), "2026-12-05");
    assert.equal(installmentDueDate("2026-11-15", 25, 3), "2027-02-25");
  });

  it("renovação começa no dia seguinte ao fim, ou hoje se já passou", () => {
    assert.equal(renewalStartDate(contract({period: "quarterly", startDate: "2026-09-01", autoRenew: false}), TODAY), "2026-12-01");
    assert.equal(renewalStartDate(contract({period: "monthly", startDate: "2026-08-01", autoRenew: false}), TODAY), TODAY);
  });
});

describe("contractView", () => {
  it("parcelas vencidas e não pagas deixam inadimplente, com atraso da mais antiga", () => {
    const v = contractView(contract(), TODAY);
    assert.equal(v.status, "overdue");
    assert.equal(v.overdueCount, 2); // 01/10 e 05/11
    assert.equal(v.overdueReais, 520);
    assert.equal(v.daysLate, 40);
  });

  it("em dia aponta o próximo vencimento", () => {
    const v = contractView(contract({paidInstallments: 2}), TODAY);
    assert.equal(v.status, "active");
    assert.equal(v.nextDueDate, "2026-12-05");
    assert.equal(v.overdueCount, 0);
  });

  it("vence no dia do vencimento sem atraso (só atrasa no dia seguinte)", () => {
    const v = contractView(contract({paidInstallments: 1, startDate: "2026-10-10", dueDay: 15}), "2026-11-15");
    assert.equal(v.status, "active");
    assert.equal(v.nextDueDate, "2026-11-15");
  });

  it("contrato fechado perto do fim fica vencendo; depois do fim, não renovou", () => {
    const c = contract({period: "quarterly", startDate: "2026-08-20", autoRenew: false, paidInstallments: 3});
    const before = contractView(c, TODAY);
    assert.equal(before.status, "expiring");
    assert.equal(before.endDate, "2026-11-19");
    assert.equal(before.daysToEnd, 9);
    assert.equal(contractView(c, "2026-11-25").status, "not_renewed");
    assert.equal(contractView({...c, renewedToId: "c2"}, "2026-11-25").status, "active");
  });

  it("renovação automática rola o fim para o ciclo corrente e nunca vira 'não renovou'", () => {
    const v = contractView(contract({period: "quarterly", startDate: "2026-01-10", paidInstallments: 11}), TODAY);
    assert.equal(v.endDate, "2027-01-09");
    assert.equal(v.status, "active");
  });

  it("contrato que acabou devendo é inadimplente, não 'não renovou'", () => {
    const v = contractView(contract({period: "quarterly", startDate: "2026-08-05", autoRenew: false, paidInstallments: 2}), TODAY);
    assert.equal(v.status, "overdue");
    assert.equal(v.overdueCount, 1);
  });

  it("cancelado não acumula parcela", () => {
    const v = contractView(contract({status: "canceled", canceledOn: "2026-10-20"}), TODAY);
    assert.equal(v.status, "canceled");
    assert.equal(v.overdueCount, 0);
  });
});

describe("subscriptionView (Planos de horário)", () => {
  it("assinatura aguardando o 1º pagamento não entra no CRM", () => {
    assert.equal(subscriptionView(sub({status: "pending_payment"}), [], TODAY), null);
  });

  it("mensalidade aberta vencida ou assinatura suspensa = inadimplente", () => {
    const v = subscriptionView(sub(), [{subscriptionId: "s1", amountReais: 280, dueDate: "2026-11-05", status: "open"}], TODAY);
    assert.equal(v?.status, "overdue");
    assert.equal(v?.overdueReais, 280);
    assert.equal(v?.daysLate, 5);
    assert.equal(subscriptionView(sub({status: "suspended"}), [], TODAY)?.status, "overdue");
  });

  it("saída pedida = vencendo; saída concluída pelo atleta = não renovou; pela arena = cancelado", () => {
    assert.equal(subscriptionView(sub({endsOn: "2026-12-01", endRequestedBy: "athlete"}), [], TODAY)?.status, "expiring");
    assert.equal(subscriptionView(sub({status: "canceled", endsOn: "2026-11-01", endRequestedBy: "athlete"}), [], TODAY)?.status, "not_renewed");
    assert.equal(subscriptionView(sub({status: "canceled", endsOn: "2026-11-01"}), [], TODAY)?.status, "canceled");
  });
});

describe("aggregateBookings", () => {
  it("conta só reservas do cliente que já aconteceram e separa plano de avulso", () => {
    const stats = aggregateBookings([
      booking({date: "2026-11-03"}),
      booking({date: "2026-11-04", isRecurring: true, amountReais: 0}),
      booking({date: "2026-11-05", status: "cancelled"}),
      booking({date: "2026-11-20"}), // futura
      booking({date: "2026-11-06", source: "class"}),
      booking({date: "2026-11-07", bookedAs: "professor"}),
      booking({date: "2026-11-08", attendanceStatus: "no_show"}),
      booking({date: "2026-04-30"}), // antes da janela de 6 meses
    ], TODAY);
    const s = stats.get("a:u2")!;
    const nov = s.months[s.months.length - 1]!;
    assert.equal(s.months.length, 6);
    assert.equal(s.months[0]!.month, "2026-06");
    assert.equal(nov.total, 3);
    assert.equal(nov.plan, 1);
    assert.equal(nov.avulso, 2);
    assert.equal(nov.avulsoReais, 80);
    assert.equal(s.lastVisitDate, "2026-11-04"); // o no_show de 08/11 não conta como visita
  });

  it("cliente só com nome casa pelo nome normalizado", () => {
    const stats = aggregateBookings([
      booking({athleteId: null, customerName: "João  Silva"}),
      booking({athleteId: null, customerName: "joao silva", date: "2026-11-04"}),
    ], TODAY);
    assert.equal(stats.get("n:joao silva")?.months[5]?.total, 2);
  });

  it("detecta o horário que se repete nas últimas 8 semanas", () => {
    const s = aggregateBookings(tuesdays(7), TODAY).get("a:u2")!;
    assert.deepEqual(s.pattern, [{weekday: 2, startTime: "19:00", weeks: 7}]);
    assert.equal(s.weekHits.filter(Boolean).length, 7);
  });
});

describe("conversão de avulso", () => {
  const plans: CrmPlanOption[] = [
    {id: "manha", name: "Manhã 1x", monthlyPriceReais: 200, timesPerWeek: 1, windows: [{weekday: 2, startTime: "07:00", endTime: "10:00"}]},
    {id: "noite", name: "Noite 1x", monthlyPriceReais: 120, timesPerWeek: 1, windows: [{weekday: 2, startTime: "18:00", endTime: "22:00"}]},
  ];

  it("avulso frequente vira oportunidade com o plano que cobre o horário dele", () => {
    const s = aggregateBookings(tuesdays(8), TODAY).get("a:u2")!;
    const conv = conversionOf(s, plans)!;
    assert.equal(conv.avulso90d, 8);
    assert.equal(conv.suggestion?.planId, "noite");
    assert.equal(conv.avgMonthlyReais, 106.67);
    assert.equal(conv.suggestion?.savingsReais, -13.33);
  });

  it("quem joga pouco não é oportunidade", () => {
    const s = aggregateBookings(tuesdays(3), TODAY).get("a:u2")!;
    assert.equal(conversionOf(s, plans), null);
  });
});

describe("buildOverview", () => {
  function input(o: Partial<BuildOverviewInput> = {}): BuildOverviewInput {
    return {
      today: TODAY,
      contracts: [],
      subscriptions: [],
      openCharges: [],
      bookings: [],
      contacts: [],
      plans: [],
      identities: new Map(),
      monthlyGoal: 5,
      ...o,
    };
  }

  it("monta as filas: inadimplente (mais atrasado primeiro), vence na semana, sumido e oportunidade", () => {
    const overview = buildOverview(input({
      contracts: [
        contract({id: "late", customerKey: "a:late", athleteId: "late", startDate: "2026-09-01", paidInstallments: 1}),
        contract({id: "less", customerKey: "a:less", athleteId: "less", startDate: "2026-10-01", paidInstallments: 1}),
        contract({id: "due", customerKey: "a:due", athleteId: "due", startDate: "2026-10-12", dueDay: 15, paidInstallments: 1}),
      ],
      bookings: [
        ...tuesdays(8, {athleteId: "walk"}),
        booking({athleteId: "due", date: "2026-11-09", isRecurring: true}),
        booking({athleteId: "less", date: "2026-11-09", isRecurring: true}),
      ],
    }));
    assert.deepEqual(overview.queues.overdue.map((q) => q.key), ["a:late", "a:less"]);
    assert.deepEqual(overview.queues.dueThisWeek.map((q) => [q.key, q.date]), [["a:due", "2026-11-15"]]);
    assert.deepEqual(overview.queues.absent.map((q) => q.key), ["a:late"]);
    assert.deepEqual(overview.queues.convert.map((q) => q.key), ["a:walk"]);
    assert.equal(overview.customers.find((c) => c.key === "a:walk")?.status, "walk_in");
  });

  it("contato recente desce o cliente na fila", () => {
    const overview = buildOverview(input({
      contracts: [
        contract({id: "late", customerKey: "a:late", athleteId: "late", startDate: "2026-09-01", paidInstallments: 1}),
        contract({id: "less", customerKey: "a:less", athleteId: "less", startDate: "2026-10-01", paidInstallments: 1}),
      ],
      contacts: [{id: "k1", customerKey: "a:late", contractId: "late", channel: "whatsapp", reason: "overdue", outcome: "promised_payment", note: null, at: "2026-11-09T14:00:00.000Z", byName: "Bruna"}],
    }));
    assert.deepEqual(overview.queues.overdue.map((q) => [q.key, q.contactedRecently]), [["a:less", false], ["a:late", true]]);
    assert.equal(overview.customers.find((c) => c.key === "a:late")?.lastContact?.byName, "Bruna");
  });

  it("junta contratos e Planos de horário na receita recorrente e no status", () => {
    const overview = buildOverview(input({
      contracts: [contract({paidInstallments: 2})],
      subscriptions: [sub()],
      identities: new Map([["a:u1", {name: "Rafael M.", photoUrl: "https://x/p.jpg", phone: null}]]),
    }));
    assert.equal(overview.kpis.members, 2);
    assert.equal(overview.kpis.mrrReais, 540);
    assert.equal(overview.kpis.mrrSeries[5]?.mrrReais, 540);
    const rafael = overview.customers.find((c) => c.key === "a:u1")!;
    assert.equal(rafael.name, "Rafael M.");
    assert.equal(rafael.whatsapp, "5562982415530");
    assert.equal(rafael.kind, "member");
  });

  it("taxa de renovação olha contratos fechados que terminaram nos últimos 90 dias", () => {
    const overview = buildOverview(input({
      contracts: [
        contract({id: "a", customerKey: "a:a", period: "monthly", startDate: "2026-09-01", autoRenew: false, paidInstallments: 1, renewedToId: "a2"}),
        contract({id: "a2", customerKey: "a:a", period: "quarterly", startDate: "2026-10-01", autoRenew: false, paidInstallments: 3, renewedFromId: "a"}),
        contract({id: "b", customerKey: "a:b", period: "monthly", startDate: "2026-09-15", autoRenew: false, paidInstallments: 1}),
      ],
    }));
    assert.equal(overview.kpis.ended90d, 2);
    assert.equal(overview.kpis.renewed90d, 1);
    assert.equal(overview.kpis.renewalRate90d, 50);
    assert.deepEqual(overview.queues.notRenewed.map((q) => q.key), ["a:b"]);
  });
});

describe("identidade", () => {
  it("chave do cliente e telefone para WhatsApp", () => {
    assert.equal(customerKeyOf("uid", "x"), "a:uid");
    assert.equal(customerKeyOf(null, " Ána  Lima "), "n:ana lima");
    assert.equal(customerKeyOf(null, " "), null);
    assert.equal(whatsappDigits("(62) 98241-5530"), "5562982415530");
    assert.equal(whatsappDigits("+55 62 98241-5530"), "5562982415530");
    assert.equal(whatsappDigits("1234"), null);
  });
});
