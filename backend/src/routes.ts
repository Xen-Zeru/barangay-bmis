import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { healthRouter } from './modules/health/health.routes';
import { householdsRouter } from './modules/households/households.routes';
import { puroksRouter } from './modules/puroks/puroks.routes';
import { residentsRouter } from './modules/residents/residents.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/residents', residentsRouter);
apiRouter.use('/puroks', puroksRouter);
apiRouter.use('/households', householdsRouter);
