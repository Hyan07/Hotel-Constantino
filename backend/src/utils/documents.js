import { AppError } from './app-error.js';

export function normalizeDocument(value) {
  return value
    ? String(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]/gu, '')
    : null;
}

export function isValidCpf(value) {
  const digits = normalizeDocument(value);
  if (!digits || !/^\d{11}$/u.test(digits) || /^(\d)\1{10}$/u.test(digits)) return false;

  const calculateDigit = (length) => {
    const sum = digits
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
}

export function validateDocument(type, value) {
  const normalized = normalizeDocument(value);
  if (!type && !normalized) return null;
  if (!type || !normalized) {
    throw new AppError('Informe o tipo e o número do documento.', {
      statusCode: 422,
      code: 'INVALID_DOCUMENT',
    });
  }
  if (type === 'cpf' && !isValidCpf(normalized)) {
    throw new AppError('CPF inválido.', { statusCode: 422, code: 'INVALID_DOCUMENT' });
  }
  if (type !== 'cpf' && (normalized.length < 5 || normalized.length > 40)) {
    throw new AppError('Documento inválido.', { statusCode: 422, code: 'INVALID_DOCUMENT' });
  }
  return normalized;
}
