import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildGeocodeQuery,
  geocodeBrazilianAddress,
  parseMapboxGeocoding,
} from "./geocode-address";

function jsonResponse(body: unknown, ok = true): Response {
  return {ok, json: async () => body} as Response;
}

describe("buildGeocodeQuery", () => {
  it("monta o endereço na ordem que o Mapbox entende", () => {
    const query = buildGeocodeQuery({
      logradouro: "Rua Felipe Schmidt",
      numero: "120",
      bairro: "Centro",
      city: "Florianópolis",
      state: "SC",
      cep: "88010000",
    });
    assert.equal(query, "Rua Felipe Schmidt, 120, Centro, Florianópolis, SC, 88010-000, Brasil");
  });

  it("pula os pedaços vazios em vez de deixar vírgula solta", () => {
    const query = buildGeocodeQuery({
      logradouro: "Rua Felipe Schmidt",
      numero: "",
      bairro: "",
      city: "Florianópolis",
      state: "SC",
      cep: "",
    });
    assert.equal(query, "Rua Felipe Schmidt, Florianópolis, SC, Brasil");
  });
});

describe("parseMapboxGeocoding", () => {
  it("inverte o center do Mapbox, que vem [lng, lat]", () => {
    const result = parseMapboxGeocoding({
      features: [{center: [-48.548, -27.5954], relevance: 0.98}],
    });
    assert.deepEqual(result, {latitude: -27.5954, longitude: -48.548});
  });

  it("devolve null quando não achou nada", () => {
    assert.equal(parseMapboxGeocoding({features: []}), null);
    assert.equal(parseMapboxGeocoding({}), null);
    assert.equal(parseMapboxGeocoding(null), null);
  });

  it("descarta match fraco — pino na cidade errada é pior que sem pino", () => {
    assert.equal(parseMapboxGeocoding({features: [{center: [-48.548, -27.5954], relevance: 0.3}]}), null);
  });

  it("descarta center malformado", () => {
    assert.equal(parseMapboxGeocoding({features: [{center: [-48.548], relevance: 1}]}), null);
    assert.equal(parseMapboxGeocoding({features: [{center: ["a", "b"], relevance: 1}]}), null);
  });

  it("recusa coordenada fora do planeta", () => {
    assert.equal(parseMapboxGeocoding({features: [{center: [-200, 95], relevance: 1}]}), null);
  });
});

describe("geocodeBrazilianAddress", () => {
  const address = {
    logradouro: "Rua Felipe Schmidt",
    numero: "120",
    bairro: "Centro",
    city: "Florianópolis",
    state: "SC",
    cep: "88010000",
  };

  it("consulta o Mapbox restrito ao Brasil e devolve a coordenada", async () => {
    const calls: string[] = [];
    const result = await geocodeBrazilianAddress(address, "tok_123", async (url) => {
      calls.push(String(url));
      return jsonResponse({features: [{center: [-48.548, -27.5954], relevance: 0.98}]});
    });
    assert.deepEqual(result, {latitude: -27.5954, longitude: -48.548});
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/api\.mapbox\.com\/geocoding\/v5\/mapbox\.places\//);
    assert.match(calls[0], /country=BR/);
    assert.match(calls[0], /limit=1/);
    assert.match(calls[0], /access_token=tok_123/);
  });

  it("escapa o endereço na URL", async () => {
    const calls: string[] = [];
    await geocodeBrazilianAddress(address, "tok_123", async (url) => {
      calls.push(String(url));
      return jsonResponse({features: []});
    });
    assert.ok(!calls[0].includes(" "), "URL não pode ter espaço cru");
    assert.ok(calls[0].includes("Schmidt"), "o endereço precisa chegar na URL");
  });

  it("sem token não vai à rede: cadastro sem mapa é melhor que cadastro travado", async () => {
    let called = false;
    const result = await geocodeBrazilianAddress(address, "", async () => {
      called = true;
      return jsonResponse({});
    });
    assert.equal(called, false);
    assert.equal(result, null);
  });

  it("erro de HTTP vira null", async () => {
    const result = await geocodeBrazilianAddress(address, "tok_123", async () => jsonResponse({}, false));
    assert.equal(result, null);
  });

  it("rede fora vira null em vez de derrubar a gravação", async () => {
    const result = await geocodeBrazilianAddress(address, "tok_123", async () => {
      throw new Error("ECONNRESET");
    });
    assert.equal(result, null);
  });
});
