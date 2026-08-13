import { Router } from 'express';
import { requireAuthentication, requireCsrf } from '../../middlewares/auth.js';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { authRouter } from './auth.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { financeRouter } from './finance.routes.js';
import { guestsRouter } from './guests.routes.js';
import { housekeepingRouter } from './housekeeping.routes.js';
import { reportsRouter } from './reports.routes.js';
import { reservationsRouter } from './reservations.routes.js';
import { roomsRouter } from './rooms.routes.js';
import { staysRouter } from './stays.routes.js';
import { chargesRouter, paymentsRouter } from './transactions.routes.js';
import { auditRouter, usersRouter } from './users.routes.js';

export const apiV1Router = Router();
const mutationRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  code: 'MUTATION_RATE_LIMITED',
});

apiV1Router.use('/auth', authRouter);
apiV1Router.use(requireAuthentication);
apiV1Router.use((request, response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
  return mutationRateLimit(request, response, (rateLimitError) => {
    if (rateLimitError) return next(rateLimitError);
    return requireCsrf(request, response, next);
  });
});
apiV1Router.use('/dashboard', dashboardRouter);
apiV1Router.use('/guests', guestsRouter);
apiV1Router.use('/rooms', roomsRouter);
apiV1Router.use('/reservations', reservationsRouter);
apiV1Router.use('/stays', staysRouter);
apiV1Router.use('/housekeeping', housekeepingRouter);
apiV1Router.use('/charges', chargesRouter);
apiV1Router.use('/payments', paymentsRouter);
apiV1Router.use('/finance', financeRouter);
apiV1Router.use('/reports', reportsRouter);
apiV1Router.use('/users', usersRouter);
apiV1Router.use('/audit', auditRouter);
