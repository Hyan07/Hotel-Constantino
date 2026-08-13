import { AppError } from './app-error.js';

export const hotelTimeZone = 'America/Sao_Paulo';

export function dateToDayNumber(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value ?? '');
  if (!match)
    throw new AppError('Data hoteleira inválida.', { statusCode: 422, code: 'INVALID_DATE' });
  const dayNumber = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
  const reconstructed = new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
  if (reconstructed !== value) {
    throw new AppError('Data hoteleira inválida.', { statusCode: 422, code: 'INVALID_DATE' });
  }
  return dayNumber;
}

export function nightsBetween(checkInDate, checkOutDate) {
  const nights = dateToDayNumber(checkOutDate) - dateToDayNumber(checkInDate);
  if (nights < 1 || nights > 365) {
    throw new AppError('A reserva deve ter entre 1 e 365 diárias.', {
      statusCode: 422,
      code: 'INVALID_DATE_RANGE',
    });
  }
  return nights;
}

export function intervalsOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && firstEnd > secondStart;
}

export function todayAtHotel() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: hotelTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
