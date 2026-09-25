import { useState } from "react";

import { Badge, EmptyState, SectionCard, Segmented, StatCard } from "../Components/ui";
import { useApp } from "../context/AppContext";
import { getReferenceDate, summarizeAppointments } from "../utils/businessMetrics";
import { formatCompactCurrency, formatCurrency } from "../utils/format";

export function AgendaPage() {
  const { data, openModal, closeModal, pushToast, saveAppointment, updateAppointmentStatus } =
    useApp();
  const [selectedDate, setSelectedDate] = useState(() => getReferenceDate(data));
  const [filtroBarbeiro, setFiltroBarbeiro] = useState("");
  const [filtroServico, setFiltroServico] = useState("");

  const daySummary = summarizeAppointments(data.agenda, selectedDate, "day");
  const concluidos = daySummary.completed;
  const faturado = daySummary.revenue;
  const filtrados = daySummary.appointments.filter(
    (item) =>
      (!filtroBarbeiro ||
        item.barbeiroId === filtroBarbeiro ||
        item.barbeiro === data.equipe.find((member) => member.id === filtroBarbeiro)?.nome) &&
      (!filtroServico || item.servico === filtroServico),
  );

  function openAppointmentModal(appointment) {
    const draft = appointment
      ? {
          ...appointment,
          clienteId:
            appointment.clienteId ||
            data.clientes.find((item) => item.nome === appointment.cliente)?.id ||
            null,
          barbeiroId:
            appointment.barbeiroId ||
            data.equipe.find((item) => item.nome === appointment.barbeiro)?.id ||
            "",
        }
      : {
          cliente: "",
          clienteId: null,
          barbeiro: data.equipe[0]?.nome || "",
          barbeiroId: data.equipe[0]?.id || "",
          servico: "Corte",
          hora: "09:00",
          valor: 45,
          status: "agendado",
          data: selectedDate,
        };

    openModal({
      title: appointment ? "Editar agendamento" : "Novo agendamento",
      content: (
        <>
          <div className="form-row">
            <div>
              <label className="lbl">Cliente</label>
              <input
                className="inp"
                defaultValue={draft.cliente}
                list="agenda-clientes"
                onChange={(event) => {
                  draft.cliente = event.target.value;
                  draft.clienteId =
                    data.clientes.find((item) => item.nome === event.target.value)?.id || null;
                }}
              />
              <datalist id="agenda-clientes">
                {data.clientes.map((item) => (
                  <option key={item.id} value={item.nome} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="lbl">Barbeiro</label>
              <select
                className="inp"
                defaultValue={draft.barbeiroId}
                onChange={(event) => {
                  const member = data.equipe.find((item) => item.id === event.target.value);
                  draft.barbeiroId = event.target.value;
                  draft.barbeiro = member?.nome || "";
                }}
              >
                {data.equipe.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">Serviço</label>
              <select
                className="inp"
                defaultValue={draft.servico}
                onChange={(event) => {
                  draft.servico = event.target.value;
                }}
              >
                {["Corte", "Barba", "Corte + Barba", "Corte + Barba + Sobrancelha"].map(
                  (item) => (
                    <option key={item}>{item}</option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="lbl">Hora</label>
              <input
                className="inp"
                defaultValue={draft.hora}
                onChange={(event) => {
                  draft.hora = event.target.value;
                }}
                type="time"
              />
            </div>
          </div>
          <div className="form-field">
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
              <label className="lbl">Status</label>
              <select
                className="inp"
                defaultValue={draft.status}
                onChange={(event) => {
                  draft.status = event.target.value;
                }}
              >
                <option value="agendado">Agendado</option>
                <option value="confirmado">Confirmado</option>
                <option value="concluido">Concluído</option>
              </select>
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
              await saveAppointment(
                {
                  ...draft,
                  dur: appointment?.dur || 45,
                },
                appointment?.id,
              );
              closeModal();
              pushToast(appointment ? "Agendamento atualizado." : "Agendamento criado.");
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
          <h1>Agenda</h1>
          <p>Gerencie os agendamentos do dia</p>
        </div>
        <button className="btn btn-primary" onClick={() => openAppointmentModal(null)} type="button">
          + Novo agendamento
        </button>
      </div>

      <div className="stat-grid sg-3">
        <StatCard
          color="var(--orange)"
          icon="📅"
          label="Agendamentos"
          sub={selectedDate.split("-").reverse().join("/")}
          value={daySummary.appointments.length}
        />
        <StatCard
          color="var(--green)"
          icon="✓"
          label="Concluídos"
          sub="atendidos"
          value={concluidos.length}
        />
        <StatCard
          color="var(--blue)"
          icon="💰"
          label="Faturado"
          sub="no dia"
          value={formatCompactCurrency(faturado)}
        />
      </div>

      <SectionCard
        title="Agenda do dia"
        action={
          <div className="row wrap" style={{ gap: 8 }}>
            <Segmented
              value="lista"
              onChange={() => null}
              options={[{ value: "lista", label: "Lista" }]}
            />
            <select
              className="inp inp-sm"
              onChange={(event) => setFiltroBarbeiro(event.target.value)}
              style={{ width: "auto" }}
              value={filtroBarbeiro}
            >
              <option value="">Todos os barbeiros</option>
              {data.equipe.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
            <input
              aria-label="Data da agenda"
              className="inp inp-sm"
              onChange={(event) => setSelectedDate(event.target.value)}
              style={{ width: "auto" }}
              type="date"
              value={selectedDate}
            />
            <select
              className="inp inp-sm"
              onChange={(event) => setFiltroServico(event.target.value)}
              style={{ width: "auto" }}
              value={filtroServico}
            >
              <option value="">Todos os serviços</option>
              {[...new Set(data.agenda.map((item) => item.servico))].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {filtrados.length ? (
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Barbeiro</th>
                <th>Valor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => (
                <tr key={item.id}>
                  <td style={{ color: "var(--orange)", fontWeight: 700 }}>{item.hora}</td>
                  <td style={{ fontWeight: 600 }}>{item.cliente}</td>
                  <td>{item.servico}</td>
                  <td>{item.barbeiro}</td>
                  <td style={{ fontWeight: 700 }}>{formatCurrency(item.valor)}</td>
                  <td>
                    <Badge
                      color={
                        item.status === "concluido"
                          ? "var(--green)"
                          : item.status === "confirmado"
                            ? "var(--blue)"
                            : "var(--yellow)"
                      }
                    >
                      {item.status === "concluido"
                        ? "Concluído"
                        : item.status === "confirmado"
                          ? "Confirmado"
                          : "Agendado"}
                    </Badge>
                  </td>
                  <td>
                    <div className="t-actions">
                      <button
                        className="ic-btn"
                        disabled={item.status === "concluido"}
                        onClick={async () => {
                          await updateAppointmentStatus(item.id, "concluido");
                          pushToast("Atendimento concluído.");
                        }}
                        title={item.status === "concluido" ? "Atendimento concluído" : "Concluir"}
                        type="button"
                      >
                        ✓
                      </button>
                      {item.status !== "concluido" ? (
                        <button
                          className="ic-btn"
                          onClick={async () => {
                            await updateAppointmentStatus(item.id, "confirmado");
                            pushToast("Confirmação enviada por WhatsApp.", "info");
                          }}
                          title="Confirmar"
                          type="button"
                        >
                          📲
                        </button>
                      ) : null}
                      <button
                        className="ic-btn"
                        onClick={() => openAppointmentModal(item)}
                        title="Editar"
                        type="button"
                      >
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon="📅">Nenhum agendamento com esses filtros.</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
