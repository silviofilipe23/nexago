import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  bookingSportCode,
  courtSportCodes,
  resolveBookingSport,
} from "./arena-booking-sport";

describe("bookingSportCode", () => {
  it("código e rótulo legado viram o código do catálogo", () => {
    assert.equal(bookingSportCode("beachTennis"), "beachTennis");
    assert.equal(bookingSportCode("Beach tennis"), "beachTennis");
    assert.equal(bookingSportCode("Vôlei indoor"), "indoorVolleyball");
  });

  it("pickleball segue como texto; superfície e vazio não são esporte", () => {
    assert.equal(bookingSportCode("pickleball"), "Pickleball");
    assert.equal(bookingSportCode("Areia"), null);
    assert.equal(bookingSportCode("  "), null);
    assert.equal(bookingSportCode(42), null);
  });
});

describe("courtSportCodes", () => {
  it("lê types sem repetir código e rótulo do mesmo esporte", () => {
    assert.deepEqual(
      courtSportCodes({types: ["Beach tennis", "beachTennis", "Areia", "futevolei"]}),
      ["beachTennis", "footvolley"],
    );
  });

  it("cai no legado type quando não há types", () => {
    assert.deepEqual(courtSportCodes({type: "Vôlei de praia"}), ["beachVolleyball"]);
    assert.deepEqual(courtSportCodes({types: [], type: "Padel"}), ["padel"]);
    assert.deepEqual(courtSportCodes({}), []);
  });
});

describe("resolveBookingSport", () => {
  const multi = {types: ["beachTennis", "beachVolleyball"]};

  it("grava o código do esporte escolhido entre os da quadra", () => {
    assert.equal(resolveBookingSport("beachVolleyball", multi), "beachVolleyball");
    assert.equal(resolveBookingSport("Beach tennis", multi), "beachTennis");
  });

  it("recusa esporte que a quadra não oferece", () => {
    assert.throws(
      () => resolveBookingSport("padel", multi),
      /não é praticado nesta quadra/,
    );
  });

  it("recusa valor que não é esporte", () => {
    assert.throws(() => resolveBookingSport("Areia", multi), /Esporte da reserva inválido/);
  });

  it("quadra sem esporte cadastrado aceita qualquer esporte conhecido", () => {
    assert.equal(resolveBookingSport("tennis", {}), "tennis");
    assert.equal(resolveBookingSport("Pickleball", {types: ["Areia"]}), "Pickleball");
  });

  it("sem escolha (app antigo): carimba o único esporte da quadra", () => {
    assert.equal(resolveBookingSport(undefined, {types: ["Futevôlei"]}), "footvolley");
    assert.equal(resolveBookingSport("", {types: ["Futevôlei"]}), "footvolley");
  });

  it("sem escolha e quadra com vários ou nenhum esporte: null", () => {
    assert.equal(resolveBookingSport(undefined, multi), null);
    assert.equal(resolveBookingSport(null, {}), null);
  });
});
