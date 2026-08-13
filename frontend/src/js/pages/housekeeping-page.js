import { confirmAction, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formField, renderEmpty, renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { hasPermission } from '../store/app-store.js';
import { escapeHtml, formatDateTime, statusBadge } from '../utils/format.js';

async function openTaskModal(container) {
  const { data: rooms } = await hotelApi.rooms({ pageSize: 100 });
  openModal({
    title: 'Nova tarefa de governança',
    content: `<div class="form-grid">
      ${formField({ label: 'Quarto', name: 'roomId', required: true, options: [{ value: '', label: 'Selecione' }, ...rooms.filter((room) => room.status !== 'ocupado').map((room) => ({ value: room.id, label: `${room.roomNumber} · ${room.status.replaceAll('_', ' ')}` }))] })}
      ${formField({
        label: 'Tipo',
        name: 'taskType',
        required: true,
        options: [
          { value: 'manutencao', label: 'Manutenção' },
          { value: 'limpeza', label: 'Limpeza' },
        ],
      })}
      ${formField({
        label: 'Prioridade',
        name: 'priority',
        value: 'normal',
        options: [
          { value: 'baixa', label: 'Baixa' },
          { value: 'normal', label: 'Normal' },
          { value: 'alta', label: 'Alta' },
          { value: 'urgente', label: 'Urgente' },
        ],
      })}
      <label class="form-field form-field-wide"><span>Descrição *</span><textarea name="notes" rows="4" maxlength="1000" required></textarea></label>
    </div>`,
    submitLabel: 'Criar tarefa',
    onSubmit: async (data) => {
      await hotelApi.createHousekeeping({
        roomId: Number(data.get('roomId')),
        taskType: data.get('taskType'),
        priority: data.get('priority'),
        notes: data.get('notes'),
      });
      showToast('Tarefa criada.');
      renderHousekeepingPage(container);
    },
  });
}

async function taskAction(container, task, action) {
  const start = action === 'start';
  const confirmed = await confirmAction({
    title: start ? 'Iniciar tarefa' : 'Concluir tarefa',
    message: start
      ? `Iniciar ${task.taskType === 'limpeza' ? 'a limpeza' : 'a manutenção'} do quarto ${task.roomNumber}?`
      : `Confirmar a conclusão da tarefa do quarto ${task.roomNumber}?`,
    confirmLabel: start ? 'Iniciar' : 'Concluir',
  });
  if (!confirmed) return;
  try {
    await hotelApi.housekeepingAction(task.id, action, { version: task.version });
    showToast(start ? 'Tarefa iniciada.' : 'Tarefa concluída.');
    renderHousekeepingPage(container);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

export async function renderHousekeepingPage(container, status = '') {
  renderLoading(container, 'Carregando limpeza e manutenção…');
  try {
    const response = await hotelApi.housekeeping({ pageSize: 100, status });
    const canWrite = hasPermission('housekeeping.write');
    container.innerHTML = `<section class="page-toolbar surface"><div class="filter-group"><button class="filter-chip ${!status ? 'is-active' : ''}" data-filter="">Todas</button><button class="filter-chip ${status === 'pendente' ? 'is-active' : ''}" data-filter="pendente">Pendentes</button><button class="filter-chip ${status === 'em_andamento' ? 'is-active' : ''}" data-filter="em_andamento">Em andamento</button><button class="filter-chip ${status === 'concluida' ? 'is-active' : ''}" data-filter="concluida">Concluídas</button></div>${canWrite ? '<button class="button button-primary" data-new>+ Nova tarefa</button>' : ''}</section>
      <section class="task-board">${response.data.length ? response.data.map((task) => `<article class="surface task-card priority-${task.priority}"><header><span class="room-number">${escapeHtml(task.roomNumber)}</span>${statusBadge(task.status)}</header><div><p class="eyebrow">${task.taskType === 'limpeza' ? 'Limpeza' : 'Manutenção'} · prioridade ${escapeHtml(task.priority)}</p><h3>${escapeHtml(task.notes ?? 'Sem descrição')}</h3><p>${task.assignedToName ? `Responsável: ${escapeHtml(task.assignedToName)}` : 'Sem responsável definido'}</p>${task.startedAt ? `<small>Iniciada em ${formatDateTime(task.startedAt)}</small>` : ''}</div>${canWrite && ['pendente', 'em_andamento'].includes(task.status) ? `<footer><button class="button ${task.status === 'pendente' ? 'button-secondary' : 'button-primary'}" data-action="${task.status === 'pendente' ? 'start' : 'complete'}" data-id="${task.id}">${task.status === 'pendente' ? 'Iniciar' : 'Concluir'}</button></footer>` : ''}</article>`).join('') : renderEmpty('Nenhuma tarefa corresponde ao filtro atual.')}</section>`;
    container
      .querySelectorAll('[data-filter]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          renderHousekeepingPage(container, button.dataset.filter),
        ),
      );
    container
      .querySelector('[data-new]')
      ?.addEventListener('click', () => openTaskModal(container));
    container.querySelectorAll('[data-action]').forEach((button) =>
      button.addEventListener('click', () => {
        const task = response.data.find((item) => item.id === Number(button.dataset.id));
        taskAction(container, task, button.dataset.action);
      }),
    );
  } catch (error) {
    renderError(container, error, () => renderHousekeepingPage(container, status));
  }
}
