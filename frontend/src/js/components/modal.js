import { escapeHtml } from '../utils/format.js';

let activeDialog;
let previousFocus;

export function closeModal() {
  if (!activeDialog) return;
  activeDialog.close();
  activeDialog.remove();
  activeDialog = null;
  previousFocus?.focus();
}

export function openModal({
  title,
  content,
  submitLabel = 'Salvar',
  onSubmit,
  size = 'medium',
  danger = false,
}) {
  closeModal();
  previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = `modal modal-${size}`;
  dialog.innerHTML = `
    <form method="dialog" class="modal-card" data-modal-form>
      <header class="modal-header">
        <div><p class="eyebrow">Constantino's Hotel</p><h2>${escapeHtml(title)}</h2></div>
        <button class="icon-button" type="button" data-close aria-label="Fechar">×</button>
      </header>
      <div class="modal-body">${content}<div class="form-error" role="alert" hidden></div></div>
      <footer class="modal-footer">
        <button class="button button-secondary" type="button" data-close>Cancelar</button>
        <button class="button ${danger ? 'button-danger' : 'button-primary'}" type="submit">${escapeHtml(submitLabel)}</button>
      </footer>
    </form>`;
  document.querySelector('#modal-root').append(dialog);
  activeDialog = dialog;
  dialog
    .querySelectorAll('[data-close]')
    .forEach((button) => button.addEventListener('click', closeModal));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeModal();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeModal();
  });
  const form = dialog.querySelector('[data-modal-form]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!onSubmit) return closeModal();
    const submitButton = form.querySelector('[type="submit"]');
    const errorBox = form.querySelector('.form-error');
    submitButton.disabled = true;
    submitButton.dataset.originalLabel = submitButton.textContent;
    submitButton.textContent = 'Processando…';
    errorBox.hidden = true;
    try {
      const shouldClose = await onSubmit(new FormData(form), form);
      if (shouldClose !== false) closeModal();
    } catch (error) {
      errorBox.textContent = `${error.message}${error.requestId ? ` · protocolo ${error.requestId}` : ''}`;
      errorBox.hidden = false;
    } finally {
      if (document.contains(submitButton)) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalLabel;
      }
    }
  });
  dialog.showModal();
  window.setTimeout(() => dialog.querySelector('input, select, textarea, button')?.focus(), 0);
  return dialog;
}

export function confirmAction({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const dialog = openModal({
      title,
      content: `<p>${escapeHtml(message)}</p>`,
      submitLabel: confirmLabel,
      danger,
      onSubmit: async () => {
        resolve(true);
        return true;
      },
    });
    dialog.querySelectorAll('[data-close]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          resolve(false);
        },
        { once: true },
      ),
    );
    dialog.addEventListener('cancel', () => resolve(false), { once: true });
  });
}
