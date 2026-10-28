-- CreateTable
CREATE TABLE `residents` (
    `id` CHAR(36) NOT NULL,
    `residentNumber` VARCHAR(20) NOT NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `middleName` VARCHAR(80) NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `suffix` VARCHAR(20) NULL,
    `nameNormalized` VARCHAR(255) NOT NULL,
    `nameKey` VARCHAR(255) NOT NULL,
    `birthDate` DATE NOT NULL,
    `sex` ENUM('MALE', 'FEMALE', 'NOT_RECORDED') NOT NULL,
    `contactNumber` VARCHAR(20) NULL,
    `residencyStatus` ENUM('ACTIVE', 'MOVED_OUT', 'DECEASED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `statusChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recordSource` ENUM('WALK_IN', 'FIELD_SURVEY', 'EXISTING_RECORD', 'IMPORT') NOT NULL,
    `sourceReference` VARCHAR(150) NULL,
    `sourceReferenceUnavailableReason` VARCHAR(500) NULL,
    `verificationStatus` ENUM('UNVERIFIED', 'VERIFIED') NOT NULL DEFAULT 'UNVERIFIED',
    `verifiedAt` DATETIME(3) NULL,
    `verifiedByUserId` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByUserId` CHAR(36) NULL,
    `updatedByUserId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `residents_residentNumber_key`(`residentNumber`),
    INDEX `residents_nameNormalized_birthDate_idx`(`nameNormalized`, `birthDate`),
    INDEX `residents_nameKey_birthDate_idx`(`nameKey`, `birthDate`),
    INDEX `residents_lastName_firstName_birthDate_idx`(`lastName`, `firstName`, `birthDate`),
    INDEX `residents_residencyStatus_lastName_idx`(`residencyStatus`, `lastName`),
    INDEX `residents_verificationStatus_idx`(`verificationStatus`),
    INDEX `residents_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resident_changes` (
    `id` CHAR(36) NOT NULL,
    `residentId` CHAR(36) NOT NULL,
    `actorUserId` CHAR(36) NULL,
    `action` ENUM('CREATED', 'UPDATED', 'STATUS_CHANGED', 'VERIFIED', 'DUPLICATE_REVIEW_REQUESTED', 'DUPLICATE_REVIEW_APPROVED', 'DUPLICATE_REVIEW_REJECTED', 'DUPLICATE_REVIEW_CANCELLED', 'CORRECTION_REQUESTED', 'CORRECTION_APPROVED', 'CORRECTION_REJECTED', 'CORRECTION_CANCELLED', 'STATUS_CORRECTED') NOT NULL,
    `changes` TEXT NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `resident_changes_residentId_createdAt_idx`(`residentId`, `createdAt`),
    INDEX `resident_changes_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resident_number_sequences` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resident_identity_guards` (
    `identityKey` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`identityKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resident_duplicate_reviews` (
    `id` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `identityKey` CHAR(64) NOT NULL,
    `activeIdentityKey` CHAR(64) NULL,
    `requestedByUserId` CHAR(36) NULL,
    `decidedByUserId` CHAR(36) NULL,
    `draftData` TEXT NULL,
    `candidateResidentIds` TEXT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `decisionNote` VARCHAR(500) NULL,
    `createdResidentId` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NULL,

    UNIQUE INDEX `resident_duplicate_reviews_activeIdentityKey_key`(`activeIdentityKey`),
    UNIQUE INDEX `resident_duplicate_reviews_createdResidentId_key`(`createdResidentId`),
    INDEX `resident_duplicate_reviews_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `resident_duplicate_reviews_identityKey_status_idx`(`identityKey`, `status`),
    INDEX `resident_duplicate_reviews_requestedByUserId_createdAt_idx`(`requestedByUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resident_corrections` (
    `id` CHAR(36) NOT NULL,
    `residentId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `correctionType` ENUM('STATUS_REVERSAL') NOT NULL DEFAULT 'STATUS_REVERSAL',
    `fromStatus` ENUM('ACTIVE', 'MOVED_OUT', 'DECEASED', 'INACTIVE') NOT NULL,
    `toStatus` ENUM('ACTIVE', 'MOVED_OUT', 'DECEASED', 'INACTIVE') NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `evidenceReference` VARCHAR(255) NOT NULL,
    `requestedByUserId` CHAR(36) NULL,
    `decidedByUserId` CHAR(36) NULL,
    `decisionNote` VARCHAR(500) NULL,
    `activeResidentId` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NULL,

    UNIQUE INDEX `resident_corrections_activeResidentId_key`(`activeResidentId`),
    INDEX `resident_corrections_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `resident_corrections_residentId_createdAt_idx`(`residentId`, `createdAt`),
    INDEX `resident_corrections_requestedByUserId_createdAt_idx`(`requestedByUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `residents` ADD CONSTRAINT `residents_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `residents` ADD CONSTRAINT `residents_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `residents` ADD CONSTRAINT `residents_verifiedByUserId_fkey` FOREIGN KEY (`verifiedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resident_changes` ADD CONSTRAINT `resident_changes_residentId_fkey` FOREIGN KEY (`residentId`) REFERENCES `residents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resident_changes` ADD CONSTRAINT `resident_changes_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resident_duplicate_reviews` ADD CONSTRAINT `resident_duplicate_reviews_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resident_duplicate_reviews` ADD CONSTRAINT `resident_duplicate_reviews_decidedByUserId_fkey` FOREIGN KEY (`decidedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resident_duplicate_reviews` ADD CONSTRAINT `resident_duplicate_reviews_createdResidentId_fkey` FOREIGN KEY (`createdResidentId`) REFERENCES `residents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resident_corrections` ADD CONSTRAINT `resident_corrections_residentId_fkey` FOREIGN KEY (`residentId`) REFERENCES `residents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resident_corrections` ADD CONSTRAINT `resident_corrections_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resident_corrections` ADD CONSTRAINT `resident_corrections_decidedByUserId_fkey` FOREIGN KEY (`decidedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

