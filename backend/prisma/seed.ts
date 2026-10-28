import {
  PrismaClient,
  RecordSource,
  ResidencyStatus,
  Sex,
  UserRole,
  UserStatus,
  VerificationStatus,
  PurokStatus,
  HouseholdStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import {
  normalizeNamePart,
  normalizedFullName,
  normalizedNameKey,
  parseBirthDate,
} from '../src/modules/residents/resident-utils';

dotenv.config();

const prisma = new PrismaClient();

interface SeedUser {
  username: string;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
}

const SEED_USERS: SeedUser[] = [
  {
    username: 'sysadmin',
    email: 'sysadmin@barangay2.local',
    firstName: 'Ana',
    middleName: 'Reyes',
    lastName: 'Villanueva',
    role: UserRole.SYSTEM_ADMIN,
    status: UserStatus.ACTIVE,
  },
  {
    username: 'secretary',
    email: 'secretary@barangay2.local',
    firstName: 'Maria',
    middleName: 'Santos',
    lastName: 'Bautista',
    role: UserRole.BARANGAY_SECRETARY,
    status: UserStatus.ACTIVE,
  },
  {
    username: 'encoder',
    email: 'encoder@barangay2.local',
    firstName: 'Jose',
    middleName: 'Reyes',
    lastName: 'Mendoza',
    role: UserRole.BARANGAY_ENCODER,
    status: UserStatus.ACTIVE,
  },
  {
    username: 'captain',
    email: 'captain@barangay2.local',
    firstName: 'Ramon',
    middleName: 'Dela Cruz',
    lastName: 'Aquino',
    role: UserRole.BARANGAY_CAPTAIN,
    status: UserStatus.ACTIVE,
  },
  {
    username: 'inactive.encoder',
    email: 'inactive.encoder@barangay2.local',
    firstName: 'Lucia',
    middleName: 'Mendoza',
    lastName: 'Ramos',
    role: UserRole.BARANGAY_ENCODER,
    status: UserStatus.INACTIVE,
  },
];


interface SeedResident {
  residentNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate: string;
  sex: Sex;
  contactNumber?: string;
  residencyStatus: ResidencyStatus;
  recordSource: RecordSource;
  sourceReference?: string;
  verificationStatus: VerificationStatus;
  createdByUsername: 'secretary' | 'encoder';
}

const SEED_RESIDENTS: SeedResident[] = [
  {
    residentNumber: 'RES-2026-000001',
    firstName: 'Juan',
    middleName: 'Dela Cruz',
    lastName: 'Santos',
    birthDate: '1985-03-14',
    sex: Sex.MALE,
    contactNumber: '09171234567',
    residencyStatus: ResidencyStatus.ACTIVE,
    recordSource: RecordSource.WALK_IN,
    verificationStatus: VerificationStatus.VERIFIED,
    createdByUsername: 'secretary',
  },
  {
    residentNumber: 'RES-2026-000002',
    firstName: 'Maria Clara',
    middleName: 'Reyes',
    lastName: 'Lim',
    birthDate: '1990-07-22',
    sex: Sex.FEMALE,
    contactNumber: '09181234567',
    residencyStatus: ResidencyStatus.ACTIVE,
    recordSource: RecordSource.EXISTING_RECORD,
    sourceReference: 'Barangay masterlist 2024, page 12',
    verificationStatus: VerificationStatus.VERIFIED,
    createdByUsername: 'secretary',
  },
  {
    residentNumber: 'RES-2026-000003',
    firstName: 'Pedro',
    middleName: 'Penduko',
    lastName: 'Garcia',
    birthDate: '1978-11-02',
    sex: Sex.MALE,
    residencyStatus: ResidencyStatus.MOVED_OUT,
    recordSource: RecordSource.IMPORT,
    sourceReference: 'Legacy index card 0045',
    verificationStatus: VerificationStatus.UNVERIFIED,
    createdByUsername: 'encoder',
  },
  {
    residentNumber: 'RES-2026-000004',
    firstName: 'Ana Marie',
    middleName: 'Lopez',
    lastName: 'Cruz',
    birthDate: '2001-01-30',
    sex: Sex.FEMALE,
    contactNumber: '09191234567',
    residencyStatus: ResidencyStatus.INACTIVE,
    recordSource: RecordSource.WALK_IN,
    verificationStatus: VerificationStatus.UNVERIFIED,
    createdByUsername: 'encoder',
  },
  {
    residentNumber: 'RES-2026-000005',
    firstName: 'Jose',
    middleName: 'Rizal',
    lastName: 'Mercado',
    birthDate: '1861-06-19',
    sex: Sex.MALE,
    residencyStatus: ResidencyStatus.DECEASED,
    recordSource: RecordSource.EXISTING_RECORD,
    sourceReference: 'Historical register, volume 1',
    verificationStatus: VerificationStatus.VERIFIED,
    createdByUsername: 'secretary',
  },
  {
    residentNumber: 'RES-2026-000006',
    firstName: 'Lito',
    middleName: 'Bautista',
    lastName: 'Ramos',
    birthDate: '1965-09-09',
    sex: Sex.NOT_RECORDED,
    residencyStatus: ResidencyStatus.ACTIVE,
    recordSource: RecordSource.EXISTING_RECORD,
    sourceReference: 'Undated legacy listing, household 22',
    verificationStatus: VerificationStatus.UNVERIFIED,
    createdByUsername: 'encoder',
  },
];

async function seedResidents(): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      username: { in: ['secretary', 'encoder'] },
    },
    select: { id: true, username: true },
  });
  const userIds = new Map(users.map((user) => [user.username, user.id]));
  const secretaryId = userIds.get('secretary');
  const encoderId = userIds.get('encoder');

  if (!secretaryId || !encoderId) {
    throw new Error('Seed accounts must exist before seeding residents.');
  }

  for (const resident of SEED_RESIDENTS) {
    const createdById =
      resident.createdByUsername === 'secretary' ? secretaryId : encoderId;
    const data = {
      residentNumber: resident.residentNumber,
      firstName: resident.firstName,
      middleName: resident.middleName ?? null,
      lastName: resident.lastName,
      suffix: null,
      nameNormalized: normalizedFullName(resident),
      nameKey: normalizedNameKey(resident),
      birthDate: parseBirthDate(resident.birthDate),
      sex: resident.sex,
      contactNumber: resident.contactNumber ?? null,
      residencyStatus: resident.residencyStatus,
      statusChangedAt: new Date(),
      recordSource: resident.recordSource,
      sourceReference: resident.sourceReference ?? null,
      sourceReferenceUnavailableReason: null,
      verificationStatus: resident.verificationStatus,
      verifiedAt:
        resident.verificationStatus === VerificationStatus.VERIFIED
          ? new Date()
          : null,
      verifiedByUserId:
        resident.verificationStatus === VerificationStatus.VERIFIED
          ? secretaryId
          : null,
      createdByUserId: createdById,
      updatedByUserId: createdById,
    };

    await prisma.resident.upsert({
      where: { residentNumber: resident.residentNumber },
      create: data,
      update: data,
    });
  }

  const year = 2026;
  const sequence = await prisma.residentNumberSequence.findUnique({
    where: { year },
  });
  if (!sequence) {
    await prisma.residentNumberSequence.create({
      data: { year, lastNumber: SEED_RESIDENTS.length },
    });
  } else if (sequence.lastNumber < SEED_RESIDENTS.length) {
    await prisma.residentNumberSequence.update({
      where: { year },
      data: { lastNumber: SEED_RESIDENTS.length },
    });
  }

  console.info(`Seeded ${SEED_RESIDENTS.length} synthetic resident records.`);
}

