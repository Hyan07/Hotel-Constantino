import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { intervalsOverlap, nightsBetween } from '../src/utils/dates.js';
import { isValidCpf, normalizeDocument } from '../src/utils/documents.js';
import { roomTransitions } from '../src/services/rooms.service.js';

describe('regras de datas e reservas', () => {
  it('calcula diárias sem depender de horário ou fuso', () => {
    assert.equal(nightsBetween('2026-08-13', '2026-08-16'), 3);
  });

  it('considera checkout e próximo check-in no mesmo dia sem sobreposição', () => {
    assert.equal(intervalsOverlap('2026-08-13', '2026-08-15', '2026-08-15', '2026-08-18'), false);
    assert.equal(intervalsOverlap('2026-08-13', '2026-08-16', '2026-08-15', '2026-08-18'), true);
  });
});

describe('documentos', () => {
  it('normaliza pontuação e valida os dígitos do CPF', () => {
    assert.equal(normalizeDocument('111.444.777-35'), '11144477735');
    assert.equal(isValidCpf('111.444.777-35'), true);
    assert.equal(isValidCpf('111.111.111-11'), false);
  });
});

describe('transições de quarto', () => {
  it('obriga a passagem da limpeza antes de voltar a disponível', () => {
    assert.equal(roomTransitions.aguardando_limpeza.has('em_limpeza'), true);
    assert.equal(roomTransitions.aguardando_limpeza.has('disponivel'), false);
    assert.equal(roomTransitions.em_limpeza.has('disponivel'), true);
    assert.equal(roomTransitions.manutencao.has('disponivel'), false);
    assert.equal(roomTransitions.ocupado.size, 0);
  });
});
