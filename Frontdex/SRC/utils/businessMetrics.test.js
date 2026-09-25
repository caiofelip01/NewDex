import assert from "node:assert/strict";
import test from "node:test";

import {
  filterByPeriod,
  getPeriodRange,
  getReferenceDate,
  groupFinancialByMonth,
  summarizeAppointments,
  summarizeFinancial,
} from "./businessMetrics.js";

const financialEntries = [
  { id: "before-week", tipo: "entrada", valor: 7, data: "2025-12-28" },
  { id: "week-start", tipo: "entrada", valor: 10, data: "2025-12-29" },
  { id: "december-expense", tipo: "saida", valor: 2, data: "2025-12-31" },
  { id: "reference-day", tipo: "entrada", valor: 20, data: "2026-01-01" },
  { id: "week-end", tipo: "saida", valor: 3, data: "2026-01-04" },
  { id: "after-week", tipo: "entrada", valor: 30, data: "2026-01-05" },
  { id: "invalid-date", tipo: "entrada", valor: 999, data: "2026-02-30" },
];

function ids(items) {
  return items.map((item) => item.id);
}

test("filtro diário inclui somente a data de referência", () => {
  assert.deepEqual(ids(filterByPeriod(financialEntries, "2026-01-01", "day")), [
    "reference-day",
  ]);

  assert.deepEqual(summarizeFinancial(financialEntries, "2026-01-01", "day"), {
    entradas: 20,
    saidas: 0,
    lucro: 20,
    margem: 100,
    entries: [financialEntries[3]],
  });
});

test("semana começa na segunda e atravessa corretamente a virada do ano", () => {
  assert.deepEqual(getPeriodRange("2026-01-01", "week"), {
    start: "2025-12-29",
    end: "2026-01-04",
  });
  assert.deepEqual(ids(filterByPeriod(financialEntries, "2026-01-01", "week")), [
    "week-start",
    "december-expense",
    "reference-day",
    "week-end",
  ]);

  const summary = summarizeFinancial(financialEntries, "2026-01-01", "week");
  assert.equal(summary.entradas, 30);
  assert.equal(summary.saidas, 5);
  assert.equal(summary.lucro, 25);
  assert.equal(summary.margem, 83);
});

test("filtro mensal respeita a virada do mês e do ano", () => {
  assert.deepEqual(getPeriodRange("2026-01-31", "month"), {
    start: "2026-01-01",
    end: "2026-01-31",
  });
  assert.deepEqual(ids(filterByPeriod(financialEntries, "2026-01-01", "month")), [
    "reference-day",
    "week-end",
    "after-week",
  ]);

  assert.deepEqual(getPeriodRange("2024-02-10", "month"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
});

test("agrupamento mensal mantém dezembro e janeiro em anos distintos", () => {
  const grouped = groupFinancialByMonth(financialEntries);

  assert.deepEqual([...grouped.keys()], ["2025-12", "2026-01"]);
  assert.deepEqual(grouped.get("2025-12"), {
    entradas: 17,
    saidas: 2,
    count: 3,
  });
  assert.deepEqual(grouped.get("2026-01"), {
    entradas: 50,
    saidas: 3,
    count: 3,
  });
  assert.equal(grouped.has("2026-02"), false);
});

test("resumo de agenda usa o mesmo intervalo diário das métricas financeiras", () => {
  const appointments = [
    { id: "completed-today", status: "concluido", valor: 80, data: "2026-01-01" },
    { id: "scheduled-today", status: "agendado", valor: 50, data: "2026-01-01" },
    { id: "confirmed-today", status: "confirmado", valor: 40, data: "2026-01-01" },
    { id: "completed-yesterday", status: "concluido", valor: 120, data: "2025-12-31" },
  ];

  const summary = summarizeAppointments(appointments, "2026-01-01", "day");
  assert.deepEqual(ids(summary.appointments), [
    "completed-today",
    "scheduled-today",
    "confirmed-today",
  ]);
  assert.deepEqual(ids(summary.completed), ["completed-today"]);
  assert.deepEqual(ids(summary.pending), ["scheduled-today", "confirmed-today"]);
  assert.equal(summary.revenue, 80);
});

test("data de referência explícita prevalece e fallback usa a data válida mais recente", () => {
  assert.equal(
    getReferenceDate({
      referenceDate: "2026-01-01",
      financeiro: [{ data: "2027-02-02" }],
    }),
    "2026-01-01",
  );

  assert.equal(
    getReferenceDate({
      financeiro: [{ data: "2025-12-31" }],
      agenda: [{ data: "2026-01-02" }],
      movimentacoesEstoque: [{ data: "2026-01-01" }, { data: "2026-02-30" }],
    }),
    "2026-01-02",
  );
});
