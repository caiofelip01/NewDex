import { randomUUID } from "node:crypto";

import { dbQuery, dbTransaction } from "./db.js";
import { HttpError } from "./http.js";

// Cria ou atualiza a meta mensal da loja com base no m�s selecionado.
export async function saveGoal(shopId, payload) {
  const revenueTarget = readNumber(payload.faturamento, "Meta de faturamento");
  const monthKey = readMonthKey(payload.monthKey || new Date().toISOString().slice(0, 7));

  await dbQuery(
    `INSERT INTO goals (id, shop_id, month_key, revenue_target, current_value)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (shop_id, month_key)
     DO UPDATE SET
       revenue_target = EXCLUDED.revenue_target,
       updated_at = NOW()`,
    [randomUUID(), shopId, monthKey, revenueTarget, 0],
  );
}

// Salva um agendamento novo ou atualiza um existente usando os dados do formul�rio.
export async function saveAppointment(shopId, payload, appointmentId = null) {
  const customerName = requireText(payload.cliente, "Cliente");
  const employeeName = requireText(payload.barbeiro, "Barbeiro");
  const serviceName = requireText(payload.servico, "Serviço");
  const scheduledDate = requireDate(payload.data, "Data");
  const scheduledTime = requireTime(payload.hora, "Hora");
  const amount = readNumber(payload.valor, "Valor");
  const durationMinutes = payload.dur ? readInteger(payload.dur, "Duração") : 45;
  const status = readStatus(payload.status, ["agendado", "confirmado", "concluido"]);
  // IDs eliminam ambiguidades entre pessoas com o mesmo nome. O fallback por nome
  // mantém compatibilidade com clientes antigos da API.
  const employeeId = await resolveEmployeeId(shopId, payload.barbeiroId, employeeName);
  const customerId = await resolveCustomerId(shopId, payload.clienteId, customerName);

  if (appointmentId) {
    await mutateAppointmentAtomically(shopId, appointmentId, {
      preserveExistingFields: false,
      customerId,
      employeeId,
      customerName,
      serviceName,
      scheduledDate,
      scheduledTime,
      durationMinutes,
      amount,
      status,
    });

    return appointmentId;
  }

  const id = randomUUID();
  const nextAppointment = {
    id,
    shopId,
    customerId,
    employeeId,
    customerName,
    serviceName,
    scheduledDate,
    scheduledTime,
    durationMinutes,
    amount,
    status,
  };

  await dbTransaction((sql) => {
    const queries = [
      sql.query("SELECT id FROM shops WHERE id = $1 FOR UPDATE", [shopId]),
      sql.query(
        `INSERT INTO appointments (
          id, shop_id, customer_id, employee_id, customer_name, service_name,
          scheduled_date, scheduled_time, duration_minutes, amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, shopId, customerId, employeeId, customerName, serviceName, scheduledDate, scheduledTime, durationMinutes, amount, status],
      ),
      buildAppointmentFinancialSyncQuery(sql, nextAppointment),
    ];

    appendCreatedAppointmentMetricQueries(queries, sql, nextAppointment);
    return queries;
  });

  return id;
}

// Atualiza apenas o status do agendamento sem mexer no restante dos dados.
export async function updateAppointmentStatus(shopId, appointmentId, status) {
  const normalizedStatus = readStatus(status, ["agendado", "confirmado", "concluido"]);
  await mutateAppointmentAtomically(shopId, appointmentId, {
    preserveExistingFields: true,
    customerId: null,
    employeeId: null,
    customerName: null,
    serviceName: null,
    scheduledDate: null,
    scheduledTime: null,
    durationMinutes: null,
    amount: null,
    status: normalizedStatus,
  });
}

// Persiste o cadastro do cliente, reaproveitando a mesma rotina para criar e editar.
export async function saveCustomer(shopId, payload, customerId = null) {
  const name = requireText(payload.nome, "Nome");
  const phone = String(payload.telefone || "").trim();
  const instagram = String(payload.instagram || "").trim();
  const email = String(payload.email || "").trim();
  const birthDate = payload.nascimento ? requireDate(payload.nascimento, "Nascimento") : null;
  const notes = String(payload.observacoes || "").trim();
  // Métricas são alteradas exclusivamente pelas transições da agenda.
  const visitCount = 0;
  const totalSpend = 0;
  const avatarLabel = String(payload.avatar || createInitials(name)).trim();
  const lastVisit = null;

  if (customerId) {
    const updated = await dbQuery(
      `UPDATE customers
       SET name = $3,
           phone = $4,
           instagram = $5,
           email = $6,
           birth_date = $7,
           notes = $8,
           avatar_label = $9,
           updated_at = NOW()
       WHERE id = $1 AND shop_id = $2
       RETURNING id`,
      [customerId, shopId, name, phone, instagram, email, birthDate, notes, avatarLabel],
    );

    if (!updated.length) {
      throw new HttpError(404, "Cliente não encontrado.", { code: "customer_not_found" });
    }

    return updated[0].id;
  }

  const id = randomUUID();
  await dbQuery(
    `INSERT INTO customers (
      id, shop_id, name, phone, visit_count, total_spend, avatar_label, instagram,
      email, birth_date, last_visit_at, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, shopId, name, phone, visitCount, totalSpend, avatarLabel, instagram, email, birthDate, lastVisit, notes],
  );

  return id;
}

// Remove um cliente da loja e falha com 404 se ele j� n�o existir.
export async function deleteCustomer(shopId, customerId) {
  const deleted = await dbQuery("DELETE FROM customers WHERE id = $1 AND shop_id = $2 RETURNING id", [customerId, shopId]);
  if (!deleted.length) {
    throw new HttpError(404, "Cliente não encontrado.", { code: "customer_not_found" });
  }
}

// Salva os dados do profissional, inclusive m�tricas e especialidades.
export async function saveEmployee(shopId, payload, employeeId = null) {
  const name = requireText(payload.nome, "Nome");
  const roleTitle = requireText(payload.cargo || "Barbeiro", "Cargo");
  const phone = String(payload.telefone || "").trim();
  const email = String(payload.email || "").trim();
  const hireDate = payload.admissao ? requireDate(payload.admissao, "Admissão") : null;
  const commission = readNumber(payload.comissao ?? 35, "Comissão");
  const avatarLabel = String(payload.avatar || createInitials(name)).trim();
  const colorHex = String(payload.cor || "#FF6B2B").trim();
  // Produção é derivada de atendimentos concluídos, não do formulário cadastral.
  const sessionsCount = 0;
  const revenueTotal = 0;
  const workDays = payload.dias != null ? readInteger(payload.dias, "Dias") : 0;
  const specialties = Array.isArray(payload.especialidades) ? payload.especialidades : [];

  if (employeeId) {
    const updated = await dbQuery(
      `UPDATE employees
       SET name = $3,
           role_title = $4,
           phone = $5,
           email = $6,
           hire_date = $7,
           commission_percent = $8,
           avatar_label = $9,
           color_hex = $10,
           work_days = $11,
           specialties = $12::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND shop_id = $2
       RETURNING id`,
      [employeeId, shopId, name, roleTitle, phone, email, hireDate, commission, avatarLabel, colorHex, workDays, JSON.stringify(specialties)],
    );

    if (!updated.length) {
      throw new HttpError(404, "Profissional não encontrado.", { code: "employee_not_found" });
    }

    return updated[0].id;
  }

  const id = randomUUID();
  await dbQuery(
    `INSERT INTO employees (
      id, shop_id, name, role_title, commission_percent, sessions_count, revenue_total,
      avatar_label, color_hex, phone, email, hire_date, specialties, work_days
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)`,
    [id, shopId, name, roleTitle, commission, sessionsCount, revenueTotal, avatarLabel, colorHex, phone, email, hireDate, JSON.stringify(specialties), workDays],
  );

  return id;
}

// Registra entradas e sa�das financeiras, ou atualiza um lan�amento j� existente.
export async function saveFinancialEntry(shopId, payload, entryId = null) {
  const entryType = readStatus(payload.tipo, ["entrada", "saida"]);
  const description = requireText(payload.descricao, "Descrição");
  const category = requireText(payload.categoria, "Categoria");
  const amount = readNumber(payload.valor, "Valor");
  const entryDate = requireDate(payload.data, "Data");

  if (entryId) {
    await assertManualFinancialEntry(shopId, entryId);
    const updated = await dbQuery(
      `UPDATE financial_entries
       SET entry_type = $3,
           description = $4,
           category = $5,
           amount = $6,
           entry_date = $7,
           updated_at = NOW()
       WHERE id = $1 AND shop_id = $2
       RETURNING id`,
      [entryId, shopId, entryType, description, category, amount, entryDate],
    );

    if (!updated.length) {
      throw new HttpError(404, "Lançamento não encontrado.", { code: "financial_entry_not_found" });
    }

    return updated[0].id;
  }

  const id = randomUUID();
  await dbQuery(
    `INSERT INTO financial_entries (
      id, shop_id, entry_type, description, category, amount, entry_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, shopId, entryType, description, category, amount, entryDate],
  );

  return id;
}

// Exclui um lan�amento financeiro garantindo que ele pertence � loja atual.
export async function deleteFinancialEntry(shopId, entryId) {
  await assertManualFinancialEntry(shopId, entryId);
  const deleted = await dbQuery("DELETE FROM financial_entries WHERE id = $1 AND shop_id = $2 RETURNING id", [entryId, shopId]);
  if (!deleted.length) {
    throw new HttpError(404, "Lançamento não encontrado.", { code: "financial_entry_not_found" });
  }
}

async function assertManualFinancialEntry(shopId, entryId) {
  const [entry] = await dbQuery(
    `SELECT id, appointment_id, inventory_movement_id
     FROM financial_entries
     WHERE id = $1 AND shop_id = $2
     LIMIT 1`,
    [entryId, shopId],
  );

  if (!entry) {
    throw new HttpError(404, "Lançamento não encontrado.", { code: "financial_entry_not_found" });
  }

  if (entry.appointment_id || entry.inventory_movement_id) {
    throw new HttpError(409, "Altere este lançamento pela operação que o gerou.", {
      code: "generated_financial_entry_readonly",
    });
  }
}

// Cria ou atualiza produtos do estoque com valida��o b�sica de quantidade e pre�o.
export async function saveProduct(shopId, payload, productId = null) {
  const name = requireText(payload.produto, "Produto");
  const category = requireText(payload.categoria, "Categoria");
  const quantity = readInteger(payload.quantidade, "Quantidade");
  const minimumQuantity = readInteger(payload.minimo, "Mínimo");
  const unitPrice = readNumber(payload.preco, "Preço");
  const brand = String(payload.marca || "").trim();

  if (productId) {
    const updated = await dbQuery(
      `UPDATE products
       SET name = $3,
           category = $4,
           quantity = $5,
           minimum_quantity = $6,
           unit_price = $7,
           brand = $8,
           updated_at = NOW()
       WHERE id = $1 AND shop_id = $2
       RETURNING id`,
      [productId, shopId, name, category, quantity, minimumQuantity, unitPrice, brand],
    );

    if (!updated.length) {
      throw new HttpError(404, "Produto não encontrado.", { code: "product_not_found" });
    }

    return updated[0].id;
  }

  const id = randomUUID();
  await dbQuery(
    `INSERT INTO products (
      id, shop_id, name, category, quantity, minimum_quantity, unit_price, brand
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, shopId, name, category, quantity, minimumQuantity, unitPrice, brand],
  );

  return id;
}

// Remove um produto do estoque e retorna erro amig�vel se ele n�o existir.
export async function deleteProduct(shopId, productId) {
  const [movement] = await dbQuery(
    `SELECT id
     FROM inventory_movements
     WHERE product_id = $1 AND shop_id = $2
     LIMIT 1`,
    [productId, shopId],
  );

  if (movement) {
    throw new HttpError(409, "Produto com movimentações não pode ser excluído.", {
      code: "product_has_inventory_history",
    });
  }

  const deleted = await dbQuery("DELETE FROM products WHERE id = $1 AND shop_id = $2 RETURNING id", [productId, shopId]);
  if (!deleted.length) {
    throw new HttpError(404, "Produto não encontrado.", { code: "product_not_found" });
  }
}

// Registra uma compra como um unico fato de dominio: entrada no estoque,
// movimentacao auditavel e despesa financeira vinculada.
export async function registerProductPurchase(shopId, productId, payload) {
  const quantity = readPositiveInteger(payload.quantidade, "Quantidade");
  const unitCost = readNumber(payload.custoUnitario, "Custo unitário");
  const purchaseDate = requireDate(payload.data, "Data");
  const note = readOptionalText(payload.observacao, "Observação");
  const [product] = await dbQuery(
    "SELECT id, name FROM products WHERE id = $1 AND shop_id = $2 LIMIT 1",
    [productId, shopId],
  );

  if (!product) {
    throw new HttpError(404, "Produto não encontrado.", { code: "product_not_found" });
  }

  const movementId = randomUUID();
  const financialEntryId = randomUUID();
  const totalAmount = roundMoney(quantity * unitCost);

  const results = await dbTransaction((sql) => [
    sql.query(
      `UPDATE products
       SET unit_price = CASE
             WHEN quantity + $3 > 0
               THEN ROUND(((quantity * unit_price) + ($3 * $4)) / (quantity + $3), 2)
             ELSE $4
           END,
           quantity = quantity + $3,
           updated_at = NOW()
       WHERE id = $1 AND shop_id = $2
       RETURNING id`,
      [productId, shopId, quantity, unitCost],
    ),
    sql.query(
      `INSERT INTO inventory_movements (
         id, shop_id, product_id, movement_type, quantity_change,
         movement_date, unit_cost, total_amount, note
       ) VALUES ($1, $2, $3, 'compra', $4, $5, $6, $7, $8)`,
      [movementId, shopId, productId, quantity, purchaseDate, unitCost, totalAmount, note],
    ),
    sql.query(
      `INSERT INTO financial_entries (
         id, shop_id, entry_type, description, category, amount, entry_date,
         inventory_movement_id
       ) VALUES ($1, $2, 'saida', $3, 'Estoque', $4, $5, $6)`,
      [
        financialEntryId,
        shopId,
        `Compra de estoque: ${product.name}`,
        totalAmount,
        purchaseDate,
        movementId,
      ],
    ),
    sql.query(
      `DELETE FROM board_cards card
       USING board_columns board_column, boards board, products product
       WHERE card.column_id = board_column.id
         AND board_column.board_id = board.id
         AND card.product_id = product.id
         AND card.product_id = $1
         AND card.auto_generated = TRUE
         AND board.shop_id = $2
         AND product.shop_id = $2
         AND product.quantity > product.minimum_quantity
       RETURNING card.id`,
      [productId, shopId],
    ),
  ]);

  if (!results[0]?.length) {
    throw new HttpError(404, "Produto não encontrado.", { code: "product_not_found" });
  }

  return { id: movementId, financialEntryId };
}

// Cria um novo card dentro de uma coluna válida do quadro atual.
export async function createBoardCard(shopId, payload) {
  const columnId = requireText(payload.columnId, "Coluna");
  const title = requireText(payload.titulo, "Título");
  const priority = readStatus(payload.prioridade, ["alta", "media", "baixa"]);
  const dueDate = payload.due ? requireDate(payload.due, "Prazo") : null;
  const responsibleEmployeeId = payload.responsavelId ? String(payload.responsavelId) : null;
  const id = randomUUID();

  const [column] = await dbQuery(
    `SELECT col.id
     FROM board_columns col
     INNER JOIN boards brd ON brd.id = col.board_id
     WHERE col.id = $1 AND brd.shop_id = $2
     LIMIT 1`,
    [columnId, shopId],
  );

  if (!column) {
    throw new HttpError(404, "Coluna não encontrada.", { code: "column_not_found" });
  }

  // O próximo índice da coluna define a posição inicial do card no quadro.
  if (responsibleEmployeeId) {
    const [employee] = await dbQuery(
      "SELECT id FROM employees WHERE id = $1 AND shop_id = $2 LIMIT 1",
      [responsibleEmployeeId, shopId],
    );
    if (!employee) {
      throw new HttpError(400, "Responsavel invalido.", { code: "invalid_responsible_employee" });
    }
  }

  const [positionRow] = await dbQuery(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM board_cards WHERE column_id = $1",
    [columnId],
  );

  await dbQuery(
    `INSERT INTO board_cards (
      id, column_id, title, priority, responsible_employee_id, due_date, auto_generated, position
    ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)`,
    [id, columnId, title, priority, responsibleEmployeeId, dueDate, positionRow.next_position || 0],
  );

  return id;
}

// Move um card entre colunas ou reordena dentro da mesma coluna.
export async function moveBoardCard(shopId, cardId, payload) {
  const targetColumnId = requireText(payload.targetColumnId, "Coluna de destino");
  const targetIndex = readInteger(payload.targetIndex ?? 0, "Posicao de destino");

  const [card] = await dbQuery(
    `SELECT crd.id, crd.column_id
     FROM board_cards crd
     INNER JOIN board_columns col ON col.id = crd.column_id
     INNER JOIN boards brd ON brd.id = col.board_id
     WHERE crd.id = $1 AND brd.shop_id = $2
     LIMIT 1`,
    [cardId, shopId],
  );

  if (!card) {
    throw new HttpError(404, "Cartao nao encontrado.", { code: "board_card_not_found" });
  }

  const [targetColumn] = await dbQuery(
    `SELECT col.id
     FROM board_columns col
     INNER JOIN boards brd ON brd.id = col.board_id
     WHERE col.id = $1 AND brd.shop_id = $2
     LIMIT 1`,
    [targetColumnId, shopId],
  );

  if (!targetColumn) {
    throw new HttpError(404, "Coluna nao encontrada.", { code: "column_not_found" });
  }

  const sourceColumnId = card.column_id;

  if (sourceColumnId === targetColumnId) {
    const rows = await dbQuery(
      `SELECT id
       FROM board_cards
       WHERE column_id = $1
       ORDER BY position ASC, created_at ASC`,
      [sourceColumnId],
    );
    const nextIds = rows.map((item) => item.id).filter((id) => id !== cardId);
    const nextIndex = Math.min(targetIndex, nextIds.length);
    nextIds.splice(nextIndex, 0, cardId);

    await dbTransaction((sql) => buildBoardCardPositionQueries(sql, nextIds, sourceColumnId));
    return;
  }

  const [sourceRows, targetRows] = await Promise.all([
    dbQuery(
      `SELECT id
       FROM board_cards
       WHERE column_id = $1 AND id <> $2
       ORDER BY position ASC, created_at ASC`,
      [sourceColumnId, cardId],
    ),
    dbQuery(
      `SELECT id
       FROM board_cards
       WHERE column_id = $1
       ORDER BY position ASC, created_at ASC`,
      [targetColumnId],
    ),
  ]);

  const nextSourceIds = sourceRows.map((item) => item.id);
  const nextTargetIds = targetRows.map((item) => item.id);
  const nextIndex = Math.min(targetIndex, nextTargetIds.length);
  nextTargetIds.splice(nextIndex, 0, cardId);

  await dbTransaction((sql) => [
    sql.query(
      `UPDATE board_cards
       SET column_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [cardId, targetColumnId],
    ),
    ...buildBoardCardPositionQueries(sql, nextSourceIds, sourceColumnId),
    ...buildBoardCardPositionQueries(sql, nextTargetIds, targetColumnId),
  ]);
}

async function mutateAppointmentAtomically(shopId, appointmentId, mutation) {
  const results = await dbTransaction((sql) => [
    // Serializar por loja tambem cobre dois agendamentos diferentes que alteram
    // as metricas do mesmo cliente ou profissional.
    sql.query("SELECT id FROM shops WHERE id = $1 FOR UPDATE", [shopId]),
    sql.query(
      `SELECT id
       FROM appointments
       WHERE id = $1 AND shop_id = $2
       FOR UPDATE`,
      [appointmentId, shopId],
    ),
    buildAtomicAppointmentMutationQuery(sql, shopId, appointmentId, mutation),
  ]);

  if (!results[1]?.length) {
    throw new HttpError(404, "Agendamento não encontrado.", { code: "appointment_not_found" });
  }

  if (!results[2]?.length) {
    throw new HttpError(409, "O agendamento foi alterado por outra operação.", {
      code: "appointment_update_conflict",
    });
  }
}

function buildAtomicAppointmentMutationQuery(sql, shopId, appointmentId, mutation) {
  return sql.query(
    `WITH old_appointment AS MATERIALIZED (
       SELECT
         appointment.id,
         appointment.shop_id,
         appointment.customer_id,
         appointment.employee_id,
         appointment.customer_name,
         appointment.service_name,
         appointment.scheduled_date,
         appointment.scheduled_time,
         appointment.duration_minutes,
         appointment.amount,
         appointment.status
       FROM appointments appointment
       WHERE appointment.id = $1 AND appointment.shop_id = $2
     ),
     updated_appointment AS (
       UPDATE appointments appointment
       SET customer_id = CASE WHEN $3::boolean THEN old.customer_id ELSE $4::uuid END,
           employee_id = CASE WHEN $3::boolean THEN old.employee_id ELSE $5::uuid END,
           customer_name = CASE WHEN $3::boolean THEN old.customer_name ELSE $6::text END,
           service_name = CASE WHEN $3::boolean THEN old.service_name ELSE $7::text END,
           scheduled_date = CASE WHEN $3::boolean THEN old.scheduled_date ELSE $8::date END,
           scheduled_time = CASE WHEN $3::boolean THEN old.scheduled_time ELSE $9::text END,
           duration_minutes = CASE WHEN $3::boolean THEN old.duration_minutes ELSE $10::integer END,
           amount = CASE WHEN $3::boolean THEN old.amount ELSE $11::numeric END,
           status = $12::text,
           updated_at = NOW()
       FROM old_appointment old
       WHERE appointment.id = old.id AND appointment.shop_id = old.shop_id
       RETURNING
         appointment.id,
         appointment.shop_id,
         appointment.customer_id,
         appointment.employee_id,
         appointment.customer_name,
         appointment.service_name,
         appointment.scheduled_date,
         appointment.scheduled_time,
         appointment.duration_minutes,
         appointment.amount,
         appointment.status,
         old.customer_id AS old_customer_id,
         old.employee_id AS old_employee_id,
         old.amount AS old_amount,
         old.status AS old_status
     ),
     deleted_financial AS (
       DELETE FROM financial_entries entry
       USING updated_appointment updated
       WHERE entry.shop_id = updated.shop_id
         AND entry.appointment_id = updated.id
         AND updated.status <> 'concluido'
       RETURNING entry.id
     ),
     synced_financial AS (
       INSERT INTO financial_entries (
         id, shop_id, entry_type, description, category, amount, entry_date, appointment_id
       )
       SELECT
         $13::uuid,
         updated.shop_id,
         'entrada',
         'Atendimento: ' || updated.service_name || ' — ' || updated.customer_name,
         'Serviços',
         updated.amount,
         updated.scheduled_date,
         updated.id
       FROM updated_appointment updated
       WHERE updated.status = 'concluido'
         AND (
           updated.old_status <> 'concluido'
           OR EXISTS (
             SELECT 1
             FROM financial_entries existing
             WHERE existing.shop_id = updated.shop_id
               AND existing.appointment_id = updated.id
           )
         )
       ON CONFLICT (appointment_id) WHERE appointment_id IS NOT NULL
       DO UPDATE SET
         entry_type = 'entrada',
         description = EXCLUDED.description,
         category = 'Serviços',
         amount = EXCLUDED.amount,
         entry_date = EXCLUDED.entry_date,
         updated_at = NOW()
       RETURNING id
     ),
     customer_deltas AS (
       SELECT
         delta.customer_id,
         SUM(delta.visit_delta)::integer AS visit_delta,
         SUM(delta.spend_delta)::numeric AS spend_delta
       FROM (
         SELECT
           updated.old_customer_id AS customer_id,
           -1::integer AS visit_delta,
           -updated.old_amount AS spend_delta
         FROM updated_appointment updated
         WHERE updated.old_status = 'concluido' AND updated.old_customer_id IS NOT NULL
         UNION ALL
         SELECT
           updated.customer_id,
           1::integer,
           updated.amount
         FROM updated_appointment updated
         WHERE updated.status = 'concluido' AND updated.customer_id IS NOT NULL
       ) delta
       GROUP BY delta.customer_id
     ),
     updated_customers AS (
       UPDATE customers customer
       SET visit_count = GREATEST(0, customer.visit_count + delta.visit_delta),
           total_spend = GREATEST(0, customer.total_spend + delta.spend_delta),
           last_visit_at = (
             SELECT MAX(candidate.scheduled_date)
             FROM (
               SELECT candidate_appointment.scheduled_date
               FROM appointments candidate_appointment
               WHERE candidate_appointment.shop_id = $2
                 AND candidate_appointment.customer_id = delta.customer_id
                 AND candidate_appointment.id <> $1
                 AND candidate_appointment.status = 'concluido'
               UNION ALL
               SELECT updated.scheduled_date
               FROM updated_appointment updated
               WHERE updated.customer_id = delta.customer_id
                 AND updated.status = 'concluido'
             ) candidate
           ),
           updated_at = NOW()
       FROM customer_deltas delta
       WHERE customer.id = delta.customer_id AND customer.shop_id = $2
       RETURNING customer.id
     ),
     employee_deltas AS (
       SELECT
         delta.employee_id,
         SUM(delta.session_delta)::integer AS session_delta,
         SUM(delta.revenue_delta)::numeric AS revenue_delta
       FROM (
         SELECT
           updated.old_employee_id AS employee_id,
           -1::integer AS session_delta,
           -updated.old_amount AS revenue_delta
         FROM updated_appointment updated
         WHERE updated.old_status = 'concluido' AND updated.old_employee_id IS NOT NULL
         UNION ALL
         SELECT
           updated.employee_id,
           1::integer,
           updated.amount
         FROM updated_appointment updated
         WHERE updated.status = 'concluido' AND updated.employee_id IS NOT NULL
       ) delta
       GROUP BY delta.employee_id
     ),
     updated_employees AS (
       UPDATE employees employee
       SET sessions_count = GREATEST(0, employee.sessions_count + delta.session_delta),
           revenue_total = GREATEST(0, employee.revenue_total + delta.revenue_delta),
           updated_at = NOW()
       FROM employee_deltas delta
       WHERE employee.id = delta.employee_id AND employee.shop_id = $2
       RETURNING employee.id
     )
     SELECT
       updated.id,
       (SELECT COUNT(*) FROM deleted_financial) AS deleted_financial_count,
       (SELECT COUNT(*) FROM synced_financial) AS synced_financial_count,
       (SELECT COUNT(*) FROM updated_customers) AS updated_customer_count,
       (SELECT COUNT(*) FROM updated_employees) AS updated_employee_count
     FROM updated_appointment updated`,
    [
      appointmentId,
      shopId,
      mutation.preserveExistingFields,
      mutation.customerId,
      mutation.employeeId,
      mutation.customerName,
      mutation.serviceName,
      mutation.scheduledDate,
      mutation.scheduledTime,
      mutation.durationMinutes,
      mutation.amount,
      mutation.status,
      randomUUID(),
    ],
  );
}

function buildAppointmentFinancialSyncQuery(sql, appointment) {
  if (appointment.status !== "concluido") {
    return sql.query(
      "DELETE FROM financial_entries WHERE shop_id = $1 AND appointment_id = $2",
      [appointment.shopId, appointment.id],
    );
  }

  return sql.query(
    `INSERT INTO financial_entries (
       id, shop_id, entry_type, description, category, amount, entry_date, appointment_id
     ) VALUES ($1, $2, 'entrada', $3, 'Serviços', $4, $5, $6)
     ON CONFLICT (appointment_id) WHERE appointment_id IS NOT NULL
     DO UPDATE SET
       entry_type = 'entrada',
       description = EXCLUDED.description,
       category = 'Serviços',
       amount = EXCLUDED.amount,
       entry_date = EXCLUDED.entry_date,
       updated_at = NOW()`,
    [
      randomUUID(),
      appointment.shopId,
      `Atendimento: ${appointment.serviceName} — ${appointment.customerName}`,
      appointment.amount,
      appointment.scheduledDate,
      appointment.id,
    ],
  );
}

function appendCreatedAppointmentMetricQueries(queries, sql, appointment) {
  if (appointment.status !== "concluido") {
    return;
  }

  if (appointment.customerId) {
    queries.push(
      sql.query(
        `UPDATE customers
         SET visit_count = visit_count + 1,
             total_spend = total_spend + $3,
             updated_at = NOW()
         WHERE id = $1 AND shop_id = $2`,
        [appointment.customerId, appointment.shopId, appointment.amount],
      ),
      sql.query(
        `UPDATE customers customer
         SET last_visit_at = (
               SELECT MAX(candidate.scheduled_date)
               FROM appointments candidate
               WHERE candidate.shop_id = $2
                 AND candidate.customer_id = customer.id
                 AND candidate.status = 'concluido'
             ),
             updated_at = NOW()
         WHERE customer.id = $1 AND customer.shop_id = $2`,
        [appointment.customerId, appointment.shopId],
      ),
    );
  }

  if (appointment.employeeId) {
    queries.push(
      sql.query(
        `UPDATE employees
         SET sessions_count = sessions_count + 1,
             revenue_total = revenue_total + $3,
             updated_at = NOW()
         WHERE id = $1 AND shop_id = $2`,
        [appointment.employeeId, appointment.shopId, appointment.amount],
      ),
    );
  }
}

async function resolveEmployeeId(shopId, requestedId, employeeName) {
  if (requestedId != null && String(requestedId).trim()) {
    const employeeId = readUuid(requestedId, "Profissional");
    const [employee] = await dbQuery(
      "SELECT id FROM employees WHERE id = $1 AND shop_id = $2 LIMIT 1",
      [employeeId, shopId],
    );

    if (!employee) {
      throw new HttpError(400, "Profissional inválido.", { code: "invalid_employee" });
    }

    return employee.id;
  }

  return findEmployeeIdByName(shopId, employeeName);
}

async function resolveCustomerId(shopId, requestedId, customerName) {
  if (requestedId != null && String(requestedId).trim()) {
    const customerId = readUuid(requestedId, "Cliente");
    const [customer] = await dbQuery(
      "SELECT id FROM customers WHERE id = $1 AND shop_id = $2 LIMIT 1",
      [customerId, shopId],
    );

    if (!customer) {
      throw new HttpError(400, "Cliente inválido.", { code: "invalid_customer" });
    }

    return customer.id;
  }

  return findCustomerIdByName(shopId, customerName);
}

// Resolve nomes para ids quando clientes antigos ainda não enviam a FK direta.
async function findEmployeeIdByName(shopId, employeeName) {
  const [employee] = await dbQuery(
    "SELECT id FROM employees WHERE shop_id = $1 AND name = $2 LIMIT 1",
    [shopId, employeeName],
  );

  return employee?.id || null;
}

async function findCustomerIdByName(shopId, customerName) {
  const [customer] = await dbQuery(
    "SELECT id FROM customers WHERE shop_id = $1 AND name = $2 LIMIT 1",
    [shopId, customerName],
  );

  return customer?.id || null;
}

// Helpers de validação evitam repetir a mesma checagem em cada entidade.
function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new HttpError(400, `${label} é obrigatório.`, { code: "missing_field" });
  }

  if (text.length > 500) {
    throw new HttpError(400, `${label} excede o tamanho permitido.`, { code: "field_too_long" });
  }

  return text;
}

// Converte n�meros monet�rios e impede valores negativos ou inv�lidos.
function readNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(400, `${label} inválido.`, { code: "invalid_number" });
  }

  return number;
}

// Garante que campos cont�veis sejam inteiros positivos.
function readInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new HttpError(400, `${label} inválido.`, { code: "invalid_integer" });
  }

  return number;
}

function readPositiveInteger(value, label) {
  const number = readInteger(value, label);
  if (number === 0) {
    throw new HttpError(400, `${label} deve ser maior que zero.`, { code: "invalid_integer" });
  }

  return number;
}

function readOptionalText(value, label) {
  const text = String(value || "").trim();
  if (text.length > 500) {
    throw new HttpError(400, `${label} excede o tamanho permitido.`, { code: "field_too_long" });
  }

  return text;
}

function readUuid(value, label) {
  const uuid = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new HttpError(400, `${label} inválido.`, { code: "invalid_uuid" });
  }

  return uuid;
}

function readMonthKey(value) {
  const monthKey = String(value || "").trim();
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new HttpError(400, "Mês da meta inválido.", { code: "invalid_month_key" });
  }

  return monthKey;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Valida datas no formato yyyy-mm-dd, o mesmo padr�o usado pelos inputs date.
function requireDate(value, label) {
  const date = String(value || "").trim();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, `${label} inválida.`, { code: "invalid_date" });
  }

  return date;
}

// Valida horas no formato hh:mm para manter consist�ncia com o front.
function requireTime(value, label) {
  const time = String(value || "").trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new HttpError(400, `${label} inválida.`, { code: "invalid_time" });
  }

  return time;
}

// Restringe enums a uma lista conhecida para evitar estados inesperados.
function readStatus(value, allowedValues) {
  const status = String(value || "").trim();
  if (!allowedValues.includes(status)) {
    throw new HttpError(400, "Valor inválido.", { code: "invalid_enum_value" });
  }

  return status;
}

// Gera um avatar textual simples usando at� as duas primeiras palavras do nome.
function createInitials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

// Retorna queries ainda não aguardadas, como exigido pela transação HTTP do Neon.
function buildBoardCardPositionQueries(sql, cardIds, columnId) {
  return cardIds.map((id, index) =>
    sql.query(
      `UPDATE board_cards
       SET position = $2,
           column_id = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [id, index, columnId],
    ),
  );
}
