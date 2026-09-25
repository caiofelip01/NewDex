import {
  Badge,
  EmptyState,
  MiniBarChart,
  ProgressBar,
  SectionCard,
  StatCard,
} from "../Components/ui";
import { useApp } from "../context/AppContext";
import { formatMonthKeyLabel } from "../utils/appData";
import {
  getReferenceDate,
  summarizeAppointments,
  summarizeFinancial,
} from "../utils/businessMetrics";
import { clampPercent, formatCompactCurrency } from "../utils/format";

const SERVICE_COLORS = ["#FF6B2B", "#2ECC8E", "#3B82F6", "#A78BFA", "#FFB82E"];

export function DashboardPage() {
  const { data, openModal, closeModal, pushToast, saveGoal } = useApp();

  const agenda = Array.isArray(data.agenda) ? data.agenda : [];
  const clientes = Array.isArray(data.clientes) ? data.clientes : [];
  const estoque = Array.isArray(data.estoque) ? data.estoque : [];
  const equipe = Array.isArray(data.equipe) ? data.equipe : [];
  const financeiro = Array.isArray(data.financeiro) ? data.financeiro : [];
  const serie = Array.isArray(data.serie) ? data.serie : [];
  const metas = data.metas || {};

  const referenceDate = getReferenceDate(data);
  const monthKey = referenceDate.slice(0, 7);
  const dayAppointments = summarizeAppointments(agenda, referenceDate, "day");
  const monthAppointments = summarizeAppointments(agenda, referenceDate, "month");
  const monthFinancial = summarizeFinancial(financeiro, referenceDate, "month");
  const previousKey = getPreviousMonthKey(monthKey);
  const financialSeries = [...serie]
    .filter((item) => /^\d{4}-\d{2}$/.test(item.monthKey || ""))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .slice(-6)
    .map((item) => ({
      key: item.monthKey,
      mes: formatMonthKeyLabel(item.monthKey),
      faturamento: toNumber(item.faturamento),
      despesas: toNumber(item.despesas),
    }));
  const agendaHoje = dayAppointments.appointments;
  const concluidos = dayAppointments.completed;
  const pendentes = dayAppointments.pending;
  const faturadoHoje = dayAppointments.revenue;
  const receitaMes = monthFinancial.entradas;
  const receitaMesAnterior = toNumber(
    financialSeries.find((item) => item.key === previousKey)?.faturamento,
  );
  const receitaTrend = createTrend(
    receitaMes,
    receitaMesAnterior,
    formatMonthKeyLabel(previousKey),
  );
  const receitaMesLabel = formatMonthKeyLabel(monthKey);
  const ticketMedio = monthAppointments.completed.length
    ? monthAppointments.revenue / monthAppointments.completed.length
    : 0;
  const criticos = estoque.filter(
    (item) => toNumber(item.quantidade) <= toNumber(item.minimo),
  );
  const servicos = Object.entries(
    monthAppointments.completed.reduce((grouped, item) => {
      const serviceName = String(item.servico || "Sem serviço");
      grouped[serviceName] = (grouped[serviceName] || 0) + 1;
      return grouped;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maiorQuantidadeServico = servicos[0]?.[1] || 1;
  const ranking = equipe
    .map((member) => {
      const completed = monthAppointments.completed.filter(
        (appointment) =>
          appointment.barbeiroId === member.id ||
          (!appointment.barbeiroId && appointment.barbeiro === member.nome),
      );
      return {
        ...member,
        sessoes: completed.length,
        faturamento: completed.reduce(
          (total, appointment) => total + toNumber(appointment.valor),
          0,
        ),
      };
    })
    .sort((a, b) => toNumber(b.faturamento) - toNumber(a.faturamento));
  const metaFaturamento = toNumber(metas.faturamento);
  const metaAtual = receitaMes;
  const progressoMeta = metaFaturamento > 0
    ? clampPercent((metaAtual / metaFaturamento) * 100)
    : 0;

  function openMetaModal() {
    let metaValue = metaFaturamento;

    openModal({
      title: "Editar meta do mês",
      content: (
        <>
          <div className="form-field">
            <label className="lbl">Meta de faturamento (R$)</label>
            <input
              className="inp"
              defaultValue={metaValue}
              min="0.01"
              onChange={(event) => {
                metaValue = Number(event.target.value);
              }}
              step="0.01"
              type="number"
            />
          </div>
          <div className="form-field">
            <label className="lbl">Faturamento atual (R$)</label>
            <input
              className="inp"
              disabled
              min="0"
              value={metaAtual}
              step="0.01"
              type="number"
            />
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
              if (!Number.isFinite(metaValue) || metaValue <= 0) {
                pushToast("Informe uma meta maior que zero.", "err");
                return;
              }

              await saveGoal({
                faturamento: metaValue,
                monthKey,
              });
              closeModal();
              pushToast("Meta atualizada.");
            }}
            type="button"
          >
            Salvar meta
          </button>
        </>
      ),
    });
  }

  return (
    <>
      <div className="page-hd row between wrap">
        <div>
          <h1>Bom dia, equipe! 👋</h1>
          <p>Aqui está o resumo da sua barbearia hoje.</p>
        </div>
        <button
          className="btn"
          onClick={() => pushToast("Painel personalizável pronto para expansão.", "info")}
          type="button"
        >
          ⚙️ Personalizar painel
        </button>
      </div>

      {criticos.length ? (
        <div
          role="status"
          style={{
            background: "var(--orange-glow)",
            border: "1px solid var(--orange)",
            borderRadius: 14,
            padding: "13px 17px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            color: "var(--orange)",
            fontSize: 13,
          }}
        >
          ⚠️ <strong>{criticos.length} produto(s)</strong> com estoque crítico:{" "}
          {criticos.map((item) => item.produto).join(", ")}
        </div>
      ) : null}

      <div className="stat-grid sg-4">
        <StatCard
          color="var(--orange)"
          icon="✂️"
          label="Faturado hoje"
          sub={`${concluidos.length} atendimentos`}
          value={formatCompactCurrency(faturadoHoje)}
        />
        <StatCard
          color="var(--green)"
          icon="💵"
          label="Receita do mês"
          sub={receitaMesLabel}
          trend={receitaTrend}
          value={formatCompactCurrency(receitaMes)}
        />
        <StatCard
          color="var(--purple)"
          icon="👥"
          label="Clientes"
          sub="cadastrados"
          value={clientes.length}
        />
        <StatCard
          color="var(--blue)"
          icon="🎯"
          label="Ticket médio"
          sub="por atendimento no mês"
          value={formatCompactCurrency(ticketMedio)}
        />
      </div>

      <div className="grid-2">
        <SectionCard
          title="🎯 Meta do mês"
          action={
            <div className="row" style={{ gap: 8 }}>
              <Badge color="var(--orange)">{progressoMeta}%</Badge>
              <button
                aria-label="Editar meta do mês"
                className="ic-btn"
                onClick={openMetaModal}
                title="Editar meta"
                type="button"
              >
                ✏️
              </button>
            </div>
          }
        >
          <div className="row between wrap" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: "var(--txt2)" }}>
              {formatCompactCurrency(metaAtual)} de {formatCompactCurrency(metaFaturamento)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--orange)" }}>
              faltam {formatCompactCurrency(Math.max(0, metaFaturamento - metaAtual))}
            </span>
          </div>
          <ProgressBar
            value={progressoMeta}
            color="linear-gradient(90deg,var(--orange),var(--orange-dim))"
          />
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
            {progressoMeta >= 100
              ? "Meta atingida! Parabéns à equipe! 🎉"
              : "No ritmo atual, a meta deve ser atingida até o fim do mês. 📈"}
          </div>
        </SectionCard>

        <SectionCard
          title="📅 Agenda de hoje"
          action={<Badge color="var(--orange)">{pendentes.length} pendentes</Badge>}
        >
          {agendaHoje.length ? (
            <div style={{ padding: "4px 0" }}>
              {agendaHoje.map((item) => (
                <div
                  key={item.id}
                  className="row"
                  style={{ padding: "9px 0", borderBottom: "1px solid var(--brd)" }}
                >
                  <span
                    style={{
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      color: "var(--orange)",
                      minWidth: 46,
                    }}
                  >
                    {item.hora}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.cliente}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {item.servico} · {item.barbeiro}
                    </div>
                  </div>
                  <Badge color={getAppointmentStatusColor(item.status)}>
                    {getAppointmentStatusLabel(item.status)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="📅">Nenhum agendamento para hoje.</EmptyState>
          )}
        </SectionCard>

        <SectionCard title="🔥 Serviços mais vendidos">
          {servicos.length ? (
            servicos.map(([servico, quantidade], index) => (
              <div key={servico} style={{ marginBottom: 11 }}>
                <div className="row between" style={{ marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5 }}>{servico}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--txt2)" }}>
                    {quantidade}x
                  </span>
                </div>
                <ProgressBar
                  color={SERVICE_COLORS[index % SERVICE_COLORS.length]}
                  value={(quantidade / maiorQuantidadeServico) * 100}
                />
              </div>
            ))
          ) : (
            <EmptyState icon="🔥">Os serviços mais vendidos aparecerão aqui.</EmptyState>
          )}
        </SectionCard>

        <SectionCard title="💈 Ranking de profissionais">
          {ranking.length ? (
            ranking.map((item, index) => (
              <div key={item.id} className="row" style={{ gap: 11, marginBottom: 11 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: "var(--muted)", width: 22 }}>
                  #{index + 1}
                </span>
                <span
                  className="avatar"
                  style={{ background: item.cor, width: 30, height: 30, fontSize: 10 }}
                >
                  {item.avatar}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.nome}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>
                    {formatCompactCurrency(item.faturamento)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState icon="💈">Cadastre profissionais para acompanhar o ranking.</EmptyState>
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: 16 }}>
        <SectionCard title="📈 Evolução de faturamento">
          {financialSeries.length ? (
            <MiniBarChart
              color="var(--orange)"
              data={financialSeries.map((item) => ({
                label: item.mes,
                value: toNumber(item.faturamento),
              }))}
            />
          ) : (
            <EmptyState icon="📈">O histórico de faturamento aparecerá aqui.</EmptyState>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getPreviousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function createTrend(currentValue, previousValue, previousLabel) {
  if (previousValue <= 0) {
    return null;
  }

  const change = ((currentValue - previousValue) / previousValue) * 100;
  return {
    label: `${Math.abs(Math.round(change))}% vs ${previousLabel || "mês anterior"}`,
    up: change >= 0,
  };
}

function getAppointmentStatusColor(status) {
  if (status === "concluido") {
    return "var(--green)";
  }

  if (status === "confirmado") {
    return "var(--blue)";
  }

  return "var(--yellow)";
}

function getAppointmentStatusLabel(status) {
  if (status === "concluido") {
    return "✓ Feito";
  }

  if (status === "confirmado") {
    return "Confirmado";
  }

  return "Aguardando";
}
