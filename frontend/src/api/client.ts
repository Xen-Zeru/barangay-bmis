import type {
  CorrectionListResponse,
  CorrectionStatus,
  CorrectionSummary,
  DashboardResponse,
  DuplicateReviewDetail,
  DuplicateReviewListResponse,
  DuplicateReviewStatus,
  DuplicateReviewSummary,
  HouseholdDetail,
  HouseholdHistoryResponse,
  HouseholdListResponse,
  HouseholdStatus,
  LoginResponse,
  MeResponse,
  MembershipEndReason,
  Purok,
  PurokListResponse,
  PurokStatus,
  RecordSource,
  ResidencyStatus,
  ResidentDetail,
  ResidentDraft,
  ResidentHistoryResponse,
  ResidentListResponse,
  ResidentLookup,
  Sex,
  VerificationStatus,
} from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let csrfToken: string | null = null;

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!SAFE_METHODS.has(method) && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope = payload as ErrorEnvelope | null;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'REQUEST_FAILED',
      envelope?.error?.message ?? 'The request could not be completed.',
      envelope?.error?.details,
    );
  }

  return payload as T;
}

export async function ensureCsrfToken(force = false): Promise<string> {
  if (!force && csrfToken) {
    return csrfToken;
  }

  const data = await request<{ csrfToken: string }>('/api/auth/csrf');
  csrfToken = data.csrfToken;
  return data.csrfToken;
}

export const api = {
  async login(username: string, password: string): Promise<LoginResponse> {
    await ensureCsrfToken();
    const data = await request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    csrfToken = data.csrfToken;
    return data;
  },

  async logout(): Promise<void> {
    await ensureCsrfToken();
    await request<void>('/api/auth/logout', { method: 'POST' });
    csrfToken = null;
  },

  me(): Promise<MeResponse> {
    return request<MeResponse>('/api/auth/me');
  },

  dashboard(): Promise<DashboardResponse> {
    return request<DashboardResponse>('/api/dashboard');
  },
};


export interface ResidentListParams {
  q?: string;
  status?: ResidencyStatus;
  verificationStatus?: VerificationStatus;
  sex?: Sex;
  source?: RecordSource;
  sort?: 'name_asc' | 'name_desc' | 'residentNumber_asc' | 'createdAt_desc' | 'updatedAt_desc';
  page?: number;
  pageSize?: number;
}

export type ResidentInput = ResidentDraft;

export interface ResidentUpdateInput {
  version: number;
  duplicateReason?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
  birthDate?: string;
  sex?: Sex;
  contactNumber?: string | null;
  recordSource?: RecordSource;
  sourceReference?: string | null;
  sourceReferenceUnavailableReason?: string | null;
}

function withQuery(path: string, params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}


export interface PurokListParams {
  q?: string;
  status?: PurokStatus;
  sort?: 'name_asc' | 'name_desc' | 'updatedAt_desc';
  page?: number;
  pageSize?: number;
}

export interface PurokInput {
  code: string;
  name: string;
}

export interface PurokUpdateInput {
  code?: string;
  name?: string;
  version: number;
}

export interface HouseholdListParams {
  q?: string;
  purokId?: string;
  status?: HouseholdStatus;
  verificationStatus?: VerificationStatus;
  sort?: 'householdNumber_asc' | 'householdNumber_desc' | 'updatedAt_desc';
  page?: number;
  pageSize?: number;
}

export interface HouseholdCreateInput {
  purokId: string;
  addressLine: string;
  landmark?: string | null;
  headResidentId?: string;
}

export interface HouseholdUpdateInput {
  purokId?: string;
  addressLine?: string;
  landmark?: string | null;
  version: number;
}

export interface HouseholdStatusInput {
  status: HouseholdStatus;
  reason: string;
  version: number;
}

export interface HouseholdMemberInput {
  residentId: string;
  relationship?: string | null;
}

export interface HouseholdMemberEndInput {
  reason: MembershipEndReason;
  note?: string | null;
  version: number;
}

export interface HouseholdMemberTransferInput {
  targetHouseholdId: string;
  relationship?: string | null;
  reason: string;
  version: number;
}

