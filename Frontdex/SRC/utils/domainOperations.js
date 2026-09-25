import { isDateKey } from "./businessMetrics.js";

export function applyAppointmentChange(data, nextAppointment) {
  if (!nextAppointment?.id || !isDateKey(nextAppointment.data)) {
    throw new Error("Agendamento inválido.");
  }

  if (!new Set(["agendado", "confirmado", "concluido"]).has(nextAppointment.status)) {
    throw new Error("Status do agendamento inválido.");
  }

  for (const [value, label] of [
    [nextAppointment.cliente, "Cliente"],
    [nextAppointment.barbeiro, "Profissional"],
    [nextAppointment.servico, "Serviço"],
  ]) {
    if (!String(value || "").trim()) {
      throw new Error(`${label} é obrigatório.`);
    }
  }

  readNonNegativeNumber(nextAppointment.valor, "Valor do atendimento");
  const appointments = Array.isArray(data.agenda) ? data.agenda : [];
  const previous = appointments.find((item) => item.id === nextAppointment.id) || null;
  const nextAppointments = upsertById(appointments, nextAppointment);
  const generatedEntry = (Array.isArray(data.financeiro) ? data.financeiro : []).find(
    (entry) => entry.origem === "appointment" && entry.referenciaId === nextAppointment.id,
  );
  const shouldCreateEntry =
    nextAppointment.status === "concluido" &&
    (!previous || previous.status !== "concluido" || Boolean(generatedEntry));

  let clientes = Array.isArray(data.clientes) ? data.clientes : [];
  let equipe = Array.isArray(data.equipe) ? data.equipe : [];
  let financeiro = (Array.isArray(data.financeiro) ? data.financeiro : []).filter(
    (entry) => !(entry.origem === "appointment" && entry.referenciaId === nextAppointment.id),
  );

  if (previous?.status === "concluido") {
    clientes = applyCustomerDelta(clientes, previous, -1);
    equipe = applyEmployeeDelta(equipe, previous, -1);
  }

  if (nextAppointment.status === "concluido") {
    clientes = applyCustomerDelta(clientes, nextAppointment, 1);
    equipe = applyEmployeeDelta(equipe, nextAppointment, 1);

    if (shouldCreateEntry) {
      financeiro = [createAppointmentFinancialEntry(nextAppointment, generatedEntry?.id), ...financeiro];
    }
  }

  clientes = reconcileCustomerLastVisits(
    clientes,
    nextAppointments,
    previous,
    nextAppointment,
  );

  return {
    ...data,
    agenda: nextAppointments,
    clientes,
    equipe,
    financeiro,
  };
}

export function applyStockPurchase(data, purchase) {
  if (!isDateKey(purchase?.data)) {
    throw new Error("Data da compra inválida.");
  }

  const products = Array.isArray(data.estoque) ? data.estoque : [];
  const product = products.find((item) => item.id === purchase.produtoId);
  if (!product) {
    throw new Error("Produto não encontrado.");
  }

  const quantity = readPositiveInteger(purchase.quantidade, "Quantidade");
  const unitCost = readNonNegativeNumber(purchase.custoUnitario, "Custo unitário");
  const previousQuantity = readNonNegativeNumber(product.quantidade, "Estoque atual");
  const previousUnitCost = readNonNegativeNumber(product.preco, "Custo atual");
  const nextQuantity = previousQuantity + quantity;
  const weightedUnitCost = nextQuantity
    ? (previousQuantity * previousUnitCost + quantity * unitCost) / nextQuantity
    : unitCost;
  const total = quantity * unitCost;
  const nextProducts = products.map((item) =>
    item.id === product.id
      ? { ...item, quantidade: nextQuantity, preco: roundMoney(weightedUnitCost) }
      : item,
  );

  const movement = {
    id: purchase.id,
    produtoId: product.id,
    produto: product.produto,
    tipo: "compra",
    quantidade: quantity,
    custoUnitario: unitCost,
    total,
    data: purchase.data,
    observacao: String(purchase.observacao || "").trim(),
    financeiroId: purchase.financeiroId,
  };
  const financialEntry = {
    id: purchase.financeiroId,
    tipo: "saida",
    descricao: `Compra de estoque: ${product.produto}`,
    categoria: "Estoque",
    valor: total,
    data: purchase.data,
    origem: "inventory_purchase",
    referenciaId: movement.id,
    editavel: false,
  };

  return {
    ...data,
    estoque: nextProducts,
    movimentacoesEstoque: [movement, ...(data.movimentacoesEstoque || [])],
    financeiro: [financialEntry, ...(data.financeiro || [])],
    boards: removeResolvedStockCard(data.boards, product.id, nextQuantity, product.minimo),
  };
}

