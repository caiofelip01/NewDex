const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const FINANCIAL_PERIODS = {
  day: "Hoje",
  week: "Semana",
  month: "Mês",
  all: "Tudo",
};

export function getReferenceDate(data) {
  if (isDateKey(data?.referenceDate)) {
    return data.referenceDate;
  }

  const candidates = [
    ...(Array.isArray(data?.financeiro) ? data.financeiro.map((item) => item?.data) : []),
    ...(Array.isArray(data?.agenda) ? data.agenda.map((item) => item?.data) : []),
    ...(Array.isArray(data?.movimentacoesEstoque)
      ? data.movimentacoesEstoque.map((item) => item?.data)
      : []),
  ].filter(isDateKey);

  return candidates.sort().at(-1) || getLocalDateKey();
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMonthKey(dateKey) {
  return isDateKey(dateKey) ? dateKey.slice(0, 7) : null;
}

export function filterByPeriod(items, referenceDate, period = "month", dateField = "data") {
  const safeItems = Array.isArray(items) ? items : [];
  if (period === "all") {
    return safeItems;
  }

  const range = getPeriodRange(referenceDate, period);
  if (!range) {
    return [];
  }

  return safeItems.filter((item) => {
    const dateKey = item?.[dateField];
    return isDateKey(dateKey) && dateKey >= range.start && dateKey <= range.end;
  });
}

export function summarizeFinancial(entries, referenceDate, period = "month") {
  const periodEntries = filterByPeriod(entries, referenceDate, period);
  const totals = periodEntries.reduce(
    (summary, entry) => {
      const amount = toNumber(entry?.valor);
      if (entry?.tipo === "entrada") {
        summary.entradas += amount;
      } else if (entry?.tipo === "saida") {
        summary.saidas += amount;
      }
      return summary;
    },
    { entradas: 0, saidas: 0 },
  );

  const lucro = totals.entradas - totals.saidas;
  return {
    ...totals,
    lucro,
    margem: totals.entradas ? Math.round((lucro / totals.entradas) * 100) : 0,
    entries: periodEntries,
  };
}

export function summarizeAppointments(appointments, referenceDate, period = "day") {
  const periodAppointments = filterByPeriod(appointments, referenceDate, period);
  const completed = periodAppointments.filter((item) => item?.status === "concluido");
  return {
    appointments: periodAppointments,
    completed,
    pending: periodAppointments.filter(
      (item) => item?.status === "agendado" || item?.status === "confirmado",
    ),
    revenue: completed.reduce((total, item) => total + toNumber(item?.valor), 0),
  };
}

export function groupFinancialByMonth(entries) {
  const grouped = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const monthKey = getMonthKey(entry?.data);
    if (!monthKey) {
      continue;
    }

    const current = grouped.get(monthKey) || { entradas: 0, saidas: 0, count: 0 };
    const amount = toNumber(entry?.valor);
    if (entry?.tipo === "entrada") {
      current.entradas += amount;
    } else if (entry?.tipo === "saida") {
      current.saidas += amount;
    }
    current.count += 1;
    grouped.set(monthKey, current);
  }

  return grouped;
}

export function getPeriodRange(referenceDate, period) {
  if (!isDateKey(referenceDate)) {
    return null;
  }

  if (period === "day") {
    return { start: referenceDate, end: referenceDate };
  }

  const reference = parseDateKey(referenceDate);
  if (period === "week") {
    const day = reference.getUTCDay();
    const start = addUtcDays(reference, -((day + 6) % 7));
    return { start: formatUtcDateKey(start), end: formatUtcDateKey(addUtcDays(start, 6)) };
  }

  if (period === "month") {
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    return {
      start: formatUtcDateKey(new Date(Date.UTC(year, month, 1))),
      end: formatUtcDateKey(new Date(Date.UTC(year, month + 1, 0))),
    };
  }

  return null;
}

export function isDateKey(value) {
  if (!DATE_KEY_PATTERN.test(String(value || ""))) {
    return false;
  }

  return formatUtcDateKey(parseDateKey(value)) === value;
}

function parseDateKey(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatUtcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
