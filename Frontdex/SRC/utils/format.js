// Formata valores monetários completos para tabelas e detalhes.
export function formatCurrency(value) {
  return `R$ ${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Resume valores grandes para cards e indicadores compactos.
export function formatCompactCurrency(value) {
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toFixed(1).replace(".", ",")}k`;
  }

  return `R$ ${Math.round(value || 0).toLocaleString("pt-BR")}`;
}

// Exibe datas curtas no padrão visual do dashboard.
export function formatShortDate(isoDate) {
  if (!isoDate) return "--";
  const [year, month, day] = isoDate.split("-");
  void year;
  return `${day}/${month}`;
}

// Gera iniciais para avatar quando não existe imagem.
export function initials(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

// Mantém percentuais sempre dentro do intervalo esperado pela UI.
export function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
