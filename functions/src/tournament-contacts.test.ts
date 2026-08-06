import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  collectParticipantUids,
  organizerContactFromUser,
} from "./tournament-contacts";

describe("collectParticipantUids", () => {
  it("dedupes and trims uids across registrations", () => {
    const uids = collectParticipantUids([
      {participantUids: ["a", "b "]},
      {participantUids: ["b", "c"]},
      {participantUids: ["", null]},
    ]);
    assert.deepEqual(uids.sort(), ["a", "b", "c"]);
  });

  it("ignores registrations without participantUids", () => {
    assert.deepEqual(
      collectParticipantUids([{teamId: "t1"}, {participantUids: "x"}]),
      [],
    );
  });
});

/** O perfil de organizador é o dado de negócio; `users/{uid}` é o fallback de
 *  quem nunca preencheu esse perfil e mesmo assim precisa ser encontrável. */
describe("organizerContactFromUser", () => {
  it("prefere o perfil de organizador ao cadastro pessoal", () => {
    assert.deepEqual(
      organizerContactFromUser({
        fullName: "João Pessoal",
        phoneNumber: "11 3333-4444",
        email: "pessoal@exemplo.com",
        organizerProfile: {
          displayName: "Arena Beach Cup",
          contactPhone: "11988887777",
          contactEmail: "contato@arenabeach.com",
        },
      }),
      {
        name: "Arena Beach Cup",
        whatsappPhone: "5511988887777",
        email: "contato@arenabeach.com",
      },
    );
  });

  it("sem perfil de organizador, cai no cadastro pessoal", () => {
    assert.deepEqual(
      organizerContactFromUser({
        fullName: "João Pessoal",
        phoneNumber: "(11) 98888-7777",
        email: "pessoal@exemplo.com",
      }),
      {
        name: "João Pessoal",
        whatsappPhone: "5511988887777",
        email: "pessoal@exemplo.com",
      },
    );
  });

  it("doc vazio não quebra: nome genérico e contato em branco", () => {
    assert.deepEqual(organizerContactFromUser({}), {
      name: "Organizador",
      whatsappPhone: "",
      email: "",
    });
  });
});
