import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppData } from "./appData.js";

function seriesByMonth(data) {
  return new Map(data.serie.map((item) => [item.monthKey, item]));
}

test("dados antigos sem monthKey inferem meses e anos a partir da data de referência", () => {
  const normalized = normalizeAppData({
    referenceDate: "2026-02-15",
    financeiro: [
      { id: "feb-income", tipo: "entrada", valor: "400", data: "2026-02-10" },
      { id: "feb-expense", tipo: "saida", valor: "40", data: "2026-02-11" },
    ],
    serie: [
      { mes: "Nov", faturamento: "100", despesas: "10" },
      { mes: "Dez", faturamento: "200", despesas: "20" },
      { mes: "Jan", faturamento: "300", despesas: "30" },
      { mes: "Fev", faturamento: "999", despesas: "99" },
    ],
    metas: { faturamento: "1000", atual: "999" },
  });

  assert.deepEqual(
    normalized.serie.map((item) => item.monthKey),
    ["2025-11", "2025-12", "2026-01", "2026-02"],
  );
  assert.deepEqual(
    normalized.serie.map((item) => ({
      monthKey: item.monthKey,
      faturamento: item.faturamento,
      despesas: item.despesas,
    })),
    [
      { monthKey: "2025-11", faturamento: 100, despesas: 10 },
      { monthKey: "2025-12", faturamento: 200, despesas: 20 },
      { monthKey: "2026-01", faturamento: 300, despesas: 30 },
      { monthKey: "2026-02", faturamento: 400, despesas: 40 },
    ],
  );
  assert.equal(normalized.metas.monthKey, "2026-02");
  assert.equal(normalized.metas.faturamento, 1000);
  assert.equal(normalized.metas.atual, 400);
});

test("todos os meses presentes no ledger reconciliam snapshots antigos", () => {
  const normalized = normalizeAppData({
    referenceDate: "2026-02-20",
    financeiro: [
      { id: "dec-income", tipo: "entrada", valor: 100, data: "2025-12-10" },
      { id: "dec-expense", tipo: "saida", valor: 30, data: "2025-12-11" },
      { id: "jan-income-1", tipo: "entrada", valor: 200, data: "2026-01-05" },
      { id: "jan-income-2", tipo: "entrada", valor: 50, data: "2026-01-06" },
      { id: "jan-expense", tipo: "saida", valor: 40, data: "2026-01-07" },
      { id: "feb-income", tipo: "entrada", valor: 300, data: "2026-02-01" },
      { id: "feb-expense", tipo: "saida", valor: 60, data: "2026-02-02" },
    ],
    serie: [
      { monthKey: "2025-11", mes: "Nov", faturamento: 900, despesas: 90 },
      { monthKey: "2025-12", mes: "Dez", faturamento: 999, despesas: 999 },
      { monthKey: "2026-01", mes: "Jan", faturamento: 999, despesas: 999 },
      { monthKey: "2026-02", mes: "Fev", faturamento: 999, despesas: 999 },
    ],
    metas: { faturamento: 1000, atual: 999 },
  });
  const byMonth = seriesByMonth(normalized);

  assert.deepEqual(
    {
      faturamento: byMonth.get("2025-11").faturamento,
      despesas: byMonth.get("2025-11").despesas,
    },
    { faturamento: 900, despesas: 90 },
  );
  assert.deepEqual(
    {
      faturamento: byMonth.get("2025-12").faturamento,
      despesas: byMonth.get("2025-12").despesas,
    },
    { faturamento: 100, despesas: 30 },
  );
  assert.deepEqual(
    {
      faturamento: byMonth.get("2026-01").faturamento,
      despesas: byMonth.get("2026-01").despesas,
    },
    { faturamento: 250, despesas: 40 },
  );
  assert.deepEqual(
    {
      faturamento: byMonth.get("2026-02").faturamento,
      despesas: byMonth.get("2026-02").despesas,
    },
    { faturamento: 300, despesas: 60 },
  );
  assert.equal(normalized.metas.atual, 300);
});

test("remover o último lançamento do mês atual zera série e valor realizado da meta", () => {
  const withCurrentEntry = normalizeAppData({
    referenceDate: "2026-02-12",
    financeiro: [
      { id: "current-income", tipo: "entrada", valor: 125, data: "2026-02-12" },
    ],
    serie: [
      { monthKey: "2026-01", mes: "Jan", faturamento: 500, despesas: 100 },
      { monthKey: "2026-02", mes: "Fev", faturamento: 125, despesas: 0 },
    ],
    metas: { monthKey: "2026-02", faturamento: 1000, atual: 125 },
  });

  const withoutCurrentEntry = normalizeAppData({
    ...withCurrentEntry,
    financeiro: [],
  });
  const currentMonth = seriesByMonth(withoutCurrentEntry).get("2026-02");

  assert.equal(currentMonth.faturamento, 0);
  assert.equal(currentMonth.despesas, 0);
  assert.equal(withoutCurrentEntry.metas.atual, 0);
  assert.equal(seriesByMonth(withoutCurrentEntry).get("2026-01").faturamento, 500);
});