async function seedPuroksAndHouseholds(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { username: { in: ['secretary', 'encoder'] } },
    select: { id: true, username: true },
  });
  const userIds = new Map(users.map((user) => [user.username, user.id]));
  const secretaryId = userIds.get('secretary');
  const encoderId = userIds.get('encoder');
  if (!secretaryId || !encoderId) {
    throw new Error('Seed accounts must exist before seeding households.');
  }

  const purokDefinitions = [
    { code: 'P-01', name: 'Purok 1' },
    { code: 'P-02', name: 'Purok 2' },
    { code: 'P-03', name: 'Purok 3' },
    { code: 'P-04', name: 'Purok 4' },
  ];
  const puroks = new Map<string, string>();
  for (const purok of purokDefinitions) {
    const saved = await prisma.purok.upsert({
      where: { code: purok.code },
      create: {
        code: purok.code,
        name: purok.name,
        nameNormalized: normalizeNamePart(purok.name),
        status: PurokStatus.ACTIVE,
        createdByUserId: secretaryId,
        updatedByUserId: secretaryId,
      },
      update: {
        name: purok.name,
        nameNormalized: normalizeNamePart(purok.name),
        status: PurokStatus.ACTIVE,
        updatedByUserId: secretaryId,
      },
    });
    puroks.set(purok.code, saved.id);
  }

  const residents = await prisma.resident.findMany({
    where: {
      residentNumber: {
        in: ['RES-2026-000001', 'RES-2026-000002', 'RES-2026-000006'],
      },
    },
    select: { id: true, residentNumber: true },
  });
  const residentIds = new Map(
    residents.map((resident) => [resident.residentNumber, resident.id]),
  );
  const juanId = residentIds.get('RES-2026-000001');
  const mariaId = residentIds.get('RES-2026-000002');
  const litoId = residentIds.get('RES-2026-000006');
  const purokOneId = puroks.get('P-01');
  const purokTwoId = puroks.get('P-02');
  const purokThreeId = puroks.get('P-03');
  if (
    !juanId ||
    !mariaId ||
    !litoId ||
    !purokOneId ||
    !purokTwoId ||
    !purokThreeId
  ) {
    throw new Error('Seed residents and Puroks must exist before households.');
  }

  const householdDefinitions = [
    {
      householdNumber: 'HH-2026-000001',
      purokId: purokOneId,
      addressLine: '12 Sampaguita Street, Barangay 2',
      landmark: 'Blue gate beside the covered court',
      headResidentId: juanId,
      status: HouseholdStatus.ACTIVE,
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
    },
    {
      householdNumber: 'HH-2026-000002',
      purokId: purokTwoId,
      addressLine: '48 Mabini Street, Barangay 2',
      landmark: null,
      headResidentId: litoId,
      status: HouseholdStatus.ACTIVE,
      verificationStatus: VerificationStatus.UNVERIFIED,
      verifiedAt: null,
    },
    {
      householdNumber: 'HH-2026-000003',
      purokId: purokThreeId,
      addressLine: 'Former residence, Purok 3',
      landmark: null,
      headResidentId: null,
      status: HouseholdStatus.INACTIVE,
      verificationStatus: VerificationStatus.UNVERIFIED,
      verifiedAt: null,
    },
  ];

  for (const household of householdDefinitions) {
    const data = {
      purokId: household.purokId,
      addressLine: household.addressLine,
      landmark: household.landmark,
      headResidentId: household.headResidentId,
      status: household.status,
      statusChangedAt: new Date(),
      verificationStatus: household.verificationStatus,
      verifiedAt: household.verifiedAt,
      verifiedByUserId:
        household.verificationStatus === VerificationStatus.VERIFIED
          ? secretaryId
          : null,
      createdByUserId: encoderId,
      updatedByUserId: encoderId,
    };
    await prisma.household.upsert({
      where: { householdNumber: household.householdNumber },
      create: { householdNumber: household.householdNumber, ...data },
      update: data,
    });
  }

  const memberships = [
    {
      householdNumber: 'HH-2026-000001',
      residentId: juanId,
      relationship: 'Head',
    },
    {
      householdNumber: 'HH-2026-000001',
      residentId: mariaId,
      relationship: 'Spouse',
    },
    {
      householdNumber: 'HH-2026-000002',
      residentId: litoId,
      relationship: 'Head',
    },
  ];

  for (const membership of memberships) {
    const household = await prisma.household.findUnique({
      where: { householdNumber: membership.householdNumber },
      select: { id: true },
    });
    if (!household) {
      throw new Error('Seed household must exist before memberships.');
    }
    await prisma.householdMembership.upsert({
      where: { activeResidentId: membership.residentId },
      create: {
        householdId: household.id,
        residentId: membership.residentId,
        activeResidentId: membership.residentId,
        relationship: membership.relationship,
        createdByUserId: encoderId,
        updatedByUserId: encoderId,
      },
      update: {
        householdId: household.id,
        relationship: membership.relationship,
        status: 'ACTIVE',
        endedAt: null,
        endReason: null,
        endNote: null,
        updatedByUserId: encoderId,
      },
    });
  }

  const sequence = await prisma.householdNumberSequence.findUnique({
    where: { year: 2026 },
  });
  if (!sequence) {
    await prisma.householdNumberSequence.create({
      data: { year: 2026, lastNumber: householdDefinitions.length },
    });
  } else if (sequence.lastNumber < householdDefinitions.length) {
    await prisma.householdNumberSequence.update({
      where: { year: 2026 },
      data: { lastNumber: householdDefinitions.length },
    });
  }

  console.info(
    `Seeded ${purokDefinitions.length} synthetic Puroks and ${householdDefinitions.length} households.`,
  );
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed development data when NODE_ENV=production.');
  }

  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'SEED_DEFAULT_PASSWORD must be set to at least 12 characters before seeding.',
    );
  }

  const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const passwordHash = await bcrypt.hash(password, rounds);

  for (const seedUser of SEED_USERS) {
    await prisma.user.upsert({
      where: { username: seedUser.username },
      create: {
        ...seedUser,
        passwordHash,
      },
      update: {
        email: seedUser.email,
        firstName: seedUser.firstName,
        middleName: seedUser.middleName ?? null,
        lastName: seedUser.lastName,
        role: seedUser.role,
        status: seedUser.status,
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  console.info(`Seeded ${SEED_USERS.length} synthetic development accounts:`);
  for (const seedUser of SEED_USERS) {
    console.info(
      `  - ${seedUser.username.padEnd(18)} ${seedUser.role.padEnd(20)} ${seedUser.status}`,
    );
  }
  console.info(
    'Password for every seeded account: value of SEED_DEFAULT_PASSWORD in backend/.env',
  );
  console.info('These accounts are for local development only.');

  await seedResidents();
  await seedPuroksAndHouseholds();
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
