import { randomUUID } from "node:crypto";

import { initialData } from "../Frontdex/SRC/data/initialData.js";

export function buildSeedQueries(sql, shopId) {
  const employeeIdsByName = new Map();
  const customerIdsByName = new Map();
  const appointmentIdsBySeedId = new Map();
  const productIdsBySeedId = new Map();
  const boardIds = new Map();
  const columnIds = new Map();
  const queries = [];

  for (const employee of initialData.equipe) {
    const id = randomUUID();
    employeeIdsByName.set(employee.nome, id);
    queries.push(
      sql.query(
        `INSERT INTO employees (
          id, shop_id, name, role_title, commission_percent, sessions_count, revenue_total,
          avatar_label, color_hex, phone, email, hire_date, specialties, work_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)`,
        [
          id,
          shopId,
          employee.nome,
          employee.cargo,
          employee.comissao,
          employee.sessoes,
          employee.faturamento,
          employee.avatar,
          employee.cor,
          employee.telefone,
          employee.email,
          employee.admissao || null,
          JSON.stringify(employee.especialidades || []),
          employee.dias,
        ],
      ),
    );
  }

  for (const customer of initialData.clientes) {
    const id = randomUUID();
    customerIdsByName.set(customer.nome, id);
    queries.push(
      sql.query(
        `INSERT INTO customers (
          id, shop_id, name, phone, visit_count, total_spend, avatar_label, instagram,
          email, birth_date, last_visit_at, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          shopId,
          customer.nome,
          customer.telefone,
          customer.visitas,
          customer.gasto,
          customer.avatar,
          customer.instagram,
          customer.email,
          customer.nascimento || null,
          customer.ultimaVisita || null,
          customer.observacoes || "",
        ],
      ),
    );
  }

  for (const appointment of initialData.agenda) {
    const appointmentId = randomUUID();
    appointmentIdsBySeedId.set(appointment.id, appointmentId);
    queries.push(
      sql.query(
        `INSERT INTO appointments (
          id, shop_id, customer_id, employee_id, customer_name, service_name,
          scheduled_date, scheduled_time, duration_minutes, amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          appointmentId,
          shopId,
          customerIdsByName.get(appointment.cliente) || null,
          employeeIdsByName.get(appointment.barbeiro) || null,
          appointment.cliente,
          appointment.servico,
          appointment.data,
          appointment.hora,
          appointment.dur,
          appointment.valor,
          appointment.status,
        ],
      ),
    );
  }

  for (const product of initialData.estoque) {
    const productId = randomUUID();
    productIdsBySeedId.set(product.id, productId);
    queries.push(
      sql.query(
        `INSERT INTO products (
          id, shop_id, name, category, quantity, minimum_quantity, unit_price, brand
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          productId,
          shopId,
          product.produto,
          product.categoria,
          product.quantidade,
          product.minimo,
          product.preco,
          product.marca,
        ],
      ),
    );
  }

  for (const entry of initialData.financeiro) {
    const appointmentId =
      entry.origem === "appointment" ? appointmentIdsBySeedId.get(entry.referenciaId) || null : null;
    queries.push(
      sql.query(
        `INSERT INTO financial_entries (
          id, shop_id, entry_type, description, category, amount, entry_date, appointment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          shopId,
          entry.tipo,
          entry.descricao,
          entry.categoria,
          entry.valor,
          entry.data,
          appointmentId,
        ],
      ),
    );
  }

  for (const movement of initialData.movimentacoesEstoque || []) {
    const movementId = randomUUID();
    const productId = productIdsBySeedId.get(movement.produtoId);
    if (!productId) {
      continue;
    }

    queries.push(
      sql.query(
        `INSERT INTO inventory_movements (
          id, shop_id, product_id, movement_type, quantity_change,
          movement_date, unit_cost, total_amount, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          movementId,
          shopId,
          productId,
          movement.tipo,
          movement.quantidade,
          movement.data,
          movement.custoUnitario || 0,
          movement.total || 0,
          movement.observacao || "",
        ],
      ),
    );
  }

  initialData.serie.forEach((snapshot, index) => {
    const monthKey = snapshot.monthKey || `seed_${index}`;
    queries.push(
      sql.query(
        `INSERT INTO monthly_snapshots (
          id, shop_id, month_key, month_label, revenue, expenses
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), shopId, monthKey, snapshot.mes, snapshot.faturamento, snapshot.despesas],
      ),
    );
  });

  queries.push(
    sql.query(
      `INSERT INTO goals (id, shop_id, month_key, revenue_target, current_value)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        shopId,
        initialData.metas.monthKey || "seed_current",
        initialData.metas.faturamento,
        initialData.metas.atual,
      ],
    ),
  );

  initialData.boards.forEach((board, boardIndex) => {
    const boardId = randomUUID();
    boardIds.set(board.id, boardId);
    queries.push(
      sql.query(
        "INSERT INTO boards (id, shop_id, name, color_hex, position) VALUES ($1, $2, $3, $4, $5)",
        [boardId, shopId, board.nome, board.cor, boardIndex],
      ),
    );

    board.cols.forEach((column, columnIndex) => {
      const columnId = randomUUID();
      columnIds.set(column.id, columnId);
      queries.push(
        sql.query(
          "INSERT INTO board_columns (id, board_id, name, color_hex, position) VALUES ($1, $2, $3, $4, $5)",
          [columnId, boardId, column.nome, column.cor, columnIndex],
        ),
      );

      column.cards.forEach((card, cardIndex) => {
        const cardId = randomUUID();
        queries.push(
          sql.query(
            `INSERT INTO board_cards (
              id, column_id, title, priority, responsible_employee_id, due_date,
              auto_generated, position, product_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              cardId,
              columnId,
              card.titulo,
              card.prioridade,
              employeeIdsByName.get(
                initialData.equipe.find((employee) => employee.id === card.responsavelId)?.nome,
              ) || null,
              card.due || null,
              Boolean(card.auto),
              cardIndex,
              card.produtoId ? productIdsBySeedId.get(card.produtoId) || null : null,
            ],
          ),
        );

        (card.checks || []).forEach((check, checkIndex) => {
          queries.push(
            sql.query(
              "INSERT INTO card_checklists (id, card_id, text_value, done, position) VALUES ($1, $2, $3, $4, $5)",
              [randomUUID(), cardId, check.texto, Boolean(check.done), checkIndex],
            ),
          );
        });

        (card.comentarios || []).forEach((comment) => {
          queries.push(
            sql.query(
              "INSERT INTO card_comments (id, card_id, author_name, comment_text) VALUES ($1, $2, $3, $4)",
              [randomUUID(), cardId, comment.autor, comment.texto],
            ),
          );
        });
      });
    });
  });

  initialData.comunicados.forEach((announcement, index) => {
    queries.push(
      sql.query(
        `INSERT INTO announcements (id, shop_id, author_name, title, body, published_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - ($6 || ' hours')::interval)`,
        [randomUUID(), shopId, announcement.autor, announcement.titulo, announcement.texto, String(index * 24)],
      ),
    );
  });

  Object.entries(initialData.checklists).forEach(([periodKey, items]) => {
    items.forEach((item, index) => {
      queries.push(
        sql.query(
          `INSERT INTO routine_checklist_items (id, shop_id, period_key, text_value, done, position)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), shopId, periodKey, item.texto, Boolean(item.done), index],
        ),
      );
    });
  });

  initialData.notifs.forEach((notification, index) => {
    queries.push(
      sql.query(
        `INSERT INTO notifications (
          id, shop_id, category, icon, color_hex, title, description, read_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - ($9 || ' hours')::interval)`,
        [
          randomUUID(),
          shopId,
          notification.cat,
          notification.ico,
          notification.cor,
          notification.titulo,
          notification.descricao,
          notification.unread ? null : new Date().toISOString(),
          String(index * 3),
        ],
      ),
    );
  });

  return queries;
}
