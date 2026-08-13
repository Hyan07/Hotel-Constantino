import { withConnection, withTransaction } from '../db/pool.js';
import { writeAudit } from '../db/repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';

function mapTask(row) {
  return row ? { ...row, version: Number(row.version) } : null;
}

async function taskRow(connection, taskId, lock = false) {
  const [rows] = await connection.execute(
    `SELECT housekeeping_tasks.id, housekeeping_tasks.room_id AS roomId,
            rooms.room_number AS roomNumber, housekeeping_tasks.task_type AS taskType,
            housekeeping_tasks.status, housekeeping_tasks.priority, housekeeping_tasks.notes,
            housekeeping_tasks.assigned_to AS assignedTo, users.full_name AS assignedToName,
            housekeeping_tasks.started_at AS startedAt, housekeeping_tasks.completed_at AS completedAt,
            housekeeping_tasks.version, housekeeping_tasks.created_at AS createdAt,
            housekeeping_tasks.updated_at AS updatedAt
       FROM housekeeping_tasks
       JOIN rooms ON rooms.id = housekeeping_tasks.room_id
       LEFT JOIN users ON users.id = housekeeping_tasks.assigned_to
      WHERE housekeeping_tasks.id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [taskId],
  );
  return mapTask(rows[0]);
}

export async function listHousekeeping(query) {
  const pagination = parsePagination(query);
  const conditions = [];
  const parameters = [];
  if (query.status) {
    conditions.push('housekeeping_tasks.status = ?');
    parameters.push(query.status);
  }
  if (query.taskType) {
    conditions.push('housekeeping_tasks.task_type = ?');
    parameters.push(query.taskType);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM housekeeping_tasks ${where}`,
      parameters,
    );
    const [rows] = await connection.query(
      `SELECT housekeeping_tasks.id, housekeeping_tasks.room_id AS roomId,
              rooms.room_number AS roomNumber, housekeeping_tasks.task_type AS taskType,
              housekeeping_tasks.status, housekeeping_tasks.priority, housekeeping_tasks.notes,
              housekeeping_tasks.assigned_to AS assignedTo, users.full_name AS assignedToName,
              housekeeping_tasks.started_at AS startedAt, housekeeping_tasks.completed_at AS completedAt,
              housekeeping_tasks.version, housekeeping_tasks.created_at AS createdAt,
              housekeeping_tasks.updated_at AS updatedAt
         FROM housekeeping_tasks
         JOIN rooms ON rooms.id = housekeeping_tasks.room_id
         LEFT JOIN users ON users.id = housekeeping_tasks.assigned_to
         ${where}
        ORDER BY FIELD(housekeeping_tasks.status, 'em_andamento', 'pendente', 'concluida', 'cancelada'),
                 FIELD(housekeeping_tasks.priority, 'urgente', 'alta', 'normal', 'baixa'),
                 housekeeping_tasks.created_at
        LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return { data: rows.map(mapTask), meta: paginationMeta(Number(count.total), pagination) };
  });
}

export async function createHousekeepingTask(input, actor) {
  return withTransaction(async (connection) => {
    const [[room]] = await connection.execute(
      'SELECT id, status FROM rooms WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [input.roomId],
    );
    if (!room) throw new AppError('Quarto não encontrado.', { statusCode: 404, code: 'NOT_FOUND' });
    if (room.status === 'ocupado') {
      throw new AppError('Não é possível criar esta tarefa para um quarto ocupado.', {
        statusCode: 409,
        code: 'ROOM_OCCUPIED',
      });
    }
    const [openTasks] = await connection.execute(
      `SELECT id FROM housekeeping_tasks
        WHERE room_id = ? AND task_type = ? AND status IN ('pendente', 'em_andamento') LIMIT 1`,
      [input.roomId, input.taskType],
    );
    if (openTasks[0]) {
      throw new AppError('Já existe uma tarefa aberta deste tipo para o quarto.', {
        statusCode: 409,
        code: 'TASK_ALREADY_OPEN',
      });
    }
    if (input.taskType === 'manutencao' && room.status !== 'manutencao') {
      await connection.execute(
        "UPDATE rooms SET status = 'manutencao', version = version + 1 WHERE id = ?",
        [room.id],
      );
      await connection.execute(
        `INSERT INTO room_status_history (room_id, from_status, to_status, reason, changed_by)
         VALUES (?, ?, 'manutencao', ?, ?)`,
        [room.id, room.status, input.notes ?? 'Tarefa de manutenção', actor.userId],
      );
    }
    const [result] = await connection.execute(
      `INSERT INTO housekeeping_tasks
        (room_id, task_type, status, priority, notes, assigned_to, created_by)
       VALUES (?, ?, 'pendente', ?, ?, ?, ?)`,
      [
        input.roomId,
        input.taskType,
        input.priority ?? 'normal',
        input.notes ?? null,
        input.assignedTo ?? null,
        actor.userId,
      ],
    );
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'housekeeping.created',
      entityType: 'housekeeping_task',
      entityId: result.insertId,
      requestId: actor.requestId,
      context: { roomId: input.roomId },
    });
    return taskRow(connection, result.insertId);
  });
}

export async function startHousekeepingTask(taskId, input, actor) {
  return withTransaction(async (connection) => {
    const task = await taskRow(connection, taskId, true);
    if (!task || task.status !== 'pendente') {
      throw new AppError('A tarefa não está pendente.', {
        statusCode: 409,
        code: 'TASK_NOT_PENDING',
      });
    }
    if (task.version !== input.version) {
      throw new AppError('A tarefa foi alterada por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    const [[room]] = await connection.execute('SELECT status FROM rooms WHERE id = ? FOR UPDATE', [
      task.roomId,
    ]);
    if (task.taskType === 'limpeza' && room.status !== 'aguardando_limpeza') {
      throw new AppError('O quarto não está aguardando limpeza.', {
        statusCode: 409,
        code: 'ROOM_STATE_CONFLICT',
      });
    }
    if (task.taskType === 'manutencao' && room.status !== 'manutencao') {
      throw new AppError('O quarto não está em manutenção.', {
        statusCode: 409,
        code: 'ROOM_STATE_CONFLICT',
      });
    }
    await connection.execute(
      `UPDATE housekeeping_tasks
          SET status = 'em_andamento', assigned_to = COALESCE(?, assigned_to),
              started_at = UTC_TIMESTAMP(3), version = version + 1
        WHERE id = ? AND version = ?`,
      [input.assignedTo ?? actor.userId, taskId, input.version],
    );
    if (task.taskType === 'limpeza') {
      await connection.execute(
        "UPDATE rooms SET status = 'em_limpeza', version = version + 1 WHERE id = ?",
        [task.roomId],
      );
      await connection.execute(
        `INSERT INTO room_status_history (room_id, from_status, to_status, reason, changed_by)
         VALUES (?, 'aguardando_limpeza', 'em_limpeza', 'Início da limpeza', ?)`,
        [task.roomId, actor.userId],
      );
    }
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'housekeeping.started',
      entityType: 'housekeeping_task',
      entityId: taskId,
      requestId: actor.requestId,
      context: { roomId: task.roomId },
    });
    return taskRow(connection, taskId);
  });
}

export async function completeHousekeepingTask(taskId, input, actor) {
  return withTransaction(async (connection) => {
    const task = await taskRow(connection, taskId, true);
    if (!task || task.status !== 'em_andamento') {
      throw new AppError('A tarefa não está em andamento.', {
        statusCode: 409,
        code: 'TASK_NOT_IN_PROGRESS',
      });
    }
    if (task.version !== input.version) {
      throw new AppError('A tarefa foi alterada por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    const [[room]] = await connection.execute('SELECT status FROM rooms WHERE id = ? FOR UPDATE', [
      task.roomId,
    ]);
    const expected = task.taskType === 'limpeza' ? 'em_limpeza' : 'manutencao';
    if (room.status !== expected) {
      throw new AppError('O estado do quarto não corresponde à tarefa.', {
        statusCode: 409,
        code: 'ROOM_STATE_CONFLICT',
      });
    }
    await connection.execute(
      `UPDATE housekeeping_tasks
          SET status = 'concluida', notes = COALESCE(?, notes),
              completed_at = UTC_TIMESTAMP(3), version = version + 1
        WHERE id = ? AND version = ?`,
      [input.notes ?? null, taskId, input.version],
    );
    const targetStatus = task.taskType === 'limpeza' ? 'disponivel' : 'aguardando_limpeza';
    await connection.execute('UPDATE rooms SET status = ?, version = version + 1 WHERE id = ?', [
      targetStatus,
      task.roomId,
    ]);
    await connection.execute(
      `INSERT INTO room_status_history (room_id, from_status, to_status, reason, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [task.roomId, room.status, targetStatus, 'Conclusão da tarefa', actor.userId],
    );
    if (task.taskType === 'manutencao') {
      await connection.execute(
        `INSERT INTO housekeeping_tasks (room_id, task_type, status, priority, notes, created_by)
         VALUES (?, 'limpeza', 'pendente', 'normal', 'Limpeza após manutenção', ?)`,
        [task.roomId, actor.userId],
      );
    }
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'housekeeping.completed',
      entityType: 'housekeeping_task',
      entityId: taskId,
      requestId: actor.requestId,
      context: { roomId: task.roomId, toStatus: targetStatus },
    });
    return taskRow(connection, taskId);
  });
}
