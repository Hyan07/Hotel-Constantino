import { escapeHtml } from '../utils/format.js';

export function renderLoading(container, message = 'Carregando dados…') {
  container.innerHTML = `<div class="state-panel state-loading" role="status"><span class="spinner" aria-hidden="true"></span><p>${escapeHtml(message)}</p></div>`;
}

export function renderEmpty(message, action = '') {
  return `<div class="state-panel"><strong>Nenhum registro encontrado</strong><p>${escapeHtml(message)}</p>${action}</div>`;
}

export function renderError(container, error, retry) {
  container.innerHTML = `<div class="state-panel state-error" role="alert"><strong>Não foi possível carregar</strong><p>${escapeHtml(error.message)}</p>${error.requestId ? `<small>Protocolo ${escapeHtml(error.requestId)}</small>` : ''}<button class="button button-secondary" type="button" data-retry>Tentar novamente</button></div>`;
  container.querySelector('[data-retry]')?.addEventListener('click', retry);
}

export function formField({
  label,
  name,
  type = 'text',
  value = '',
  required = false,
  options,
  min,
  max,
  step,
  placeholder = '',
}) {
  const control = options
    ? `<select id="field-${escapeHtml(name)}" name="${escapeHtml(name)}" ${required ? 'required' : ''}>${options
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`,
        )
        .join('')}</select>`
    : `<input id="field-${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${min != null ? `min="${escapeHtml(min)}"` : ''} ${max != null ? `max="${escapeHtml(max)}"` : ''} ${step != null ? `step="${escapeHtml(step)}"` : ''} placeholder="${escapeHtml(placeholder)}" />`;
  return `<label class="form-field"><span>${escapeHtml(label)}${required ? ' *' : ''}</span>${control}</label>`;
}
