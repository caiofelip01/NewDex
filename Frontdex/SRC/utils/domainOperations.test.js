import assert from "node:assert/strict";
import test from "node:test";

import { applyAppointmentChange, applyStockPurchase } from "./domainOperations.js";

function createAppointmentData() {
  return {
    agenda: [
      {
        id: "appointment-history",
        clienteId: "customer-1",
        cliente: "Cliente Um",
        barbeiroId: "employee-1",
        barbeiro: "Profissional Um",
        servico: "Corte",
        valor: 100,
        data: "2026-01-10",
        hora: "09:00",
        status: "concluido",
      },
      {
        id: "appointment-1",
        clienteId: "customer-1",
        cliente: "Cliente Um",
        barbeiroId: "employee-1",
        barbeiro: "Profissional Um",
        servico: "Corte",
        valor: 100,
        data: "2026-01-31",
        hora: "10:00",
        status: "confirmado",
      },
    ],
    clientes: [
      {
        id: "customer-1",
        nome: "Cliente Um",
        visitas: 2,
        gasto: 200,
        ultimaVisita: "2026-01-10",
      },
      {
        id: "customer-2",
        nome: "Cliente Dois",
        visitas: 1,
        gasto: 50,
        ultimaVisita: "2026-01-15",
      },
    ],
    equipe: [
      {
        id: "employee-1",
        nome: "Profissional Um",
        sessoes: 2,
        faturamento: 200,
      },
      {
        id: "employee-2",
        nome: "Profissional Dois",
        sessoes: 1,
        faturamento: 50,
      },
    ],
    financeiro: [
      {
        id: "manual-entry",
        tipo: "entrada",
        descricao: "Entrada manual",
        categoria: "Outros",
        valor: 25,
        data: "2026-01-31",
      },
    ],
  };
}

function completeFirstAppointment(data) {
  return applyAppointmentChange(data, {
    ...data.agenda.find((item) => item.id === "appointment-1"),
    status: "concluido",
  });
}

function getById(items, id) {
  return items.find((item) => item.id === id);
}

function getAppointmentEntries(data, appointmentId = "appointment-1") {
  return data.financeiro.filter(
    (entry) => entry.origem === "appointment" && entry.referenciaId === appointmentId,
  );
}

test("concluir o mesmo atendimento duas vezes não duplica receita nem métricas", () => {
  const initial = createAppointmentData();
  const firstCompletion = completeFirstAppointment(initial);
  const secondCompletion = completeFirstAppointment(firstCompletion);

  assert.equal(getAppointmentEntries(secondCompletion).length, 1);
  assert.deepEqual(getAppointmentEntries(secondCompletion)[0], {
    id: "appointment_appointment-1",
    tipo: "entrada",
    descricao: "Atendimento: Corte — Cliente Um",
    categoria: "Serviços",
    valor: 100,
    data: "2026-01-31",
    origem: "appointment",
    referenciaId: "appointment-1",
    editavel: false,
  });

  assert.deepEqual(
    {
      visitas: getById(secondCompletion.clientes, "customer-1").visitas,
      gasto: getById(secondCompletion.clientes, "customer-1").gasto,
      sessoes: getById(secondCompletion.equipe, "employee-1").sessoes,
      faturamento: getById(secondCompletion.equipe, "employee-1").faturamento,
    },
    { visitas: 3, gasto: 300, sessoes: 3, faturamento: 300 },
  );
  assert.equal(secondCompletion.financeiro.filter((entry) => entry.id === "manual-entry").length, 1);

  assert.equal(getById(initial.agenda, "appointment-1").status, "confirmado");
  assert.equal(initial.clientes[0].visitas, 2);
  assert.equal(initial.equipe[0].faturamento, 200);
  assert.equal(initial.financeiro.length, 1);
});

test("reabrir atendimento concluído reverte receita e todas as métricas derivadas", () => {
  const completed = completeFirstAppointment(createAppointmentData());
  const reopened = applyAppointmentChange(completed, {
    ...completed.agenda.find((item) => item.id === "appointment-1"),
    status: "confirmado",
  });

  assert.equal(getAppointmentEntries(reopened).length, 0);
  assert.equal(reopened.financeiro.filter((entry) => entry.id === "manual-entry").length, 1);
  assert.deepEqual(
    {
      visitas: getById(reopened.clientes, "customer-1").visitas,
      gasto: getById(reopened.clientes, "customer-1").gasto,
      ultimaVisita: getById(reopened.clientes, "customer-1").ultimaVisita,
      sessoes: getById(reopened.equipe, "employee-1").sessoes,
      faturamento: getById(reopened.equipe, "employee-1").faturamento,
    },
    {
      visitas: 2,
      gasto: 200,
      ultimaVisita: "2026-01-10",
      sessoes: 2,
      faturamento: 200,
    },
  );
  assert.equal(getById(reopened.agenda, "appointment-1").status, "confirmado");
});

