import { dbQuery } from "./db.js";

export async function getAppStateForShop(shopId) {
  const referenceDate = resolveReferenceDate();
  const currentMonthKey = referenceDate.slice(0, 7);
  const [
    appointments,
    employees,
    customers,
    products,
    inventoryMovements,
    financialEntries,
    monthlySnapshots,
    goals,
    boards,
    boardColumns,
    boardCards,
    cardChecklistItems,
    cardComments,
    announcements,
    checklistItems,
    notifications,
  ] = await Promise.all([
    dbQuery(
      `SELECT
        apt.id,
        apt.customer_id,
        apt.employee_id,
        apt.customer_name,
        apt.service_name,
        apt.scheduled_date,
        apt.scheduled_time,
        apt.duration_minutes,
        apt.amount,
        apt.status,
        emp.name AS employee_name
       FROM appointments apt
       LEFT JOIN employees emp ON emp.id = apt.employee_id
       WHERE apt.shop_id = $1
       ORDER BY apt.scheduled_date ASC, apt.scheduled_time ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT *
       FROM employees
       WHERE shop_id = $1
       ORDER BY created_at ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT *
       FROM customers
       WHERE shop_id = $1
       ORDER BY created_at ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT *
       FROM products
       WHERE shop_id = $1
       ORDER BY created_at ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT
         movement.id,
         movement.product_id,
         product.name AS product_name,
         movement.movement_type,
         movement.quantity_change,
         movement.movement_date,
         movement.unit_cost,
         movement.total_amount,
         movement.note,
         movement.created_at,
         entry.id AS financial_entry_id
       FROM inventory_movements movement
       INNER JOIN products product ON product.id = movement.product_id
       LEFT JOIN financial_entries entry ON entry.inventory_movement_id = movement.id
       WHERE movement.shop_id = $1
       ORDER BY movement.movement_date DESC, movement.created_at DESC`,
      [shopId],
    ),
    dbQuery(
      `SELECT *
       FROM financial_entries
       WHERE shop_id = $1
       ORDER BY entry_date DESC, created_at DESC`,
      [shopId],
    ),
    dbQuery(
      `SELECT month_key, month_label, revenue, expenses
       FROM monthly_snapshots
       WHERE shop_id = $1
       ORDER BY created_at ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT *
       FROM goals
       WHERE shop_id = $1 AND month_key = $2
       LIMIT 1`,
      [shopId, currentMonthKey],
    ),
    dbQuery(
      `SELECT *
       FROM boards
       WHERE shop_id = $1
       ORDER BY position ASC, created_at ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT col.*
       FROM board_columns col
       INNER JOIN boards brd ON brd.id = col.board_id
       WHERE brd.shop_id = $1
       ORDER BY col.position ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT
        crd.*,
        col.board_id
       FROM board_cards crd
       INNER JOIN board_columns col ON col.id = crd.column_id
       INNER JOIN boards brd ON brd.id = col.board_id
       WHERE brd.shop_id = $1
       ORDER BY crd.position ASC, crd.created_at ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT chk.*
       FROM card_checklists chk
       INNER JOIN board_cards crd ON crd.id = chk.card_id
       INNER JOIN board_columns col ON col.id = crd.column_id
       INNER JOIN boards brd ON brd.id = col.board_id
       WHERE brd.shop_id = $1
       ORDER BY chk.position ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT cmt.*
       FROM card_comments cmt
       INNER JOIN board_cards crd ON crd.id = cmt.card_id
       INNER JOIN board_columns col ON col.id = crd.column_id
       INNER JOIN boards brd ON brd.id = col.board_id
       WHERE brd.shop_id = $1
       ORDER BY cmt.created_at ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT *
       FROM announcements
       WHERE shop_id = $1
       ORDER BY published_at DESC`,
      [shopId],
    ),
    dbQuery(
      `SELECT *
       FROM routine_checklist_items
       WHERE shop_id = $1
       ORDER BY period_key ASC, position ASC`,
      [shopId],
    ),
    dbQuery(
      `SELECT *
       FROM notifications
       WHERE shop_id = $1
       ORDER BY created_at DESC`,
      [shopId],
    ),
  ]);

  const employeesById = new Map(
    employees.map((employee) => [
      employee.id,
      {
        id: employee.id,
        nome: employee.name,
        cargo: employee.role_title,
        comissao: Number(employee.commission_percent),
        sessoes: employee.sessions_count,
        faturamento: Number(employee.revenue_total),
        avatar: employee.avatar_label,
        cor: employee.color_hex,
        telefone: employee.phone,
        email: employee.email,
        admissao: employee.hire_date,
        especialidades: parseJsonArray(employee.specialties),
        dias: employee.work_days,
      },
    ]),
  );

  const cardsById = new Map();
  const columnsById = new Map();

  const nestedBoards = boards.map((board) => ({
    id: board.id,
    nome: board.name,
    cor: board.color_hex,
    cols: [],
  }));
  const boardMap = new Map(nestedBoards.map((board) => [board.id, board]));

  boardColumns.forEach((column) => {
    const mappedColumn = {
      id: column.id,
      nome: column.name,
      cor: column.color_hex,
      cards: [],
    };

    columnsById.set(column.id, mappedColumn);
    boardMap.get(column.board_id)?.cols.push(mappedColumn);
  });

  boardCards.forEach((card) => {
    const mappedCard = {
      id: card.id,
      produtoId: card.product_id,
      titulo: card.title,
      prioridade: card.priority,
      responsavelId: card.responsible_employee_id,
      due: card.due_date,
      auto: card.auto_generated,
      checks: [],
      comentarios: [],
    };

    cardsById.set(card.id, mappedCard);
    columnsById.get(card.column_id)?.cards.push(mappedCard);
  });

  cardChecklistItems.forEach((item) => {
    cardsById.get(item.card_id)?.checks.push({
      texto: item.text_value,
      done: item.done,
    });
  });

  cardComments.forEach((comment) => {
    cardsById.get(comment.card_id)?.comentarios.push({
      autor: comment.author_name,
      texto: comment.comment_text,
    });
  });

  const goalMonthKey = currentMonthKey;
  const currentGoalRevenue = financialEntries.reduce((total, entry) => {
    const entryDate = String(entry.entry_date || "").slice(0, 10);
    return entry.entry_type === "entrada" && entryDate.startsWith(goalMonthKey)
      ? total + Number(entry.amount)
      : total;
  }, 0);

  return {
    agenda: appointments.map((appointment) => ({
      id: appointment.id,
      clienteId: appointment.customer_id,
      barbeiroId: appointment.employee_id,
      cliente: appointment.customer_name,
      barbeiro: appointment.employee_name || "Sem responsável",
      servico: appointment.service_name,
      hora: appointment.scheduled_time,
      dur: appointment.duration_minutes,
      valor: Number(appointment.amount),
      status: appointment.status,
      data: appointment.scheduled_date,
    })),
    equipe: Array.from(employeesById.values()),
    clientes: customers.map((customer) => ({
      id: customer.id,
      nome: customer.name,
      telefone: customer.phone,
      visitas: customer.visit_count,
      gasto: Number(customer.total_spend),
      avatar: customer.avatar_label,
      instagram: customer.instagram,
      email: customer.email,
      nascimento: customer.birth_date,
      ultimaVisita: customer.last_visit_at,
      observacoes: customer.notes,
    })),
    estoque: products.map((product) => ({
      id: product.id,
      produto: product.name,
      categoria: product.category,
      quantidade: product.quantity,
      minimo: product.minimum_quantity,
      preco: Number(product.unit_price),
      marca: product.brand,
    })),
    movimentacoesEstoque: inventoryMovements.map((movement) => ({
      id: movement.id,
      produtoId: movement.product_id,
      produto: movement.product_name,
      tipo: movement.movement_type,
      quantidade: Math.abs(movement.quantity_change),
      quantidadeDelta: movement.quantity_change,
      custoUnitario: movement.unit_cost == null ? null : Number(movement.unit_cost),
      total: movement.total_amount == null ? null : Number(movement.total_amount),
      data: movement.movement_date,
      observacao: movement.note,
      financeiroId: movement.financial_entry_id,
    })),
    financeiro: financialEntries.map((entry) => ({
      id: entry.id,
      tipo: entry.entry_type,
      descricao: entry.description,
      categoria: entry.category,
      valor: Number(entry.amount),
      data: entry.entry_date,
      origem: getFinancialEntryOrigin(entry),
      referenciaId: entry.appointment_id || entry.inventory_movement_id || null,
      editavel: !entry.appointment_id && !entry.inventory_movement_id,
    })),
    serie: monthlySnapshots.map((snapshot) => ({
      monthKey: snapshot.month_key,
      mes: snapshot.month_label,
      faturamento: Number(snapshot.revenue),
      despesas: Number(snapshot.expenses),
    })),
    metas: {
      faturamento: goals[0] ? Number(goals[0].revenue_target) : 0,
      atual: currentGoalRevenue,
      monthKey: goalMonthKey,
    },
    boards: nestedBoards,
    comunicados: announcements.map((announcement) => ({
      id: announcement.id,
      autor: announcement.author_name,
      titulo: announcement.title,
      texto: announcement.body,
      data: formatRelativeLabel(announcement.published_at),
    })),
    checklists: groupChecklistItems(checklistItems),
    notifs: notifications.map((notification) => ({
      id: notification.id,
      cat: notification.category,
      ico: notification.icon,
      cor: notification.color_hex,
      titulo: notification.title,
      descricao: notification.description,
      tempo: formatRelativeLabel(notification.created_at),
      unread: !notification.read_at,
    })),
    referenceDate,
  };
}

function getFinancialEntryOrigin(entry) {
  if (entry.appointment_id) {
    return "appointment";
  }

  if (entry.inventory_movement_id) {
    return "inventory_purchase";
  }

  return "manual";
}

function resolveReferenceDate() {
  const timeZone = process.env.APP_TIME_ZONE || "America/Sao_Paulo";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function groupChecklistItems(items) {
  return items.reduce(
    (grouped, item) => {
      if (!grouped[item.period_key]) {
        grouped[item.period_key] = [];
      }

      grouped[item.period_key].push({
        texto: item.text_value,
        done: item.done,
      });

      return grouped;
    },
    { abertura: [], fechamento: [] },
  );
}

function formatRelativeLabel(timestamp) {
  const createdAt = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    return "agora";
  }

  if (diffHours < 24) {
    return `há ${diffHours}h`;
  }

  if (diffDays === 1) {
    return "ontem";
  }

  return `há ${diffDays} dias`;
}
