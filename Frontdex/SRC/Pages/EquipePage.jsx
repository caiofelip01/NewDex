import { Avatar, Badge, MiniBarChart, SectionCard } from "../Components/ui";
import { useApp } from "../context/AppContext";
import { getReferenceDate, summarizeAppointments } from "../utils/businessMetrics";
import { formatCompactCurrency } from "../utils/format";

export function EquipePage() {
  const { data, openModal, closeModal, pushToast, saveEmployee } = useApp();
  const referenceDate = getReferenceDate(data);
  const completedThisMonth = summarizeAppointments(data.agenda, referenceDate, "month").completed;
  const monthlyProduction = data.equipe.map((member) => ({
    label: member.avatar,
    value: completedThisMonth
      .filter(
        (appointment) =>
          appointment.barbeiroId === member.id ||
          (!appointment.barbeiroId && appointment.barbeiro === member.nome),
      )
      .reduce((total, appointment) => total + Number(appointment.valor || 0), 0),
  }));

  function openTeamModal(member) {
    const draft = member
      ? { ...member }
      : {
          nome: "",
          cargo: "Barbeiro",
          telefone: "",
          email: "",
          admissao: "",
          especialidades: [],
          comissao: 35,
          avatar: "",
          cor: "#FF6B2B",
          sessoes: 0,
          faturamento: 0,
          dias: 0,
        };

    openModal({
      title: member ? "Editar profissional" : "Novo profissional",
      content: (
        <>
          <div className="form-row">
            <div>
              <label className="lbl">Nome</label>
              <input
                className="inp"
                defaultValue={draft.nome}
                onChange={(event) => {
                  draft.nome = event.target.value;
                }}
              />
            </div>
            <div>
              <label className="lbl">Cargo</label>
              <input
                className="inp"
                defaultValue={draft.cargo}
                onChange={(event) => {
                  draft.cargo = event.target.value;
                }}
              />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">Telefone</label>
              <input
                className="inp"
                defaultValue={draft.telefone}
                onChange={(event) => {
                  draft.telefone = event.target.value;
                }}
              />
            </div>
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
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">Comissão (%)</label>
              <input
                className="inp"
                defaultValue={draft.comissao}
                onChange={(event) => {
                  draft.comissao = Number(event.target.value);
                }}
                type="number"
              />
            </div>
            <div>
              <label className="lbl">Admissão</label>
              <input
                className="inp"
                defaultValue={draft.admissao}
                onChange={(event) => {
                  draft.admissao = event.target.value;
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
              await saveEmployee(member ? { ...member, ...draft } : draft, member?.id);
              closeModal();
              pushToast(member ? "Profissional atualizado." : "Profissional criado.");
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
          <h1>Equipe</h1>
          <p>Profissionais, produtividade e desempenho</p>
        </div>
        <button className="btn btn-primary" onClick={() => openTeamModal(null)} type="button">
          + Novo profissional
        </button>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        {data.equipe.map((member) => (
          <SectionCard
            key={member.id}
            title={member.nome}
            action={
              <button className="ic-btn" onClick={() => openTeamModal(member)} title="Editar" type="button">
                ✏️
              </button>
            }
          >
            <div className="av-row" style={{ marginBottom: 14 }}>
              <Avatar color={member.cor} label={member.avatar} size={44} />
              <div>
                <div style={{ fontWeight: 700 }}>{member.cargo}</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>{member.telefone}</div>
              </div>
            </div>

            <div className="row between" style={{ padding: "7px 0" }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Faturamento</span>
              <span style={{ fontWeight: 700 }}>{formatCompactCurrency(member.faturamento)}</span>
            </div>
            <div className="row between" style={{ padding: "7px 0" }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Sessões</span>
              <span style={{ fontWeight: 700 }}>{member.sessoes}</span>
            </div>
            <div className="row between" style={{ padding: "7px 0", marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Comissão</span>
              <span style={{ fontWeight: 700 }}>{member.comissao}%</span>
            </div>

            <div className="row wrap" style={{ gap: 6 }}>
              {member.especialidades.map((item) => (
                <Badge key={item} color={member.cor}>
                  {item}
                </Badge>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard title="💈 Produção mensal">
        <MiniBarChart
          color="var(--teal)"
          data={monthlyProduction}
        />
      </SectionCard>
    </>
  );
}
