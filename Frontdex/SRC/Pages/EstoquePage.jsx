import { Badge, EmptyState, MiniBarChart, SectionCard, StatCard } from "../Components/ui";
import { useApp } from "../context/AppContext";
import { formatMonthKeyLabel } from "../utils/appData";
import { getReferenceDate } from "../utils/businessMetrics";
import { formatCompactCurrency, formatCurrency } from "../utils/format";

const categoryColors = {
  Finalizador: "#FF6B2B",
  Shampoo: "#3B82F6",
  Barba: "#A78BFA",
  "Descartável": "#FFB82E",
  Higiene: "#2ECC8E",
};

export function EstoquePage() {
  const {
    data,
    openModal,
    closeModal,
    pushToast,
    hasPermission,
    saveProduct,
    removeProduct,
    registerStockPurchase,
  } = useApp();
  const referenceDate = getReferenceDate(data);
  const movements = Array.isArray(data.movimentacoesEstoque) ? data.movimentacoesEstoque : [];
  const total = data.estoque.reduce(
    (sum, item) => sum + toNumber(item.quantidade) * toNumber(item.preco),
    0,
  );
  const criticos = data.estoque.filter(
    (item) => toNumber(item.quantidade) <= toNumber(item.minimo),
  );
  const purchaseSeries = Object.entries(
    movements.reduce((grouped, movement) => {
      if (movement.tipo !== "compra" || !/^\d{4}-\d{2}-\d{2}$/.test(movement.data || "")) {
        return grouped;
      }
      const monthKey = movement.data.slice(0, 7);
      grouped[monthKey] =
        (grouped[monthKey] || 0) +
        toNumber(
          movement.total ??
            toNumber(movement.quantidade) * toNumber(movement.custoUnitario),
        );
      return grouped;
    }, {}),
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6)
    .map(([monthKey, value]) => ({ label: formatMonthKeyLabel(monthKey), value }));

  function openProductModal(product) {
    const draft = product
      ? { ...product }
      : {
          produto: "",
          categoria: "Finalizador",
          quantidade: 0,
          minimo: 0,
          preco: 0,
          marca: "",
        };

    openModal({
      title: product ? "Editar produto" : "Novo produto",
      content: (
        <>
          <div className="form-field">
            <label className="lbl">Produto</label>
            <input
              className="inp"
              defaultValue={draft.produto}
              onChange={(event) => {
                draft.produto = event.target.value;
              }}
            />
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">Categoria</label>
              <select
                className="inp"
                defaultValue={draft.categoria}
                onChange={(event) => {
                  draft.categoria = event.target.value;
                }}
              >
                {Object.keys(categoryColors).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">Marca</label>
              <input
                className="inp"
                defaultValue={draft.marca}
                onChange={(event) => {
                  draft.marca = event.target.value;
                }}
              />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label className="lbl">{product ? "Quantidade atual" : "Quantidade inicial"}</label>
              <input
                className="inp"
                defaultValue={draft.quantidade}
                disabled={Boolean(product)}
                onChange={(event) => {
                  draft.quantidade = Number(event.target.value);
                }}
                title={product ? "Use Registrar compra para adicionar unidades" : undefined}
                type="number"
              />
            </div>
            <div>
              <label className="lbl">Mínimo</label>
              <input
                className="inp"
                defaultValue={draft.minimo}
                onChange={(event) => {
                  draft.minimo = Number(event.target.value);
                }}
                type="number"
              />
            </div>
          </div>
          <div className="form-field">
            <label className="lbl">Custo unitário</label>
            <input
              className="inp"
              defaultValue={draft.preco}
              onChange={(event) => {
                draft.preco = Number(event.target.value);
              }}
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
              await saveProduct(product ? { ...product, ...draft } : draft, product?.id);
              closeModal();
              pushToast(product ? "Produto atualizado." : "Produto criado.");
            }}
            type="button"
          >
            Salvar
          </button>
        </>
      ),
    });
  }

  function openPurchaseModal() {
    if (!hasPermission("finance")) {
      pushToast("Seu perfil não pode registrar compras financeiras.", "err");
      return;
    }

    if (!data.estoque.length) {
      pushToast("Cadastre um produto antes de registrar uma compra.", "info");
      return;
    }

    const firstProduct = data.estoque[0];
    const draft = {
      produtoId: firstProduct.id,
      quantidade: 1,
      custoUnitario: "",
      data: referenceDate,
      observacao: "",
    };

    openModal({
      title: "Registrar compra de estoque",
      content: (
        <>
          <div className="form-row">
            <div>
              <label className="lbl">Produto</label>
              <select
                className="inp"
                defaultValue={draft.produtoId}
                onChange={(event) => {
                  draft.produtoId = event.target.value;
                }}
              >
                {data.estoque.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.produto}
                  </option>
                ))}
              </select>
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
          <div className="form-row">
            <div>
              <label className="lbl">Quantidade recebida</label>
              <input
                className="inp"
                defaultValue={draft.quantidade}
                min="1"
                onChange={(event) => {
                  draft.quantidade = Number(event.target.value);
                }}
                step="1"
                type="number"
              />
            </div>
            <div>
              <label className="lbl">Custo unitário</label>
              <input
                className="inp"
                defaultValue={draft.custoUnitario}
                min="0"
                onChange={(event) => {
                  draft.custoUnitario = event.target.value;
                }}
                step="0.01"
                type="number"
              />
            </div>
          </div>
          <div className="form-field">
            <label className="lbl">Observação</label>
            <input
              className="inp"
              onChange={(event) => {
                draft.observacao = event.target.value;
              }}
              placeholder="Fornecedor, nota ou referência (opcional)"
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
              if (!Number.isInteger(Number(draft.quantidade)) || Number(draft.quantidade) <= 0) {
                pushToast("Informe uma quantidade inteira maior que zero.", "err");
                return;
              }

              if (
                String(draft.custoUnitario).trim() === "" ||
                !Number.isFinite(Number(draft.custoUnitario)) ||
                Number(draft.custoUnitario) < 0
              ) {
                pushToast("Informe um custo unitário válido.", "err");
                return;
              }

              await registerStockPurchase(draft);
              closeModal();
              pushToast("Compra registrada no estoque e no financeiro.");
            }}
            type="button"
          >
            Registrar compra
          </button>
        </>
      ),
    });
  }

  return (
    <>
      <div className="page-hd row between wrap">
        <div>
          <h1>Estoque</h1>
          <p>Controle de produtos e movimentações</p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button
            className="btn"
            disabled={!hasPermission("finance")}
            onClick={openPurchaseModal}
            title={
              hasPermission("finance")
                ? "Registrar entrada de estoque e saída financeira"
                : "Apenas perfis financeiros podem registrar compras"
            }
            type="button"
          >
            + Registrar compra
          </button>
          <button className="btn btn-primary" onClick={() => openProductModal(null)} type="button">
            + Novo produto
          </button>
        </div>
      </div>

      <div className="stat-grid sg-3">
        <StatCard
          color="var(--blue)"
          icon="📦"
          label="Produtos"
          sub="itens cadastrados"
          value={data.estoque.length}
        />
        <StatCard
          color="var(--green)"
          icon="💰"
          label="Valor em estoque"
          sub="custo total"
          value={formatCompactCurrency(total)}
        />
        <StatCard
          color={criticos.length ? "var(--red)" : "var(--green)"}
          icon="⚠️"
          label="Estoque crítico"
          sub="abaixo do mínimo"
          value={criticos.length}
        />
      </div>

      {criticos.length ? (
        <div
          style={{
            background: "var(--orange-glow)",
            border: "1px solid var(--orange)",
            borderRadius: 14,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "var(--orange)",
          }}
        >
          ⚠️ {criticos.map((item) => item.produto).join(", ")} precisam de reposição.
        </div>
      ) : null}

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <SectionCard title="📉 Evolução de custos de produtos">
          {purchaseSeries.length ? (
            <MiniBarChart color="var(--blue)" data={purchaseSeries} />
          ) : (
            <EmptyState icon="📉">As compras registradas formarão este histórico.</EmptyState>
          )}
        </SectionCard>
        <SectionCard title="Produtos por categoria">
          {Object.entries(
            data.estoque.reduce((grouped, item) => {
              grouped[item.categoria] = (grouped[item.categoria] || 0) + item.quantidade * item.preco;
              return grouped;
            }, {}),
          ).map(([categoria, value]) => (
            <div
              key={categoria}
              className="row between"
              style={{ padding: "11px 0", borderBottom: "1px solid var(--brd)" }}
            >
              <span style={{ fontSize: 13 }}>{categoria}</span>
              <Badge color={categoryColors[categoria] || "#65636F"}>
                {formatCompactCurrency(value)}
              </Badge>
            </div>
          ))}
        </SectionCard>
      </div>

      <SectionCard title="Produtos">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Marca</th>
              <th>Qtd</th>
              <th>Mín</th>
              <th>Custo</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.estoque.map((item) => {
              const critical = item.quantidade <= item.minimo;
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.produto}</td>
                  <td>
                    <Badge color={categoryColors[item.categoria] || "#65636F"}>{item.categoria}</Badge>
                  </td>
                  <td>{item.marca}</td>
                  <td style={{ fontWeight: 700 }}>{item.quantidade}</td>
                  <td>{item.minimo}</td>
                  <td>{formatCurrency(item.preco)}</td>
                  <td>
                    <Badge color={critical ? "var(--red)" : "var(--green)"}>
                      {critical ? "Crítico" : "OK"}
                    </Badge>
                  </td>
                  <td>
                    <div className="t-actions">
                      <button className="ic-btn" onClick={() => openProductModal(item)} title="Editar" type="button">
                        ✏️
                      </button>
                      <button
                        className="ic-btn del"
                        onClick={async () => {
                          await removeProduct(item.id);
                          pushToast("Produto removido.");
                        }}
                        title="Excluir"
                        type="button"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <div style={{ marginTop: 16 }}>
        <SectionCard title="Histórico de movimentações">
          {movements.length ? (
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Total</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {[...movements]
                  .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")))
                  .map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatDate(movement.data)}</td>
                      <td style={{ fontWeight: 600 }}>
                        {movement.produto ||
                          data.estoque.find((item) => item.id === movement.produtoId)?.produto ||
                          "Produto removido"}
                      </td>
                      <td>
                        <Badge color={movement.tipo === "compra" ? "var(--blue)" : "var(--orange)"}>
                          {movement.tipo === "compra" ? "Compra" : "Ajuste"}
                        </Badge>
                      </td>
                      <td>{movement.quantidade}</td>
                      <td>{formatCurrency(movement.total)}</td>
                      <td>{movement.observacao || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon="📦">Nenhuma movimentação registrada.</EmptyState>
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

function formatDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    ? value.split("-").reverse().join("/")
    : "—";
}
