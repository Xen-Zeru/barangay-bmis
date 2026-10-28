import { Router } from 'express';
import { requireAuth, requireUser } from '../../middleware/auth';
import { buildDashboard } from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, async (req, res) => {
  const user = requireUser(req);
  res.json(await buildDashboard(user));
});
