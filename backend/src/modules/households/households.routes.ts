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
  addHouseholdMember,
  changeHouseholdHead,
  changeHouseholdStatus,
  createHousehold,
  endHouseholdMember,
  getHousehold,
  getHouseholdHistory,
  listHouseholds,
  transferHouseholdMember,
  updateHousehold,
  verifyHousehold,
} from './households.service';
import {
  addHouseholdMemberSchema,
  changeHouseholdHeadSchema,
  createHouseholdSchema,
  endHouseholdMemberSchema,
  householdHistoryQuerySchema,
  householdListQuerySchema,
  householdMemberParamsSchema,
  householdStatusSchema,
  householdParamsSchema,
  transferHouseholdMemberSchema,
  updateHouseholdSchema,
  verifyHouseholdSchema,
} from './households.schemas';
import type {
  AddHouseholdMemberInput,
  ChangeHouseholdHeadInput,
  CreateHouseholdInput,
  EndHouseholdMemberInput,
  HouseholdHistoryQuery,
  HouseholdListQuery,
  HouseholdStatusInput,
  TransferHouseholdMemberInput,
  UpdateHouseholdInput,
  VerifyHouseholdInput,
} from './households.schemas';

export const householdsRouter = Router();

householdsRouter.get(
  '/',
  requirePermission(PERMISSIONS.HOUSEHOLDS_READ),
  validateQuery(householdListQuerySchema),
  async (req, res) => {
    const user = requireUser(req);
    const query = req.query as unknown as HouseholdListQuery;
    res.json(await listHouseholds(query, user));
  },
);

householdsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.HOUSEHOLDS_READ),
  validateParams(householdParamsSchema),
  async (req, res) => {
    const user = requireUser(req);
    res.json(
      await getHousehold(String(req.params.id), user, auditContext(req)),
    );
  },
);

householdsRouter.get(
  '/:id/history',
  requirePermission(PERMISSIONS.HOUSEHOLDS_READ),
  requirePermission(PERMISSIONS.HOUSEHOLDS_HISTORY_READ),
  validateParams(householdParamsSchema),
  validateQuery(householdHistoryQuerySchema),
  async (req, res) => {
    const user = requireUser(req);
    const query = req.query as unknown as HouseholdHistoryQuery;
    res.json(
      await getHouseholdHistory(
        String(req.params.id),
        query,
        user,
        auditContext(req),
      ),
    );
  },
);

householdsRouter.post(
  '/',
  requirePermission(PERMISSIONS.HOUSEHOLDS_WRITE),
  validateBody(createHouseholdSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CreateHouseholdInput;
    res
      .status(201)
      .json(await createHousehold(input, user, auditContext(req)));
  },
);

householdsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.HOUSEHOLDS_WRITE),
  validateParams(householdParamsSchema),
  validateBody(updateHouseholdSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as UpdateHouseholdInput;
    res.json(
      await updateHousehold(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

householdsRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.HOUSEHOLDS_STATUS),
  validateParams(householdParamsSchema),
  validateBody(householdStatusSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as HouseholdStatusInput;
    res.json(
      await changeHouseholdStatus(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

householdsRouter.post(
  '/:id/verify',
  requirePermission(PERMISSIONS.HOUSEHOLDS_VERIFY),
  validateParams(householdParamsSchema),
  validateBody(verifyHouseholdSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as VerifyHouseholdInput;
    res.json(
      await verifyHousehold(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

householdsRouter.patch(
  '/:id/head',
  requirePermission(PERMISSIONS.HOUSEHOLDS_HEAD_CHANGE),
  validateParams(householdParamsSchema),
  validateBody(changeHouseholdHeadSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as ChangeHouseholdHeadInput;
    res.json(
      await changeHouseholdHead(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

householdsRouter.post(
  '/:id/members',
  requirePermission(PERMISSIONS.HOUSEHOLDS_WRITE),
  validateParams(householdParamsSchema),
  validateBody(addHouseholdMemberSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as AddHouseholdMemberInput;
    res.status(201).json(
      await addHouseholdMember(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

householdsRouter.post(
  '/:id/members/:membershipId/end',
  requirePermission(PERMISSIONS.HOUSEHOLDS_WRITE),
  validateParams(householdMemberParamsSchema),
  validateBody(endHouseholdMemberSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as EndHouseholdMemberInput;
    res.json(
      await endHouseholdMember(
        String(req.params.id),
        String(req.params.membershipId),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

householdsRouter.post(
  '/:id/members/:membershipId/transfer',
  requirePermission(PERMISSIONS.HOUSEHOLDS_WRITE),
  validateParams(householdMemberParamsSchema),
  validateBody(transferHouseholdMemberSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as TransferHouseholdMemberInput;
    res.json(
      await transferHouseholdMember(
        String(req.params.id),
        String(req.params.membershipId),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);