test("strings numéricas são normalizadas em todas as entidades usadas nas métricas", () => {
  const normalized = normalizeAppData({
    referenceDate: "2026-03-05",
    clientes: [
      { id: "customer-1", nome: "Cliente", visitas: "3", gasto: "150.75" },
    ],
    equipe: [
      {
        id: "employee-1",
        nome: "Profissional",
        comissao: "35",
        sessoes: "4",
        faturamento: "220.5",
        dias: "2",
        especialidades: "Corte",
      },
    ],
    agenda: [
      {
        id: "appointment-1",
        cliente: "Cliente",
        barbeiro: "Profissional",
        dur: "45",
        valor: "70.25",
        data: "2026-03-05",
        status: "concluido",
      },
    ],
    estoque: [
      { id: "product-1", quantidade: "8", minimo: "3", preco: "12.5" },
    ],
    movimentacoesEstoque: [
      {
        id: "movement-1",
        quantidade: "5",
        custoUnitario: "12.5",
        total: "62.5",
        data: "2026-03-05",
      },
    ],
    financeiro: [
      { id: "entry-1", tipo: "entrada", valor: "70.25", data: "2026-03-05" },
    ],
    metas: { faturamento: "12000.50", atual: "999" },
  });

  assert.deepEqual(
    {
      visitas: normalized.clientes[0].visitas,
      gasto: normalized.clientes[0].gasto,
      comissao: normalized.equipe[0].comissao,
      sessoes: normalized.equipe[0].sessoes,
      faturamentoEquipe: normalized.equipe[0].faturamento,
      dias: normalized.equipe[0].dias,
      duracao: normalized.agenda[0].dur,
      valorAgenda: normalized.agenda[0].valor,
      quantidadeProduto: normalized.estoque[0].quantidade,
      minimo: normalized.estoque[0].minimo,
      preco: normalized.estoque[0].preco,
      quantidadeMovimento: normalized.movimentacoesEstoque[0].quantidade,
      custoUnitario: normalized.movimentacoesEstoque[0].custoUnitario,
      totalMovimento: normalized.movimentacoesEstoque[0].total,
      valorFinanceiro: normalized.financeiro[0].valor,
      meta: normalized.metas.faturamento,
      realizado: normalized.metas.atual,
    },
    {
      visitas: 3,
      gasto: 150.75,
      comissao: 35,
      sessoes: 4,
      faturamentoEquipe: 220.5,
      dias: 2,
      duracao: 45,
      valorAgenda: 70.25,
      quantidadeProduto: 8,
      minimo: 3,
      preco: 12.5,
      quantidadeMovimento: 5,
      custoUnitario: 12.5,
      totalMovimento: 62.5,
      valorFinanceiro: 70.25,
      meta: 12000.5,
      realizado: 70.25,
    },
  );
  assert.equal(normalized.agenda[0].clienteId, "customer-1");
  assert.equal(normalized.agenda[0].barbeiroId, "employee-1");
  assert.deepEqual(normalized.equipe[0].especialidades, []);
});

test("origem manual permanece editável e origens geradas ficam bloqueadas", () => {
  const normalized = normalizeAppData({
    referenceDate: "2026-03-05",
    financeiro: [
      { id: "legacy-manual", tipo: "entrada", valor: 10, data: "2026-03-05" },
      {
        id: "explicit-manual",
        tipo: "entrada",
        valor: 20,
        data: "2026-03-05",
        origem: "manual",
      },
      {
        id: "appointment-entry",
        tipo: "entrada",
        valor: 30,
        data: "2026-03-05",
        origem: "appointment",
        referenciaId: "appointment-1",
      },
      {
        id: "purchase-entry",
        tipo: "saida",
        valor: 40,
        data: "2026-03-05",
        origem: "inventory_purchase",
        referenciaId: "purchase-1",
      },
    ],
  });
  const byId = new Map(normalized.financeiro.map((entry) => [entry.id, entry]));

  assert.equal(byId.get("legacy-manual").origem, null);
  assert.equal(byId.get("legacy-manual").referenciaId, null);
  assert.equal(byId.get("legacy-manual").editavel, true);
  assert.equal(byId.get("explicit-manual").editavel, true);
  assert.equal(byId.get("appointment-entry").editavel, false);
  assert.equal(byId.get("purchase-entry").editavel, false);
});