test("editar atendimento concluído reconcilia valor, data, cliente e profissional", () => {
  const completed = completeFirstAppointment(createAppointmentData());
  const edited = applyAppointmentChange(completed, {
    ...completed.agenda.find((item) => item.id === "appointment-1"),
    clienteId: "customer-2",
    cliente: "Cliente Dois",
    barbeiroId: "employee-2",
    barbeiro: "Profissional Dois",
    servico: "Corte + Barba",
    valor: 160,
    data: "2026-02-01",
    status: "concluido",
  });

  assert.deepEqual(
    {
      visitas: getById(edited.clientes, "customer-1").visitas,
      gasto: getById(edited.clientes, "customer-1").gasto,
      ultimaVisita: getById(edited.clientes, "customer-1").ultimaVisita,
    },
    { visitas: 2, gasto: 200, ultimaVisita: "2026-01-10" },
  );
  assert.deepEqual(
    {
      visitas: getById(edited.clientes, "customer-2").visitas,
      gasto: getById(edited.clientes, "customer-2").gasto,
      ultimaVisita: getById(edited.clientes, "customer-2").ultimaVisita,
    },
    { visitas: 2, gasto: 210, ultimaVisita: "2026-02-01" },
  );
  assert.deepEqual(
    {
      sessoes: getById(edited.equipe, "employee-1").sessoes,
      faturamento: getById(edited.equipe, "employee-1").faturamento,
    },
    { sessoes: 2, faturamento: 200 },
  );
  assert.deepEqual(
    {
      sessoes: getById(edited.equipe, "employee-2").sessoes,
      faturamento: getById(edited.equipe, "employee-2").faturamento,
    },
    { sessoes: 2, faturamento: 210 },
  );

  const [entry] = getAppointmentEntries(edited);
  assert.equal(getAppointmentEntries(edited).length, 1);
  assert.equal(entry.id, "appointment_appointment-1");
  assert.equal(entry.valor, 160);
  assert.equal(entry.data, "2026-02-01");
  assert.equal(entry.descricao, "Atendimento: Corte + Barba — Cliente Dois");
});

test("compra atualiza quantidade e custo médio e cria movimento e saída financeira vinculados", () => {
  const initial = {
    estoque: [
      {
        id: "product-1",
        produto: "Pomada",
        quantidade: 10,
        minimo: 4,
        preco: 20,
      },
      {
        id: "product-2",
        produto: "Shampoo",
        quantidade: 8,
        minimo: 3,
        preco: 12,
      },
    ],
    movimentacoesEstoque: [
      {
        id: "old-movement",
        produtoId: "product-2",
        tipo: "ajuste",
        quantidade: 1,
        data: "2026-01-20",
      },
    ],
    financeiro: [
      {
        id: "existing-expense",
        tipo: "saida",
        valor: 40,
        data: "2026-01-15",
      },
    ],
    boards: [
      {
        id: "purchases-board",
        cols: [
          {
            id: "needs-purchase",
            cards: [
              { id: "product-alert", produtoId: "product-1", auto: true },
              { id: "manual-card", produtoId: "product-1", auto: false },
              { id: "other-alert", produtoId: "product-2", auto: true },
            ],
          },
        ],
      },
    ],
  };

  const purchased = applyStockPurchase(initial, {
    id: "purchase-1",
    financeiroId: "purchase-financial-1",
    produtoId: "product-1",
    quantidade: 5,
    custoUnitario: 30,
    data: "2026-02-01",
    observacao: "Fornecedor A",
  });

  assert.deepEqual(
    {
      quantidade: getById(purchased.estoque, "product-1").quantidade,
      preco: getById(purchased.estoque, "product-1").preco,
    },
    { quantidade: 15, preco: 23.33 },
  );
  assert.equal(getById(purchased.estoque, "product-2"), initial.estoque[1]);
  assert.deepEqual(purchased.movimentacoesEstoque[0], {
    id: "purchase-1",
    produtoId: "product-1",
    produto: "Pomada",
    tipo: "compra",
    quantidade: 5,
    custoUnitario: 30,
    total: 150,
    data: "2026-02-01",
    observacao: "Fornecedor A",
    financeiroId: "purchase-financial-1",
  });
  assert.deepEqual(purchased.financeiro[0], {
    id: "purchase-financial-1",
    tipo: "saida",
    descricao: "Compra de estoque: Pomada",
    categoria: "Estoque",
    valor: 150,
    data: "2026-02-01",
    origem: "inventory_purchase",
    referenciaId: "purchase-1",
    editavel: false,
  });
  assert.equal(purchased.movimentacoesEstoque[1].id, "old-movement");
  assert.equal(purchased.financeiro[1].id, "existing-expense");
  assert.deepEqual(
    purchased.boards[0].cols[0].cards.map((card) => card.id),
    ["manual-card", "other-alert"],
  );

  assert.equal(initial.estoque[0].quantidade, 10);
  assert.equal(initial.estoque[0].preco, 20);
  assert.equal(initial.movimentacoesEstoque.length, 1);
  assert.equal(initial.financeiro.length, 1);
});
