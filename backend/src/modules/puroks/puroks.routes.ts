import { Router } from 'express';
import { auditContext } from '../../lib/audit';
import {
  requirePermission,
  requireUser,
} from '../../middleware/auth';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate';
import { PERMISSIONS } from '../../security/permissions';
import {
  changePurokStatus,
  createPurok,
  getPurok,
  listPuroks,
  updatePurok,
} from './puroks.service';
import {
  createPurokSchema,
  purokListQuerySchema,
  purokParamsSchema,
  purokStatusSchema,
  updatePurokSchema,
} from './puroks.schemas';
import type {
  CreatePurokInput,
  PurokListQuery,
  PurokStatusInput,
  UpdatePurokInput,
} from './puroks.schemas';

export const puroksRouter = Router();

puroksRouter.get(
  '/',
  requirePermission(PERMISSIONS.PUROKS_READ),
  validateQuery(purokListQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as PurokListQuery;
    res.json(await listPuroks(query));
  },
);

puroksRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.PUROKS_READ),
  validateParams(purokParamsSchema),
  async (req, res) => {
    res.json(await getPurok(String(req.params.id)));
  },
);

puroksRouter.post(
  '/',
  requirePermission(PERMISSIONS.PUROKS_WRITE),
  validateBody(createPurokSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CreatePurokInput;
    res.status(201).json(await createPurok(input, user, auditContext(req)));
  },
);

puroksRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.PUROKS_WRITE),
  validateParams(purokParamsSchema),
  validateBody(updatePurokSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as UpdatePurokInput;
    res.json(
      await updatePurok(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

puroksRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.PUROKS_WRITE),
  validateParams(purokParamsSchema),
  validateBody(purokStatusSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as PurokStatusInput;
    res.json(
      await changePurokStatus(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);
