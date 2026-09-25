import { Avatar, EmptyState, SectionCard, StatCard } from "../Components/ui";
import { useApp } from "../context/AppContext";
import { formatCompactCurrency, initials } from "../utils/format";

export function ClientesPage() {
  const { data, openModal, closeModal, pushToast, saveCustomer, removeCustomer } = useApp();
  const totalGasto = data.clientes.reduce((total, item) => total + toNumber(item.gasto), 0);
  const totalVisitas = data.clientes.reduce((total, item) => total + toNumber(item.visitas), 0);
  const ticketMedio = totalVisitas ? totalGasto / totalVisitas : 0;

  function openClientModal(client) {
    const draft = client
      ? { ...client }
      : {
          nome: "",
          telefone: "",
          instagram: "",
          email: "",
          nascimento: "",
          observacoes: "",
        };

    openModal({
      title: client ? "Editar cliente" : "Novo cliente",
      content: (
        <>
          <div className="form-field">
            <label className="lbl">Nome completo</label>
            <input
              className="inp"
              defaultValue={draft.nome}
              onChange={(event) => {
                draft.nome = event.target.value;
              }}
            />
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">WhatsApp / Telefone</label>
              <input
                className="inp"
                defaultValue={draft.telefone}
                onChange={(event) => {
                  draft.telefone = event.target.value;
                }}
              />
            </div>
            <div>
              <label className="lbl">Instagram</label>
              <input
                className="inp"
                defaultValue={draft.instagram}
                onChange={(event) => {
                  draft.instagram = event.target.value;
                }}
              />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">E-mail</label>
              <input
                className="inp"
                defaultValue={draft.email}
                onChange={(event) => {
                  draft.email = event.target.value;
                }}
              />
            </div>
            <div>
              <label className="lbl">Nascimento</label>
              <input
                className="inp"
                defaultValue={draft.nascimento}
                onChange={(event) => {
                  draft.nascimento = event.target.value;
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
              await saveCustomer(
                client
                  ? { ...client, ...draft }
                  : {
                      ...draft,
                      visitas: 0,
                      gasto: 0,
                      avatar: initials(draft.nome),
                      ultimaVisita: "",
                    },
                client?.id,
              );
              closeModal();
              pushToast(client ? "Cliente atualizado." : "Cliente criado.");
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
          <h1>Clientes</h1>
          <p>Base de clientes e relacionamento (CRM)</p>
        </div>
        <button className="btn btn-primary" onClick={() => openClientModal(null)} type="button">
          + Novo cliente
        </button>
      </div>

      <div className="stat-grid sg-3">
        <StatCard
          color="var(--purple)"
          icon="👥"
          label="Total"
          sub="cadastrados"
          value={data.clientes.length}
        />
        <StatCard
          color="var(--orange)"
          icon="🎯"
          label="Ticket médio"
          sub="por atendimento"
          value={formatCompactCurrency(ticketMedio)}
        />
        <StatCard
          color="var(--yellow)"
          icon="⭐"
          label="Visitas"
          sub="acumuladas"
          value={totalVisitas}
        />
      </div>

      <SectionCard title="Lista de clientes">
        {data.clientes.length ? (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th>Visitas</th>
                <th>Gasto total</th>
                <th>Última visita</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.clientes.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="av-row">
                      <Avatar color="var(--purple)" label={item.avatar} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.nome}</div>
                        {item.instagram ? (
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{item.instagram}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>{item.telefone}</td>
                  <td>{item.visitas}</td>
                  <td style={{ fontWeight: 700 }}>{formatCompactCurrency(item.gasto)}</td>
                  <td>{item.ultimaVisita ? item.ultimaVisita.split("-").reverse().join("/") : "—"}</td>
                  <td>
                    <div className="t-actions">
                      <button
                        className="ic-btn"
                        onClick={() => openClientModal(item)}
                        title="Editar"
                        type="button"
                      >
                        ✏️
                      </button>
                      <button
                        className="ic-btn del"
                        onClick={async () => {
                          await removeCustomer(item.id);
                          pushToast("Cliente removido.");
                        }}
                        title="Excluir"
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
        ) : (
          <EmptyState icon="👥">Nenhum cliente encontrado.</EmptyState>
        )}
      </SectionCard>
    </>
  );
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
