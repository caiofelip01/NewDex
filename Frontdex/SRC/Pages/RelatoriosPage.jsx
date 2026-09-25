import { useState } from "react";

import { useApp } from "../context/AppContext";
import { EmptyState, MiniBarChart, SectionCard, Segmented } from "../Components/ui";
import { formatMonthKeyLabel } from "../utils/appData";
import {
  FINANCIAL_PERIODS,
  getReferenceDate,
  summarizeAppointments,
  summarizeFinancial,
} from "../utils/businessMetrics";
import { formatCurrency } from "../utils/format";

export function RelatoriosPage() {
  const { data, pushToast } = useApp();
  const [period, setPeriod] = useState("month");
  const referenceDate = getReferenceDate(data);
  const financialSummary = summarizeFinancial(data.financeiro, referenceDate, period);
  const appointmentSummary = summarizeAppointments(data.agenda, referenceDate, period);
  const { entradas, saidas, lucro, margem } = financialSummary;
  const monthlySeries = [...(Array.isArray(data.serie) ? data.serie : [])]
    .filter((item) => /^\d{4}-\d{2}$/.test(item.monthKey || ""))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .slice(-6)
    .map((item) => ({
      label: formatMonthKeyLabel(item.monthKey),
      value: Number(item.faturamento || 0),
    }));
  const topServices = Object.entries(
    appointmentSummary.completed.reduce((grouped, item) => {
      grouped[item.servico] = (grouped[item.servico] || 0) + 1;
      return grouped;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const recorrentes = data.clientes
    .map((customer) => ({
      ...customer,
      visitas: appointmentSummary.completed.filter(
        (appointment) =>
          appointment.clienteId === customer.id ||
          (!appointment.clienteId && appointment.cliente === customer.nome),
      ).length,
    }))
    .filter((customer) => customer.visitas > 0)
    .sort((a, b) => b.visitas - a.visitas)
    .slice(0, 3);

  return (
    <>
      <div className="page-hd row between wrap">
        <div>
          <h1>Relatórios</h1>
          <p>Análises avançadas e exportação para apresentação</p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Segmented
            onChange={setPeriod}
            options={Object.entries(FINANCIAL_PERIODS).map(([value, label]) => ({ value, label }))}
            value={period}
          />
          {["PDF", "Excel", "CSV"].map((format) => (
            <button key={format} className="btn" onClick={() => pushToast(`Exportando relatório em ${format}...`, "info")} type="button">
              {format}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <SectionCard title="📊 Relatório financeiro">
          <ReportRow color="var(--green)" label="Receita" value={formatCurrency(entradas)} />
          <ReportRow color="var(--red)" label="Despesa" value={formatCurrency(saidas)} />
          <ReportRow color="var(--orange)" label="Lucro" value={formatCurrency(lucro)} />
          <ReportRow color="var(--blue)" label="Margem" value={`${margem}%`} />
        </SectionCard>
        <SectionCard title="📈 Evolução (6 meses)">
          {monthlySeries.length ? (
            <MiniBarChart color="var(--orange)" data={monthlySeries} />
          ) : (
            <EmptyState icon="📈">Os lançamentos formarão a evolução financeira.</EmptyState>
          )}
        </SectionCard>
      </div>

      <div className="grid-2">
        <SectionCard title="🔥 Serviços mais vendidos">
          {topServices.length ? (
            topServices.map(([service, count]) => (
              <div key={service} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--brd)" }}>
                <span style={{ fontSize: 13 }}>{service}</span>
                <span style={{ fontWeight: 700 }}>{count}x</span>
              </div>
            ))
          ) : (
            <EmptyState icon="🔥">Nenhum serviço concluído no período.</EmptyState>
          )}
        </SectionCard>
        <SectionCard title="⭐ Clientes mais recorrentes">
          {recorrentes.length ? (
            recorrentes.map((item) => (
              <div key={item.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--brd)" }}>
                <span className="av-row">
                  <span className="avatar" style={{ background: "var(--purple)", width: 28, height: 28, fontSize: 10 }}>
                    {item.avatar}
                  </span>
                  {item.nome}
                </span>
                <span style={{ fontWeight: 700 }}>{item.visitas} visitas</span>
              </div>
            ))
          ) : (
            <EmptyState icon="⭐">Nenhuma recorrência no período.</EmptyState>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function ReportRow({ label, value, color }) {
  return (
    <div className="row between" style={{ padding: "11px 0", borderBottom: "1px solid var(--brd)" }}>
      <span style={{ fontSize: 13, color: "var(--txt2)" }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 15, color }}>{value}</span>
    </div>
  );
}