export const puroksApi = {
  list(params: PurokListParams = {}): Promise<PurokListResponse> {
    return request<PurokListResponse>(withQuery('/api/puroks', params));
  },

  get(id: string): Promise<Purok> {
    return request<Purok>(`/api/puroks/${id}`);
  },

  create(input: PurokInput): Promise<Purok> {
    return request<Purok>('/api/puroks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(id: string, input: PurokUpdateInput): Promise<Purok> {
    return request<Purok>(`/api/puroks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  changeStatus(
    id: string,
    input: { status: PurokStatus; reason: string; version: number },
  ): Promise<Purok> {
    return request<Purok>(`/api/puroks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
};

export const householdsApi = {
  list(params: HouseholdListParams = {}): Promise<HouseholdListResponse> {
    return request<HouseholdListResponse>(withQuery('/api/households', params));
  },

  get(id: string): Promise<HouseholdDetail> {
    return request<HouseholdDetail>(`/api/households/${id}`);
  },

  history(
    id: string,
    params: { page?: number; pageSize?: number } = {},
  ): Promise<HouseholdHistoryResponse> {
    return request<HouseholdHistoryResponse>(
      withQuery(`/api/households/${id}/history`, params),
    );
  },

  create(input: HouseholdCreateInput): Promise<HouseholdDetail> {
    return request<HouseholdDetail>('/api/households', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(id: string, input: HouseholdUpdateInput): Promise<HouseholdDetail> {
    return request<HouseholdDetail>(`/api/households/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  changeStatus(
    id: string,
    input: HouseholdStatusInput,
  ): Promise<HouseholdDetail> {
    return request<HouseholdDetail>(`/api/households/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  verify(id: string, input: { version: number }): Promise<HouseholdDetail> {
    return request<HouseholdDetail>(`/api/households/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  changeHead(
    id: string,
    input: { residentId: string; reason: string; version: number },
  ): Promise<HouseholdDetail> {
    return request<HouseholdDetail>(`/api/households/${id}/head`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  addMember(
    id: string,
    input: HouseholdMemberInput,
  ): Promise<HouseholdDetail> {
    return request<HouseholdDetail>(`/api/households/${id}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  endMember(
    householdId: string,
    membershipId: string,
    input: HouseholdMemberEndInput,
  ): Promise<HouseholdDetail> {
    return request<HouseholdDetail>(
      `/api/households/${householdId}/members/${membershipId}/end`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  transferMember(
    householdId: string,
    membershipId: string,
    input: HouseholdMemberTransferInput,
  ): Promise<HouseholdDetail> {
    return request<HouseholdDetail>(
      `/api/households/${householdId}/members/${membershipId}/transfer`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },
};

export const residentsApi = {
  list(params: ResidentListParams = {}): Promise<ResidentListResponse> {
    return request<ResidentListResponse>(withQuery('/api/residents', params));
  },

  lookup(query: string, limit = 10): Promise<ResidentLookup[]> {
    return request<ResidentLookup[]>(
      withQuery('/api/residents/lookup', { q: query, limit }),
    );
  },

  get(id: string): Promise<ResidentDetail> {
    return request<ResidentDetail>(`/api/residents/${id}`);
  },

  create(input: ResidentInput): Promise<ResidentDetail> {
    return request<ResidentDetail>('/api/residents', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(id: string, input: ResidentUpdateInput): Promise<ResidentDetail> {
    return request<ResidentDetail>(`/api/residents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  changeStatus(
    id: string,
    input: { status: ResidencyStatus; reason: string; version: number },
  ): Promise<ResidentDetail> {
    return request<ResidentDetail>(`/api/residents/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  verify(id: string, input: { version: number }): Promise<ResidentDetail> {
    return request<ResidentDetail>(`/api/residents/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  history(
    id: string,
    params: { page?: number; pageSize?: number } = {},
  ): Promise<ResidentHistoryResponse> {
    return request<ResidentHistoryResponse>(
      withQuery(`/api/residents/${id}/history`, params),
    );
  },

  createDuplicateReview(
    input: ResidentInput & { reason: string },
  ): Promise<DuplicateReviewSummary> {
    return request<DuplicateReviewSummary>('/api/residents/duplicate-reviews', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  duplicateReviews(
    params: { status?: DuplicateReviewStatus; page?: number; pageSize?: number } = {},
  ): Promise<DuplicateReviewListResponse> {
    return request<DuplicateReviewListResponse>(
      withQuery('/api/residents/duplicate-reviews', params),
    );
  },

  duplicateReview(id: string): Promise<DuplicateReviewDetail> {
    return request<DuplicateReviewDetail>(
      `/api/residents/duplicate-reviews/${id}`,
    );
  },

  approveDuplicate(
    id: string,
    input: { note: string; version: number },
  ): Promise<ResidentDetail> {
    return request<ResidentDetail>(
      `/api/residents/duplicate-reviews/${id}/approve`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  rejectDuplicate(
    id: string,
    input: { note: string; version: number },
  ): Promise<DuplicateReviewSummary> {
    return request<DuplicateReviewSummary>(
      `/api/residents/duplicate-reviews/${id}/reject`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  cancelDuplicate(
    id: string,
    input: { note?: string },
  ): Promise<DuplicateReviewSummary> {
    return request<DuplicateReviewSummary>(
      `/api/residents/duplicate-reviews/${id}/cancel`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  requestCorrection(
    residentId: string,
    input: { toStatus: ResidencyStatus; reason: string; evidenceReference: string },
  ): Promise<CorrectionSummary> {
    return request<CorrectionSummary>(
      `/api/residents/${residentId}/corrections`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  corrections(
    params: { status?: CorrectionStatus; page?: number; pageSize?: number } = {},
  ): Promise<CorrectionListResponse> {
    return request<CorrectionListResponse>(
      withQuery('/api/residents/corrections', params),
    );
  },

  correction(id: string): Promise<CorrectionSummary> {
    return request<CorrectionSummary>(`/api/residents/corrections/${id}`);
  },

  approveCorrection(
    id: string,
    input: { note: string; version: number },
  ): Promise<ResidentDetail> {
    return request<ResidentDetail>(`/api/residents/corrections/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  rejectCorrection(
    id: string,
    input: { note: string; version: number },
  ): Promise<CorrectionSummary> {
    return request<CorrectionSummary>(`/api/residents/corrections/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  cancelCorrection(
    id: string,
    input: { note?: string },
  ): Promise<CorrectionSummary> {
    return request<CorrectionSummary>(`/api/residents/corrections/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
