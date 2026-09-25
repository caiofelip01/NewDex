import { useState } from "react";

import { Badge, EmptyState, MiniBarChart, SectionCard, Segmented, StatCard } from "../Components/ui";
import { useApp } from "../context/AppContext";
import { formatMonthKeyLabel } from "../utils/appData";
import {
  FINANCIAL_PERIODS,
  getReferenceDate,
  summarizeFinancial,
} from "../utils/businessMetrics";
import { formatCompactCurrency, formatCurrency } from "../utils/format";

export function FinanceiroPage() {
  const { data, openModal, closeModal, pushToast, saveFinancialEntry, removeFinancialEntry } =
    useApp();
  const [period, setPeriod] = useState("month");
  const referenceDate = getReferenceDate(data);
  const summary = summarizeFinancial(data.financeiro, referenceDate, period);
  const { entradas, saidas, lucro, margem } = summary;
  const monthlySeries = [...(Array.isArray(data.serie) ? data.serie : [])]
    .filter((item) => /^\d{4}-\d{2}$/.test(item.monthKey || ""))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .slice(-6)
    .map((item) => ({
      monthKey: item.monthKey,
      label: formatMonthKeyLabel(item.monthKey),
      primary: Number(item.faturamento || 0),
      secondary: Number(item.despesas || 0),
    }));

  function openFinanceModal(entry) {
    if (entry && isGeneratedEntry(entry)) {
      pushToast("Lançamentos gerados devem ser alterados na operação de origem.", "info");
      return;
    }

    const draft = entry
      ? { ...entry }
      : {
          tipo: "entrada",
          descricao: "",
          categoria: "Serviços",
          valor: "",
          data: referenceDate,
        };

    openModal({
      title: entry ? "Editar lançamento" : "Novo lançamento",
      content: (
        <>
          <div className="form-row">
            <div>
              <label className="lbl">Tipo</label>
              <select
                className="inp"
                defaultValue={draft.tipo}
                onChange={(event) => {
                  draft.tipo = event.target.value;
                }}
              >
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </div>
            <div>
              <label className="lbl">Categoria</label>
              <input
                className="inp"
                defaultValue={draft.categoria}
                onChange={(event) => {
                  draft.categoria = event.target.value;
                }}
              />
            </div>
          </div>
          <div className="form-field">
            <label className="lbl">Descrição</label>
            <input
              className="inp"
              defaultValue={draft.descricao}
              onChange={(event) => {
                draft.descricao = event.target.value;
              }}
            />
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">Valor</label>
              <input
                className="inp"
                defaultValue={draft.valor}
                onChange={(event) => {
                  draft.valor = Number(event.target.value);
                }}
                type="number"
              />
            </div>
            <div>
              <label className="lbl">Data</label>
              <input
                className="inp"
                defaultValue={draft.data}
                onChange={(event) => {
                  draft.data = event.target.value;
                }}
                type="date"
              />
            </div>
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn" onClick={closeModal} type="button">
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              await saveFinancialEntry(entry ? { ...entry, ...draft } : draft, entry?.id);
              closeModal();
              pushToast(entry ? "Lançamento atualizado." : "Lançamento criado.");
            }}
            type="button"
          >
            Salvar
          </button>
        </>
      ),
    });
  }

  return (
    <>
      <div className="page-hd row between wrap">
        <div>
          <h1>Financeiro</h1>
          <p>Controle financeiro completo da operação</p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Segmented
            onChange={setPeriod}
            options={Object.entries(FINANCIAL_PERIODS).map(([value, label]) => ({ value, label }))}
            value={period}
          />
          <button className="btn btn-primary" onClick={() => openFinanceModal(null)} type="button">
            + Novo lançamento
          </button>
        </div>
      </div>

      <div className="stat-grid sg-4">
        <StatCard
          color="var(--green)"
          icon="📈"
          label="Entradas"
          sub={FINANCIAL_PERIODS[period].toLowerCase()}
          value={formatCompactCurrency(entradas)}
        />
        <StatCard
          color="var(--red)"
          icon="📉"
          label="Saídas"
          sub={FINANCIAL_PERIODS[period].toLowerCase()}
          value={formatCompactCurrency(saidas)}
        />
        <StatCard
          color="var(--orange)"
          icon="💰"
          label="Lucro"
          sub="resultado líquido"
          value={formatCompactCurrency(lucro)}
        />
        <StatCard color="var(--blue)" icon="🎯" label="Margem" sub="de lucro" value={`${margem}%`} />
      </div>

      <div className="grid-2">
        <SectionCard title="📊 Comparativo mensal">
          {monthlySeries.length ? (
            <MiniBarChart data={monthlySeries} dual />
          ) : (
            <EmptyState icon="📊">Os lançamentos formarão o comparativo mensal.</EmptyState>
          )}
        </SectionCard>
        <SectionCard title="Resumo financeiro">
          <div className="row between" style={{ padding: "11px 0", borderBottom: "1px solid var(--brd)" }}>
            <span style={{ fontSize: 13, color: "var(--txt2)" }}>Receita total</span>
            <span style={{ fontWeight: 700, color: "var(--green)" }}>{formatCurrency(entradas)}</span>
          </div>
          <div className="row between" style={{ padding: "11px 0", borderBottom: "1px solid var(--brd)" }}>
            <span style={{ fontSize: 13, color: "var(--txt2)" }}>Despesas totais</span>
            <span style={{ fontWeight: 700, color: "var(--red)" }}>{formatCurrency(saidas)}</span>
          </div>
          <div className="row between" style={{ padding: "11px 0" }}>
            <span style={{ fontSize: 13, color: "var(--txt2)" }}>Margem</span>
            <span style={{ fontWeight: 700, color: "var(--blue)" }}>{margem}%</span>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: 16 }}>
        <SectionCard title="Lançamentos">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...summary.entries]
                .sort((a, b) => b.data.localeCompare(a.data))
                .map((item) => (
                  <tr key={item.id}>
                    <td>{item.data.split("-").reverse().join("/")}</td>
                    <td style={{ fontWeight: 600 }}>{item.descricao}</td>
                    <td>
                      <Badge
                        color={
                          {
                            "Serviços": "#2ECC8E",
                            Produtos: "#3B82F6",
                            Estoque: "#3B82F6",
                            Fornecedor: "#FF6B2B",
                            Fixo: "#FFB82E",
                          }[item.categoria] || "#65636F"
                        }
                      >
                        {item.categoria}
                      </Badge>
                    </td>
                    <td>
                      <Badge color={item.tipo === "entrada" ? "var(--green)" : "var(--red)"}>
                        {item.tipo === "entrada" ? "Entrada" : "Saída"}
                      </Badge>
                    </td>
                    <td style={{ color: item.tipo === "entrada" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                      {item.tipo === "entrada" ? "+" : "−"}
                      {formatCurrency(item.valor)}
                    </td>
                    <td>
                      <div className="t-actions">
                        <button
                          className="ic-btn"
                          disabled={isGeneratedEntry(item)}
                          onClick={() => openFinanceModal(item)}
                          title={
                            isGeneratedEntry(item)
                              ? "Gerado automaticamente pela operação de origem"
                              : "Editar"
                          }
                          type="button"
                        >
                          ✏️
                        </button>
                        <button
                          className="ic-btn del"
                          disabled={isGeneratedEntry(item)}
                          onClick={async () => {
                            if (isGeneratedEntry(item)) {
                              pushToast(
                                "Lançamentos gerados devem ser removidos na operação de origem.",
                                "info",
                              );
                              return;
                            }
                            await removeFinancialEntry(item.id);
                            pushToast("Lançamento removido.");
                          }}
                          title={
                            isGeneratedEntry(item)
                              ? "Gerado automaticamente pela operação de origem"
                              : "Excluir"
                          }
                          type="button"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}

function isGeneratedEntry(entry) {
  return entry?.editavel === false || Boolean(entry?.origem && entry.origem !== "manual");
}
