-- CreateTable
CREATE TABLE `puroks` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `nameNormalized` VARCHAR(160) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByUserId` CHAR(36) NULL,
    `updatedByUserId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `puroks_code_key`(`code`),
    UNIQUE INDEX `puroks_nameNormalized_key`(`nameNormalized`),
    INDEX `puroks_status_name_idx`(`status`, `name`),
    INDEX `puroks_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `households` (
    `id` CHAR(36) NOT NULL,
    `householdNumber` VARCHAR(20) NOT NULL,
    `purokId` CHAR(36) NOT NULL,
    `addressLine` VARCHAR(255) NOT NULL,
    `landmark` VARCHAR(200) NULL,
    `headResidentId` CHAR(36) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `statusChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `verificationStatus` ENUM('UNVERIFIED', 'VERIFIED') NOT NULL DEFAULT 'UNVERIFIED',
    `verifiedAt` DATETIME(3) NULL,
    `verifiedByUserId` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByUserId` CHAR(36) NULL,
    `updatedByUserId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `households_householdNumber_key`(`householdNumber`),
    UNIQUE INDEX `households_headResidentId_key`(`headResidentId`),
    INDEX `households_purokId_status_idx`(`purokId`, `status`),
    INDEX `households_status_householdNumber_idx`(`status`, `householdNumber`),
    INDEX `households_verificationStatus_idx`(`verificationStatus`),
    INDEX `households_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `household_memberships` (
    `id` CHAR(36) NOT NULL,
    `householdId` CHAR(36) NOT NULL,
    `residentId` CHAR(36) NOT NULL,
    `activeResidentId` CHAR(36) NULL,
    `relationship` VARCHAR(80) NULL,
    `status` ENUM('ACTIVE', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `endReason` ENUM('LEFT_HOUSEHOLD', 'MOVED_OUT', 'DECEASED', 'TRANSFERRED', 'HOUSEHOLD_DISSOLVED', 'OTHER') NULL,
    `endNote` VARCHAR(500) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdByUserId` CHAR(36) NULL,
    `updatedByUserId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `household_memberships_activeResidentId_key`(`activeResidentId`),
    INDEX `household_memberships_householdId_status_createdAt_idx`(`householdId`, `status`, `createdAt`),
    INDEX `household_memberships_residentId_status_idx`(`residentId`, `status`),
    INDEX `household_memberships_status_endedAt_idx`(`status`, `endedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `household_changes` (
    `id` CHAR(36) NOT NULL,
    `householdId` CHAR(36) NOT NULL,
    `actorUserId` CHAR(36) NULL,
    `action` ENUM('CREATED', 'UPDATED', 'STATUS_CHANGED', 'VERIFIED', 'HEAD_CHANGED', 'MEMBER_ADDED', 'MEMBER_ENDED', 'MEMBER_TRANSFERRED', 'MEMBER_STATUS_CHANGED') NOT NULL,
    `changes` TEXT NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `household_changes_householdId_createdAt_idx`(`householdId`, `createdAt`),
    INDEX `household_changes_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `household_number_sequences` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `puroks` ADD CONSTRAINT `puroks_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `puroks` ADD CONSTRAINT `puroks_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `households` ADD CONSTRAINT `households_purokId_fkey` FOREIGN KEY (`purokId`) REFERENCES `puroks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `households` ADD CONSTRAINT `households_headResidentId_fkey` FOREIGN KEY (`headResidentId`) REFERENCES `residents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `households` ADD CONSTRAINT `households_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `households` ADD CONSTRAINT `households_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `households` ADD CONSTRAINT `households_verifiedByUserId_fkey` FOREIGN KEY (`verifiedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `household_memberships` ADD CONSTRAINT `household_memberships_householdId_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `household_memberships` ADD CONSTRAINT `household_memberships_residentId_fkey` FOREIGN KEY (`residentId`) REFERENCES `residents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `household_memberships` ADD CONSTRAINT `household_memberships_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `household_memberships` ADD CONSTRAINT `household_memberships_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `household_changes` ADD CONSTRAINT `household_changes_householdId_fkey` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `household_changes` ADD CONSTRAINT `household_changes_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
