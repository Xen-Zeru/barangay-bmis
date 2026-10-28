import { Router } from 'express';
import { auditContext } from '../../lib/audit';
import {
  requireAuth,
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
  cancelReviewSchema,
  correctionDecisionSchema,
  correctionListQuerySchema,
  correctionParamsSchema,
  correctionRequestSchema,
  createDuplicateReviewSchema,
  createResidentSchema,
  duplicateDecisionSchema,
  duplicateReviewParamsSchema,
  historyQuerySchema,
  idParamsSchema,
  residentListQuerySchema,
  residentLookupQuerySchema,
  reviewListQuerySchema,
  statusChangeSchema,
  updateResidentSchema,
  verifyResidentSchema,
} from './residents.schemas';
import type {
  CancelReviewInput,
  CorrectionDecisionInput,
  CorrectionListQuery,
  CorrectionRequestInput,
  CreateDuplicateReviewInput,
  CreateResidentInput,
  DuplicateDecisionInput,
  HistoryQuery,
  ResidentListQuery,
  ResidentLookupQuery,
  ReviewListQuery,
  StatusChangeInput,
  UpdateResidentInput,
  VerifyResidentInput,
} from './residents.schemas';
import {
  changeResidentStatus,
  createResident,
  getResident,
  getResidentHistory,
  listResidents,
  lookupResidents,
  updateResident,
  verifyResident,
} from './residents.service';
import {
  approveDuplicateReview,
  cancelDuplicateReview,
  createDuplicateReview,
  getDuplicateReview,
  listDuplicateReviews,
  rejectDuplicateReview,
} from './residents.duplicates.service';
import {
  approveCorrection,
  cancelCorrection,
  getCorrection,
  listCorrections,
  rejectCorrection,
  requestCorrection,
} from './residents.corrections.service';

export const residentsRouter = Router();

residentsRouter.get(
  '/lookup',
  requirePermission(PERMISSIONS.RESIDENTS_LOOKUP),
  validateQuery(residentLookupQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as ResidentLookupQuery;
    res.json(await lookupResidents(query));
  },
);

residentsRouter.get(
  '/duplicate-reviews',
  requireAuth,
  validateQuery(reviewListQuerySchema),
  async (req, res) => {
    const user = requireUser(req);
    const query = req.query as unknown as ReviewListQuery;
    res.json(await listDuplicateReviews(query, user));
  },
);

residentsRouter.post(
  '/duplicate-reviews',
  requirePermission(PERMISSIONS.RESIDENTS_WRITE),
  validateBody(createDuplicateReviewSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CreateDuplicateReviewInput;
    res.status(201).json(
      await createDuplicateReview(input, user, auditContext(req)),
    );
  },
);

residentsRouter.get(
  '/duplicate-reviews/:id',
  requireAuth,
  validateParams(duplicateReviewParamsSchema),
  async (req, res) => {
    const user = requireUser(req);
    res.json(
      await getDuplicateReview(
        String(req.params.id),
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.post(
  '/duplicate-reviews/:id/approve',
  requirePermission(PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE),
  validateParams(duplicateReviewParamsSchema),
  validateBody(duplicateDecisionSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as DuplicateDecisionInput;
    res.json(
      await approveDuplicateReview(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.post(
  '/duplicate-reviews/:id/reject',
  requirePermission(PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE),
  validateParams(duplicateReviewParamsSchema),
  validateBody(duplicateDecisionSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as DuplicateDecisionInput;
    res.json(
      await rejectDuplicateReview(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.post(
  '/duplicate-reviews/:id/cancel',
  requirePermission(PERMISSIONS.RESIDENTS_WRITE),
  validateParams(duplicateReviewParamsSchema),
  validateBody(cancelReviewSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CancelReviewInput;
    res.json(
      await cancelDuplicateReview(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.get(
  '/corrections',
  requireAuth,
  validateQuery(correctionListQuerySchema),
  async (req, res) => {
    const user = requireUser(req);
    const query = req.query as unknown as CorrectionListQuery;
    res.json(await listCorrections(query, user));
  },
);

residentsRouter.get(
  '/corrections/:id',
  requireAuth,
  validateParams(correctionParamsSchema),
  async (req, res) => {
    const user = requireUser(req);
    res.json(
      await getCorrection(String(req.params.id), user, auditContext(req)),
    );
  },
);

residentsRouter.post(
  '/corrections/:id/approve',
  requirePermission(PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE),
  validateParams(correctionParamsSchema),
  validateBody(correctionDecisionSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CorrectionDecisionInput;
    res.json(
      await approveCorrection(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.post(
  '/corrections/:id/reject',
  requirePermission(PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE),
  validateParams(correctionParamsSchema),
  validateBody(correctionDecisionSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CorrectionDecisionInput;
    res.json(
      await rejectCorrection(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.post(
  '/corrections/:id/cancel',
  requirePermission(PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST),
  validateParams(correctionParamsSchema),
  validateBody(cancelReviewSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CancelReviewInput;
    res.json(
      await cancelCorrection(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.post(
  '/:id/corrections',
  requirePermission(PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST),
  validateParams(idParamsSchema),
  validateBody(correctionRequestSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CorrectionRequestInput;
    res.status(201).json(
      await requestCorrection(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.get(
  '/:id/history',
  requirePermission(PERMISSIONS.RESIDENTS_READ),
  validateParams(idParamsSchema),
  validateQuery(historyQuerySchema),
  async (req, res) => {
    const user = requireUser(req);
    const query = req.query as unknown as HistoryQuery;
    res.json(
      await getResidentHistory(
        String(req.params.id),
        user,
        query,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.RESIDENTS_WRITE),
  validateParams(idParamsSchema),
  validateBody(statusChangeSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as StatusChangeInput;
    res.json(
      await changeResidentStatus(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.post(
  '/:id/verify',
  requirePermission(PERMISSIONS.RESIDENTS_VERIFY),
  validateParams(idParamsSchema),
  validateBody(verifyResidentSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as VerifyResidentInput;
    res.json(
      await verifyResident(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.RESIDENTS_READ),
  validateParams(idParamsSchema),
  async (req, res) => {
    const user = requireUser(req);
    res.json(await getResident(String(req.params.id), user, auditContext(req)));
  },
);

residentsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.RESIDENTS_WRITE),
  validateParams(idParamsSchema),
  validateBody(updateResidentSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as UpdateResidentInput;
    res.json(
      await updateResident(
        String(req.params.id),
        input,
        user,
        auditContext(req),
      ),
    );
  },
);

residentsRouter.get(
  '/',
  requirePermission(PERMISSIONS.RESIDENTS_READ),
  validateQuery(residentListQuerySchema),
  async (req, res) => {
    const query = req.query as unknown as ResidentListQuery;
    res.json(await listResidents(query));
  },
);

residentsRouter.post(
  '/',
  requirePermission(PERMISSIONS.RESIDENTS_WRITE),
  validateBody(createResidentSchema),
  async (req, res) => {
    const user = requireUser(req);
    const input = req.body as CreateResidentInput;
    res.status(201).json(await createResident(input, user, auditContext(req)));
  },
);
