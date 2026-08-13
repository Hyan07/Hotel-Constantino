import { z } from 'zod';

const optionalText = (maximum) => z.string().trim().max(maximum).nullable().optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use o formato AAAA-MM-DD.');
const money = z.coerce.number().int().min(0).max(1_000_000_000);
const pagination = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
};

export const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const guestInputSchema = z.object({
  fullName: z.string().trim().min(3).max(180),
  documentType: z.enum(['cpf', 'passport', 'other']).nullable().optional(),
  documentNumber: optionalText(40),
  birthDate: date.nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: optionalText(32),
  city: optionalText(120),
  stateCode: z.string().trim().length(2).nullable().optional(),
  countryCode: z.string().trim().length(2).optional(),
  notes: optionalText(1000),
});
export const guestUpdateSchema = guestInputSchema.partial().extend({
  version: z.coerce.number().int().positive(),
});
export const guestListSchema = z.object({
  ...pagination,
  search: z.string().trim().max(120).optional(),
});

const roomFields = {
  category: z.string().trim().min(2).max(80),
  floor: z.coerce.number().int().min(-5).max(200),
  capacity: z.coerce.number().int().min(1).max(20),
  baseRateCents: money.min(1),
  amenities: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  notes: optionalText(1000),
};
export const roomCreateSchema = z.object({
  roomNumber: z.string().trim().min(1).max(20),
  ...roomFields,
});
export const roomUpdateSchema = z.object({
  ...roomFields,
  version: z.coerce.number().int().positive(),
});
export const roomStatusSchema = z.object({
  status: z.enum(['disponivel', 'bloqueado', 'manutencao', 'aguardando_limpeza', 'em_limpeza']),
  reason: optionalText(500),
  version: z.coerce.number().int().positive(),
});
export const roomListSchema = z.object({
  ...pagination,
  status: z
    .enum(['disponivel', 'ocupado', 'aguardando_limpeza', 'em_limpeza', 'manutencao', 'bloqueado'])
    .optional(),
  category: z.string().trim().max(80).optional(),
});

const reservationFields = {
  roomId: z.coerce.number().int().positive(),
  checkInDate: date,
  checkOutDate: date,
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(20),
  discountCents: money.optional(),
  source: optionalText(80),
  notes: optionalText(1000),
};
export const reservationCreateSchema = z.object({
  primaryGuestId: z.coerce.number().int().positive(),
  guestIds: z.array(z.coerce.number().int().positive()).max(20).optional(),
  ...reservationFields,
});
export const reservationUpdateSchema = z.object({
  ...reservationFields,
  version: z.coerce.number().int().positive(),
});
export const reservationActionSchema = z.object({
  version: z.coerce.number().int().positive(),
  reason: optionalText(500),
});
export const reservationListSchema = z.object({
  ...pagination,
  status: z
    .enum(['pendente', 'confirmada', 'hospedada', 'concluida', 'cancelada', 'no_show'])
    .optional(),
  roomId: z.coerce.number().int().positive().optional(),
  from: date.optional(),
  to: date.optional(),
  search: z.string().trim().max(120).optional(),
});

export const stayListSchema = z.object({
  ...pagination,
  status: z.enum(['ativa', 'concluida']).optional(),
});
export const stayActionSchema = z.object({
  version: z.coerce.number().int().positive(),
  notes: optionalText(1000),
});
export const chargeCreateSchema = z.object({
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(255),
  quantity: z.coerce.number().int().min(1).max(1000),
  unitAmountCents: money.min(1),
  version: z.coerce.number().int().positive(),
});
export const paymentCreateSchema = z.object({
  amountCents: money.min(1),
  method: z.enum(['dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'outro']),
  reference: optionalText(120),
  version: z.coerce.number().int().positive(),
});
export const transactionListSchema = z.object({
  ...pagination,
  stayId: z.coerce.number().int().positive().optional(),
});

export const housekeepingCreateSchema = z.object({
  roomId: z.coerce.number().int().positive(),
  taskType: z.enum(['limpeza', 'manutencao']),
  priority: z.enum(['baixa', 'normal', 'alta', 'urgente']).optional(),
  notes: optionalText(1000),
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
});
export const housekeepingActionSchema = z.object({
  version: z.coerce.number().int().positive(),
  notes: optionalText(1000),
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
});
export const housekeepingListSchema = z.object({
  ...pagination,
  status: z.enum(['pendente', 'em_andamento', 'concluida', 'cancelada']).optional(),
  taskType: z.enum(['limpeza', 'manutencao']).optional(),
});

export const financeCreateSchema = z.object({
  direction: z.enum(['entrada', 'saida']),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(255),
  amountCents: money.min(1),
  occurredOn: date,
});
export const financeReverseSchema = z.object({
  version: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
export const financeListSchema = z.object({
  ...pagination,
  from: date.optional(),
  to: date.optional(),
  direction: z.enum(['entrada', 'saida']).optional(),
  status: z.enum(['lancado', 'estornado']).optional(),
});
export const reportSchema = z.object({ from: date, to: date });

export const userCreateSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  roleCodes: z.array(z.enum(['administrador', 'funcionario'])).min(1),
});
export const userUpdateSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  password: z.string().min(12).max(128).optional(),
  status: z.enum(['active', 'inactive', 'locked']),
  roleCodes: z.array(z.enum(['administrador', 'funcionario'])).min(1),
  version: z.coerce.number().int().positive(),
});
export const auditListSchema = z.object({
  ...pagination,
  entityType: z.string().trim().max(80).optional(),
  action: z.string().trim().max(100).optional(),
});
export const paginationSchema = z.object(pagination);