function removeResolvedStockCard(boards, productId, quantity, minimumQuantity) {
  if (Number(quantity) <= Number(minimumQuantity || 0)) {
    return Array.isArray(boards) ? boards : [];
  }

  return (Array.isArray(boards) ? boards : []).map((board) => ({
    ...board,
    cols: (Array.isArray(board.cols) ? board.cols : []).map((column) => ({
      ...column,
      cards: (Array.isArray(column.cards) ? column.cards : []).filter(
        (card) => !(card.auto && card.produtoId === productId),
      ),
    })),
  }));
}

function reconcileCustomerLastVisits(customers, appointments, previous, nextAppointment) {
  const affectedAppointments = [previous, nextAppointment].filter(Boolean);
  return customers.map((customer) => {
    const isAffected = affectedAppointments.some((appointment) =>
      appointment.clienteId
        ? appointment.clienteId === customer.id
        : appointment.cliente === customer.nome,
    );
    if (!isAffected) {
      return customer;
    }

    const completedDates = appointments
      .filter((appointment) => {
        const matches = appointment.clienteId
          ? appointment.clienteId === customer.id
          : appointment.cliente === customer.nome;
        return matches && appointment.status === "concluido" && appointment.data;
      })
      .map((appointment) => appointment.data)
      .sort();

    const latestCompletedDate = completedDates.at(-1) || "";
    const previousMatched = previous && matchesCustomer(previous, customer);
    const nextMatched = nextAppointment && matchesCustomer(nextAppointment, customer);
    const removedPreviousLatest =
      previousMatched &&
      previous.status === "concluido" &&
      customer.ultimaVisita === previous.data &&
      (!nextMatched || nextAppointment.status !== "concluido" || nextAppointment.data !== previous.data);

    if (removedPreviousLatest) {
      return { ...customer, ultimaVisita: latestCompletedDate };
    }

    return latestCompletedDate > String(customer.ultimaVisita || "")
      ? { ...customer, ultimaVisita: latestCompletedDate }
      : customer;
  });
}

function matchesCustomer(appointment, customer) {
  return appointment.clienteId
    ? appointment.clienteId === customer.id
    : appointment.cliente === customer.nome;
}

function applyCustomerDelta(customers, appointment, direction) {
  const customerId = appointment.clienteId;
  return customers.map((customer) => {
    const matches = customerId ? customer.id === customerId : customer.nome === appointment.cliente;
    if (!matches) {
      return customer;
    }

    const next = {
      ...customer,
      visitas: Math.max(0, Number(customer.visitas || 0) + direction),
      gasto: Math.max(0, roundMoney(Number(customer.gasto || 0) + direction * Number(appointment.valor || 0))),
    };

    if (direction > 0 && (!next.ultimaVisita || next.ultimaVisita < appointment.data)) {
      next.ultimaVisita = appointment.data;
    }

    return next;
  });
}

function applyEmployeeDelta(employees, appointment, direction) {
  const employeeId = appointment.barbeiroId;
  return employees.map((employee) => {
    const matches = employeeId ? employee.id === employeeId : employee.nome === appointment.barbeiro;
    return matches
      ? {
          ...employee,
          sessoes: Math.max(0, Number(employee.sessoes || 0) + direction),
          faturamento: Math.max(
            0,
            roundMoney(Number(employee.faturamento || 0) + direction * Number(appointment.valor || 0)),
          ),
        }
      : employee;
  });
}

function createAppointmentFinancialEntry(appointment, existingId) {
  return {
    id: existingId || `appointment_${appointment.id}`,
    tipo: "entrada",
    descricao: `Atendimento: ${appointment.servico} — ${appointment.cliente}`,
    categoria: "Serviços",
    valor: Number(appointment.valor || 0),
    data: appointment.data,
    origem: "appointment",
    referenciaId: appointment.id,
    editavel: false,
  };
}

function upsertById(items, nextItem) {
  return items.some((item) => item.id === nextItem.id)
    ? items.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item))
    : [nextItem, ...items];
}

function readPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} deve ser um número inteiro maior que zero.`);
  }
  return number;
}

function readNonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} inválido.`);
  }
  return number;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
