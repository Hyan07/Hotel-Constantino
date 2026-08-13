import { escapeHtml } from './format.js';

const drawer = document.querySelector('#drawer');
const drawerTitle = document.querySelector('#drawer-title');
const drawerEyebrow = document.querySelector('#drawer-eyebrow');
const drawerContent = document.querySelector('#drawer-content');
const confirmDialog = document.querySelector('#confirm-dialog');

document.querySelector('#drawer-close').addEventListener('click', () => drawer.close());
drawer.addEventListener('click', (event) => {
  if (event.target === drawer) drawer.close();
});

export function openDrawer({ title, eyebrow = '', content = '', onOpen }) {
  drawerTitle.textContent = title;
  drawerEyebrow.textContent = eyebrow;
  drawerContent.innerHTML = content;
  if (!drawer.open) drawer.showModal();
  requestAnimationFrame(() => {
    const first = drawerContent.querySelector('input, select, textarea, button');
    first?.focus({ preventScroll: true });
    onOpen?.(drawerContent);
  });
  return drawerContent;
}

export function closeDrawer() {
  if (drawer.open) drawer.close();
}

export function setDrawerBusy(busy, text = 'Salvando…') {
  const submit = drawerContent.querySelector('[type="submit"]');
  if (!submit) return;
  if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent;
  submit.disabled = busy;
  submit.innerHTML = busy ? `<span class="spinner"></span>${escapeHtml(text)}` : submit.dataset.originalText;
}

export function confirmAction({ title, message, confirmLabel = 'Confirmar', danger = true }) {
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-message').textContent = message;
  const accept = document.querySelector('#confirm-accept');
  accept.textContent = confirmLabel;
  accept.className = `button ${danger ? 'button--danger' : 'button--primary'}`;

  return new Promise((resolve) => {
    const finish = () => {
      confirmDialog.removeEventListener('close', onClose);
      resolve(confirmDialog.returnValue === 'confirm');
    };
    const onClose = () => finish();
    confirmDialog.addEventListener('close', onClose, { once: true });
    confirmDialog.showModal();
  });
}

export function toast(message, { title = 'Tudo certo', type = 'success', duration = 4200 } = {}) {
  const region = document.querySelector('#toast-region');
  const element = document.createElement('div');
  element.className = `toast ${type === 'error' ? 'toast--error' : ''}`;
  element.innerHTML = `<div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div><button aria-label="Fechar">×</button>`;
  const remove = () => element.remove();
  element.querySelector('button').addEventListener('click', remove);
  region.append(element);
  setTimeout(remove, duration);
}

export function emptyState({ icon = '◇', title, message, actionLabel, actionId }) {
  return `<div class="empty-state"><div><span class="empty-state__icon">${escapeHtml(icon)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${actionLabel ? `<button id="${escapeHtml(actionId)}" class="button button--secondary">${escapeHtml(actionLabel)}</button>` : ''}</div></div>`;
}

export function pageLoading(label = 'Carregando…') {
  return `<div class="page-loading"><span class="spinner"></span>${escapeHtml(label)}</div>`;
}

export function friendlyError(error) {
  const code = error?.code ?? error?.error?.code;
  if (['RESERVATION_OVERLAP', 'MAINTENANCE_OVERLAP'].includes(code)) return 'Este quarto não está disponível no período selecionado.';
  if (['DUPLICATE_RECORD', 'DUPLICATE_EMAIL', 'DUPLICATE_FILE'].includes(code)) return 'Já existe um cadastro com estes dados.';
  if (code === 'FORBIDDEN' || /permission|policy|permissão/i.test(error?.message ?? '')) return 'Você não tem permissão para concluir esta ação.';
  if (code === 'NOT_FOUND') return 'Registro não encontrado.';
  if (code === 'DATABASE_UNAVAILABLE') return 'O banco MySQL está indisponível. Confira a configuração da hospedagem.';
  if (/Failed to fetch|NetworkError/i.test(error?.message ?? '')) return 'Não foi possível conectar ao servidor. Verifique sua internet.';
  return error?.message ?? error?.error?.message ?? 'Não foi possível concluir a operação.';
}

export function setFormError(form, message) {
  let alert = form.querySelector('.form-alert');
  if (!alert) {
    alert = document.createElement('div');
    alert.className = 'alert alert--error form-alert field--full';
    alert.setAttribute('role', 'alert');
    form.prepend(alert);
  }
  alert.textContent = message;
  alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function clearFormError(form) {
  form.querySelector('.form-alert')?.remove();
}
