import { getMonthKey, getReferenceDate, groupFinancialByMonth } from "./businessMetrics.js";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Normaliza tanto o snapshot vindo da API quanto dados antigos do modo demo.
// Os lançamentos financeiros são a fonte de verdade para totais do mês.
export function normalizeAppData(data) {
  if (!data || typeof data !== "object") {
    return data;
  }

  const referenceDate = getReferenceDate(data);
  const clientes = normalizeCustomers(data.clientes);
  const equipe = normalizeEmployees(data.equipe);
  const financeiro = normalizeFinancialEntries(data.financeiro);
  const agenda = normalizeAppointments(data.agenda, clientes, equipe);
  const estoque = normalizeProducts(data.estoque);
  const movimentacoesEstoque = normalizeStockMovements(data.movimentacoesEstoque);
  const monthKey = getMonthKey(referenceDate);
  const groupedFinancial = groupFinancialByMonth(financeiro);
  const serie = reconcileMonthlySeries(data.serie, groupedFinancial, monthKey);
  const currentTotals = groupedFinancial.get(monthKey) || { entradas: 0, saidas: 0 };

  return {
    ...data,
    referenceDate,
    agenda,
    clientes,
    equipe,
    estoque,
    financeiro,
    movimentacoesEstoque,
    serie,
    metas: {
      ...(data.metas || {}),
      monthKey,
      faturamento: toNumber(data.metas?.faturamento),
      atual: currentTotals.entradas,
    },
    boards: Array.isArray(data.boards) ? data.boards : [],
    comunicados: Array.isArray(data.comunicados) ? data.comunicados : [],
    checklists: data.checklists && typeof data.checklists === "object" ? data.checklists : {},
    notifs: Array.isArray(data.notifs) ? data.notifs : [],
  };
}

export function formatMonthKeyLabel(monthKey) {
  const normalizedMonthKey = normalizeMonthKey(monthKey);
  if (!normalizedMonthKey) {
    return "mês atual";
  }

  const [year, month] = normalizedMonthKey.split("-");
  const monthIndex = Number(month) - 1;
  return `${MONTH_LABELS[monthIndex] || month} ${year}`;
}

function normalizeAppointments(items, customers, employees) {
  const customerByName = new Map(customers.map((item) => [item.nome, item.id]));
  const employeeByName = new Map(employees.map((item) => [item.nome, item.id]));

  return asArray(items).map((item) => ({
    ...item,
    clienteId: item.clienteId || customerByName.get(item.cliente) || null,
    barbeiroId: item.barbeiroId || employeeByName.get(item.barbeiro) || null,
    dur: toNumber(item.dur, 45),
    valor: toNumber(item.valor),
  }));
}

function normalizeCustomers(items) {
  return asArray(items).map((item) => ({
    ...item,
    visitas: toNumber(item.visitas),
    gasto: toNumber(item.gasto),
  }));
}

function normalizeEmployees(items) {
  return asArray(items).map((item) => ({
    ...item,
    comissao: toNumber(item.comissao),
    sessoes: toNumber(item.sessoes),
    faturamento: toNumber(item.faturamento),
    dias: toNumber(item.dias),
    especialidades: Array.isArray(item.especialidades) ? item.especialidades : [],
  }));
}

function normalizeProducts(items) {
  return asArray(items).map((item) => ({
    ...item,
    quantidade: toNumber(item.quantidade),
    minimo: toNumber(item.minimo),
    preco: toNumber(item.preco),
  }));
}

function normalizeFinancialEntries(items) {
  return asArray(items).map((item) => {
    const generated = item.origem === "appointment" || item.origem === "inventory_purchase";
    return {
      ...item,
      valor: toNumber(item.valor),
      origem: item.origem || null,
      referenciaId: item.referenciaId || null,
      editavel: item.editavel ?? !generated,
    };
  });
}

function normalizeStockMovements(items) {
  return asArray(items).map((item) => ({
    ...item,
    quantidade: toNumber(item.quantidade),
    custoUnitario: toNumber(item.custoUnitario),
    total: toNumber(item.total),
  }));
}

function reconcileMonthlySeries(series, groupedFinancial, currentMonthKey) {
  const normalizedSeries = inferSeriesMonthKeys(series, currentMonthKey);
  const byMonth = new Map(normalizedSeries.map((item) => [item.monthKey, item]));

  // Todos os meses presentes no livro-razão substituem snapshots antigos.
  for (const [monthKey, totals] of groupedFinancial) {
    const previous = byMonth.get(monthKey);
    byMonth.set(monthKey, {
      ...(previous || {}),
      monthKey,
      mes: formatMonthLabelFromKey(monthKey),
      faturamento: totals.entradas,
      despesas: totals.saidas,
    });
  }

  // O mês de referência também deve zerar quando seu último lançamento for removido.
  if (currentMonthKey && !groupedFinancial.has(currentMonthKey)) {
    const previous = byMonth.get(currentMonthKey);
    byMonth.set(currentMonthKey, {
      ...(previous || {}),
      monthKey: currentMonthKey,
      mes: formatMonthLabelFromKey(currentMonthKey),
      faturamento: 0,
      despesas: 0,
    });
  }

  return [...byMonth.values()]
    .filter((item) => normalizeMonthKey(item.monthKey))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function inferSeriesMonthKeys(series, currentMonthKey) {
  const safeSeries = asArray(series);
  if (!currentMonthKey) {
    return [];
  }

  const [referenceYear, referenceMonth] = currentMonthKey.split("-").map(Number);
  return safeSeries.map((item, index) => {
    const explicitMonthKey = normalizeMonthKey(item?.monthKey);
    const inferredDate = new Date(
      Date.UTC(referenceYear, referenceMonth - 1 - (safeSeries.length - 1 - index), 1),
    );
    const monthKey = explicitMonthKey || inferredDate.toISOString().slice(0, 7);

    return {
      ...item,
      monthKey,
      mes: item?.mes || formatMonthLabelFromKey(monthKey),
      faturamento: toNumber(item?.faturamento),
      despesas: toNumber(item?.despesas),
    };
  });
}

function formatMonthLabelFromKey(monthKey) {
  const normalizedMonthKey = normalizeMonthKey(monthKey);
  if (!normalizedMonthKey) {
    return "";
  }

  const monthIndex = Number(normalizedMonthKey.slice(5, 7)) - 1;
  return MONTH_LABELS[monthIndex] || normalizedMonthKey.slice(5, 7);
}

function normalizeMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || "")) ? String(value) : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
