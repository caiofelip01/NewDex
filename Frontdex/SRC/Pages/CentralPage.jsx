import { useEffect, useState } from "react";

import { Badge, EmptyState, SectionCard } from "../Components/ui";
import { useApp } from "../context/AppContext";
import { getReferenceDate } from "../utils/businessMetrics";
import { formatShortDate } from "../utils/format";

const priorityMeta = {
  alta: { label: "Alta", color: "#FF5050" },
  media: { label: "Média", color: "#FFB82E" },
  baixa: { label: "Baixa", color: "#2ECC8E" },
};

const boardTabs = [
  ["kanban", "🗂️ Kanban"],
  ["tarefas", "📋 Dashboard de tarefas"],
  ["rotina", "🕒 Abertura e fechamento"],
  ["comunicados", "📢 Comunicados"],
];

// Tela operacional que centraliza quadro kanban, rotina da loja e comunicados.
export function CentralPage() {
  const { data, openModal, closeModal, pushToast, saveBoardCard, moveBoardCard } = useApp();
  const [activeBoard, setActiveBoard] = useState(data.boards[0]?.id || "ops");
  const [tab, setTab] = useState("kanban");
  const [draggingCardId, setDraggingCardId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const referenceDate = getReferenceDate(data);

  const board = data.boards.find((item) => item.id === activeBoard) || data.boards[0] || null;
  const isOperationalBoard = board?.id === "ops" || board?.nome === "Operacional";

  useEffect(() => {
    // Se o quadro ativo deixar de existir, a UI volta para o primeiro disponível.
    if (data.boards.length && !data.boards.some((item) => item.id === activeBoard)) {
      setActiveBoard(data.boards[0].id);
    }
  }, [activeBoard, data.boards]);

  // Cria uma visão achatada dos cards para alimentar métricas e listas auxiliares.
  const allCards = data.boards.flatMap((item) =>
    item.cols.flatMap((col, index) =>
      col.cards.map((card) => ({
        ...card,
        board: item.nome,
        column: col.nome,
        done: index === item.cols.length - 1,
      })),
    ),
  );

  const overdueCards = allCards.filter(
    (item) => !item.done && item.due && item.due < referenceDate,
  );
  const boardDoneCount = board?.cols.at(-1)?.cards.length || 0;
  const boardTotalCount = board?.cols.reduce((total, col) => total + col.cards.length, 0) || 0;

  // Abre o modal já preso à coluna em que o usuário quer criar o card.
  function openCardModal(columnId) {
    const draft = {
      titulo: "",
      prioridade: "media",
      responsavelId: data.equipe[0]?.id || "",
      due: addDays(referenceDate, 1),
    };

    openModal({
      title: "Novo cartão",
      content: (
        <>
          <div className="form-field">
            <label className="lbl">Título</label>
            <input
              className="inp"
              onChange={(event) => {
                draft.titulo = event.target.value;
              }}
            />
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">Prioridade</label>
              <select
                className="inp"
                defaultValue={draft.prioridade}
                onChange={(event) => {
                  draft.prioridade = event.target.value;
                }}
              >
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
            <div>
              <label className="lbl">Responsável</label>
              <select
                className="inp"
                defaultValue={draft.responsavelId}
                onChange={(event) => {
                  draft.responsavelId = event.target.value;
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
          <div className="form-field">
            <label className="lbl">Prazo</label>
            <input
              className="inp"
              defaultValue={draft.due}
              onChange={(event) => {
                draft.due = event.target.value;
              }}
              type="date"
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
              await saveBoardCard({
                columnId,
                titulo: draft.titulo,
                prioridade: draft.prioridade,
                responsavelId: draft.responsavelId,
                due: draft.due,
              });
              closeModal();
              pushToast("Cartão criado.");
            }}
            type="button"
          >
            Adicionar
          </button>
        </>
      ),
    });
  }

  // Gera um fundo mais suave a partir da cor principal para badges e estados visuais.
  function getPriorityBackground(color) {
    return `color-mix(in srgb, ${color} 14%, transparent)`;
  }

  // No quadro operacional, a cor principal do card acompanha a etapa atual.
  function getStageAccentColor(operationalBoard, columnIndex, columnColor, fallbackColor) {
    if (operationalBoard) {
      const stageColors = ["#FF5050", "#FFB82E", "#FFB82E", "#2ECC8E"];
      return stageColors[columnIndex] || columnColor || fallbackColor;
    }

    return columnColor || fallbackColor;
  }

  // Descobre onde o card está para permitir mover e reordenar sem perder a posição.
  function getCardLocation(cardId) {
    if (!board) {
      return null;
    }

    for (let columnIndex = 0; columnIndex < board.cols.length; columnIndex += 1) {
      const column = board.cols[columnIndex];
      const index = column.cards.findIndex((item) => item.id === cardId);
      if (index !== -1) {
        return {
          columnId: column.id,
          columnIndex,
          columnName: column.nome,
          index,
        };
      }
    }

    return null;
  }

  // Limpa os estados temporários criados durante o drag-and-drop.
  function clearDragState() {
    setDraggingCardId(null);
    setDropTarget(null);
  }

  // Ajusta o índice quando o card é arrastado dentro da mesma coluna.
  function normalizeTargetIndex(columnId, rawIndex) {
    const location = getCardLocation(draggingCardId);

    if (!location || location.columnId !== columnId) {
      return rawIndex;
    }

    return location.index < rawIndex ? rawIndex - 1 : rawIndex;
  }

  // Centraliza a mutação de movimento e o feedback visual do usuário.
  async function handleMoveCard({ cardId, targetColumnId, targetIndex, targetColumnName, silent = false }) {
    const location = getCardLocation(cardId);

    if (!location) {
      return;
    }

    if (location.columnId === targetColumnId && location.index === targetIndex) {
      return;
    }

    await moveBoardCard({
      cardId,
      targetColumnId,
      targetIndex,
    });

    if (!silent) {
      pushToast(`Cartão movido para ${targetColumnName}.`);
    }
  }

  // Marca o card atual como "em movimento" para habilitar os drop targets.
  function handleCardDragStart(event, cardId) {
    setDraggingCardId(cardId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
  }

  // Atualiza a posição alvo enquanto o usuário passa o card por cima das colunas.
  function handleDropZoneDragOver(event, columnId, rawIndex) {
    if (!draggingCardId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const targetIndex = normalizeTargetIndex(columnId, rawIndex);
    setDropTarget((current) =>
      current?.columnId === columnId && current?.index === targetIndex
        ? current
        : { columnId, index: targetIndex },
    );
  }

  // Converte a posição visual do drop em uma atualização persistida do card.
  function handleDrop(event, columnId, rawIndex, columnName) {
    event.preventDefault();
    if (!draggingCardId) {
      return;
    }

    const cardId = draggingCardId;
    const targetIndex = normalizeTargetIndex(columnId, rawIndex);

    clearDragState();
    void handleMoveCard({
      cardId,
      targetColumnId: columnId,
      targetIndex,
      targetColumnName: columnName,
    });
  }

  // Atalho para navegação por botão entre etapas, útil principalmente no mobile.
  function moveCardByOffset(card, columnIndex, offset) {
    if (!board) {
      return;
    }

    const targetColumn = board.cols[columnIndex + offset];
    if (!targetColumn) {
      return;
    }

    void handleMoveCard({
      cardId: card.id,
      targetColumnId: targetColumn.id,
      targetIndex: targetColumn.cards.length,
      targetColumnName: targetColumn.nome,
    });
  }

  return (
    <>
      <div className="page-hd">
        <h1>Central de Operações</h1>
        <p>Gerencie tarefas, compras, rotina e comunicados em um só lugar.</p>
      </div>

      <div className="tabs">
        {boardTabs.map(([value, label]) => (
          <button
            key={value}
            className={`tab ${tab === value ? "active" : ""}`}
            onClick={() => setTab(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "kanban" ? (
        <>
          <div className="kboard-tabs">
            {data.boards.map((item) => (
              <button
                key={item.id}
                className={`kboard-tab ${activeBoard === item.id ? "active" : ""}`}
                onClick={() => setActiveBoard(item.id)}
                type="button"
              >
                <span className="bdot" style={{ background: item.cor }} />
                {item.nome}
              </button>
            ))}
          </div>

          {board ? (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-bd row between wrap" style={{ gap: 12 }}>
                  <div>
                    <div className="card-title">
                      {isOperationalBoard ? "Kanban interno da operação" : `Quadro ${board.nome}`}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--txt2)", marginTop: 4 }}>
                      Arraste os cartões entre etapas ou use as setas para mover no desktop e no mobile.
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Badge color="var(--orange)">{boardTotalCount} cards</Badge>
                    <Badge color="var(--green)">{boardDoneCount} concluídos</Badge>
                  </div>
                </div>
              </div>

              <div className="kanban-wrap">
                {board.cols.map((col, columnIndex) => (
                  <div key={col.id} className="kcol">
                    <div className="kcol-hd">
                      <span className="kcol-dot" style={{ background: col.cor }} />
                      <span className="kcol-title">{col.nome}</span>
                      <span className="kcol-count">{col.cards.length}</span>
                      <button className="kcol-add" onClick={() => openCardModal(col.id)} type="button">
                        +
                      </button>
                    </div>

                    <div
                      className={`kcol-bd ${dropTarget?.columnId === col.id ? "dragover" : ""}`}
                      onDragOver={(event) => handleDropZoneDragOver(event, col.id, col.cards.length)}
                      onDrop={(event) => handleDrop(event, col.id, col.cards.length, col.nome)}
                    >
                      {col.cards.length ? null : (
                        <div
                          className={`kdrop-zone ${dropTarget?.columnId === col.id ? "active" : ""}`}
                          onDragOver={(event) => handleDropZoneDragOver(event, col.id, 0)}
                          onDrop={(event) => handleDrop(event, col.id, 0, col.nome)}
                        >
                          Solte um cartão aqui
                        </div>
                      )}

                      {col.cards.map((card, cardIndex) => {
                        const priority = priorityMeta[card.prioridade] || priorityMeta.media;
                        const accentColor = getStageAccentColor(
                          isOperationalBoard,
                          columnIndex,
                          col.cor,
                          priority.color,
                        );
                        const doneChecks = card.checks.filter((item) => item.done).length;
                        const responsible = data.equipe.find((item) => item.id === card.responsavelId);
                        const canMoveBack = columnIndex > 0;
                        const canMoveForward = columnIndex < board.cols.length - 1;
                        const isDropActive =
                          dropTarget?.columnId === col.id && dropTarget?.index === cardIndex;

                        return (
                          <div key={card.id}>
                            <div
                              className={`kdrop-zone ${isDropActive ? "active" : ""}`}
                              onDragOver={(event) => handleDropZoneDragOver(event, col.id, cardIndex)}
                              onDrop={(event) => handleDrop(event, col.id, cardIndex, col.nome)}
                            >
                              Mover para esta posição
                            </div>

                            <div
                              className={`kcard ${draggingCardId === card.id ? "dragging" : ""}`}
                              draggable
                              onDragEnd={clearDragState}
                              onDragStart={(event) => handleCardDragStart(event, card.id)}
                              style={{ borderLeftColor: accentColor }}
                            >
                              <div className="kcard-top">
                                <span className="kcard-title">{card.titulo}</span>
                                {card.auto ? <span title="Gerado automaticamente">⚙️</span> : null}
                              </div>

                              <div className="kcard-meta">
                                <span
                                  className="kprio"
                                  style={{
                                    background: getPriorityBackground(priority.color),
                                    color: priority.color,
                                  }}
                                >
                                  {priority.label}
                                </span>
                                <span className="kdue">📅 {formatShortDate(card.due)}</span>
                                {card.checks.length ? (
                                  <span className="kchecks">☑ {doneChecks}/{card.checks.length}</span>
                                ) : null}
                                {card.comentarios.length ? (
                                  <span className="kchecks">💬 {card.comentarios.length}</span>
                                ) : null}
                                {responsible ? (
                                  <span
                                    className="kassign"
                                    style={{ background: responsible.cor, marginLeft: "auto" }}
                                    title={responsible.nome}
                                  >
                                    {responsible.avatar}
                                  </span>
                                ) : null}
                              </div>

                              <div className="kcard-actions">
                                <button
                                  className="kcard-move"
                                  disabled={!canMoveBack}
                                  onClick={() => moveCardByOffset(card, columnIndex, -1)}
                                  title={canMoveBack ? `Mover para ${board.cols[columnIndex - 1].nome}` : "Primeira etapa"}
                                  type="button"
                                >
                                  ← Etapa anterior
                                </button>
                                <button
                                  className="kcard-move"
                                  disabled={!canMoveForward}
                                  onClick={() => moveCardByOffset(card, columnIndex, 1)}
                                  title={canMoveForward ? `Mover para ${board.cols[columnIndex + 1].nome}` : "Última etapa"}
                                  type="button"
                                >
                                  Próxima etapa →
                                </button>
                              </div>
                            </div>

                            {cardIndex === col.cards.length - 1 ? (
                              <div
                                className={`kdrop-zone ${dropTarget?.columnId === col.id && dropTarget?.index === col.cards.length ? "active" : ""}`}
                                onDragOver={(event) => handleDropZoneDragOver(event, col.id, col.cards.length)}
                                onDrop={(event) => handleDrop(event, col.id, col.cards.length, col.nome)}
                              >
                                Mover para o fim
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon="🗂️">Nenhum quadro disponível.</EmptyState>
          )}
        </>
      ) : null}

      {tab === "tarefas" ? (
        <div className="grid-2">
          <SectionCard title="🏆 Ranking de conclusão">
            {data.equipe.map((item) => {
              const ownCards = allCards.filter((card) => card.responsavelId === item.id);
              const done = ownCards.filter((card) => card.done).length;
              const percent = ownCards.length ? Math.round((done / ownCards.length) * 100) : 0;

              return (
                <div key={item.id} style={{ marginBottom: 12 }}>
                  <div className="row between" style={{ marginBottom: 5 }}>
                    <span className="av-row">
                      <span
                        className="avatar"
                        style={{ background: item.cor, width: 26, height: 26, fontSize: 9 }}
                      >
                        {item.avatar}
                      </span>
                      <span style={{ fontSize: 13 }}>{item.nome}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      {done}/{ownCards.length}
                    </span>
                  </div>
                  <div className="pbar">
                    <div className="pbar-fill" style={{ width: `${percent}%`, background: item.cor }} />
                  </div>
                </div>
              );
            })}
          </SectionCard>

          <SectionCard title="⏰ Tarefas atrasadas">
            {overdueCards.length ? (
              overdueCards.map((item) => (
                <div
                  key={item.id}
                  className="row between"
                  style={{ padding: "8px 0", borderBottom: "1px solid var(--brd)" }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.titulo}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {item.board} · {item.column}
                    </div>
                  </div>
                  <span className="kdue late">📅 {formatShortDate(item.due)}</span>
                </div>
              ))
            ) : (
              <EmptyState icon="🎉">Nenhuma tarefa atrasada.</EmptyState>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "rotina" ? (
        <div className="grid-2">
          {Object.entries(data.checklists).map(([key, items]) => (
            <SectionCard
              key={key}
              title={key === "abertura" ? "🌤️ Abertura da loja" : "🌙 Fechamento da loja"}
              action={
                <Badge color={key === "abertura" ? "var(--orange)" : "var(--green)"}>
                  {`${items.filter((item) => item.done).length}/${items.length}`}
                </Badge>
              }
            >
              {items.map((item, index) => (
                <label key={`${key}_${index}`} className={`checklist-item ${item.done ? "done" : ""}`}>
                  <span className={`chk ${item.done ? "done" : ""}`}>✓</span>
                  <span className="ci-txt" style={{ fontSize: 13.5 }}>
                    {item.texto}
                  </span>
                </label>
              ))}
            </SectionCard>
          ))}
        </div>
      ) : null}

      {tab === "comunicados" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.comunicados.map((item) => (
            <SectionCard key={item.id} title={`📢 ${item.titulo}`}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>por {item.autor}</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{item.data}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--txt2)", lineHeight: 1.5 }}>{item.texto}</div>
            </SectionCard>
          ))}
        </div>
      ) : null}
    </>
  );
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
