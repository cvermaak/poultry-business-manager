# Slaughter Tracking Feature Implementation Guide

## Overview

This document provides complete instructions for replicating the slaughter tracking feature from the Manus sandbox to your GitHub repository and Railway deployment.

The slaughter tracking system allows you to:
- Create slaughter batches for flocks reaching market weight
- Record daily catching operations with weight data
- Calculate weight shrinkage during transport and handling
- Track actual weights from the slaughterhouse
- Analyze variance between estimated and actual weights

## Database Schema Changes

### New Tables

Three new tables have been added to track the slaughter process:

#### 1. `slaughter_batches`
Represents a group of birds being slaughtered over multiple days.

```sql
CREATE TABLE `slaughter_batches` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `flockId` int NOT NULL,
  `batchNumber` varchar(50) NOT NULL,
  `startDate` timestamp NOT NULL,
  `endDate` timestamp NULL,
  `totalBirdsSold` int DEFAULT 0,
  `status` enum('in-progress','completed','at-slaughterhouse') DEFAULT 'in-progress' NOT NULL,
  `transportTimeHours` decimal(5,2),
  `notes` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  `createdBy` int,
  FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`),
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  INDEX `idx_sb_flock_id` (`flockId`),
  INDEX `idx_sb_status` (`status`),
  INDEX `idx_sb_start_date` (`startDate`)
);
```

#### 2. `slaughter_catch_records`
Daily records of birds caught, with calculated shrinkage estimates.

```sql
CREATE TABLE `slaughter_catch_records` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `batchId` int NOT NULL,
  `catchDate` timestamp NOT NULL,
  `dayNumber` int NOT NULL,
  `birdsCaught` int NOT NULL,
  `averageWeightAtFarm` decimal(10,3) NOT NULL,
  `feedRemovalHours` int NOT NULL,
  `gutEvacuationPercent` decimal(5,2) NOT NULL,
  `catchingHandlingPercent` decimal(5,2) NOT NULL,
  `loadingHoldingPercent` decimal(5,2) NOT NULL,
  `transportPercent` decimal(5,2) NOT NULL,
  `totalShrinkagePercent` decimal(5,2) NOT NULL,
  `estimatedWeightAtSlaughterhouse` decimal(10,3) NOT NULL,
  `notes` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  `createdBy` int,
  FOREIGN KEY (`batchId`) REFERENCES `slaughter_batches`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  INDEX `idx_scr_batch_id` (`batchId`),
  INDEX `idx_scr_catch_date` (`catchDate`)
);
```

#### 3. `slaughterhouse_records`
Actual weight data received from the slaughterhouse.

```sql
CREATE TABLE `slaughterhouse_records` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `catchRecordId` int NOT NULL,
  `actualWeightAtSlaughterhouse` decimal(10,3) NOT NULL,
  `variance` decimal(10,3) NOT NULL,
  `variancePercent` decimal(5,2) NOT NULL,
  `slaughterhouseReference` varchar(100),
  `receivedDate` timestamp NOT NULL,
  `notes` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  `createdBy` int,
  FOREIGN KEY (`catchRecordId`) REFERENCES `slaughter_catch_records`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  INDEX `idx_shr_catch_id` (`catchRecordId`),
  INDEX `idx_shr_received_date` (`receivedDate`)
);
```

### Migration File

A migration file has been generated: `drizzle/0015_slaughter_tracking.sql`

This file will be automatically applied when you run `pnpm db:push` on Railway.

---

## File Changes for GitHub

### 1. Database Schema Files

**File**: `drizzle/schema-slaughter.ts` (NEW)

This is a new file containing the Drizzle ORM table definitions for slaughter tracking. Copy this file as-is to your GitHub repo.

**File**: `drizzle/schema.ts` (MODIFIED)

At the end of the file (around line 930), replace the old slaughter table definitions with:

```typescript
// Re-export slaughter tracking tables from schema-slaughter
export {
  slaughterBatches,
  slaughterCatchRecords,
  slaughterhouseRecords,
  type SlaughterBatch,
  type InsertSlaughterBatch,
  type SlaughterCatchRecord,
  type InsertSlaughterCatchRecord,
  type SlaughterhouseRecord,
  type InsertSlaughterhouseRecord,
} from "./schema-slaughter";
```

### 2. Backend Helper Files

**File**: `server/helpers/shrinkage.ts` (NEW)

Contains shrinkage calculation logic. Copy this file as-is.

**File**: `server/helpers/slaughter-db.ts` (NEW)

Contains database helper functions for slaughter operations. Copy this file as-is.

### 3. Backend Procedures

**File**: `server/procedures/slaughter.ts` (NEW)

Contains tRPC procedures for slaughter operations. Copy this file as-is.

**File**: `server/routers.ts` (MODIFIED)

Add this import at the top (after line 11):
```typescript
import { slaughterRouter } from "./procedures/slaughter";
```

Then add this section after the reminders router (around line 1383):
```typescript
  // ============================================================================
  // SLAUGHTER TRACKING
  // ============================================================================
  slaughter: slaughterRouter,
```

### 4. Frontend Components

**File**: `client/src/pages/SlaughterManagement.tsx` (NEW)

Main page for slaughter management. Copy this file as-is.

**File**: `client/src/components/SlaughterBatchForm.tsx` (NEW)

Form for creating slaughter batches. Copy this file as-is.

**File**: `client/src/components/SlaughterCatchForm.tsx` (NEW)

Form for adding catch records. Copy this file as-is.

**File**: `client/src/components/SlaughterhouseDataForm.tsx` (NEW)

Form for entering slaughterhouse data. Copy this file as-is.

**File**: `client/src/App.tsx` (MODIFIED)

Add import after line 13:
```typescript
import SlaughterManagement from "./pages/SlaughterManagement";
```

Add route after the FlockDetail route (around line 48):
```typescript
      <Route path="/flocks/:flockId/slaughter">
        <DashboardLayout>
          <SlaughterManagement />
        </DashboardLayout>
      </Route>
```

---

## Implementation Steps for Railway

1. **Clone/Update your GitHub repository**
   ```bash
   git clone <your-repo-url>
   cd poultry-business-manager
   ```

2. **Copy new files from Manus sandbox**
   - `drizzle/schema-slaughter.ts`
   - `server/helpers/shrinkage.ts`
   - `server/helpers/slaughter-db.ts`
   - `server/procedures/slaughter.ts`
   - `client/src/pages/SlaughterManagement.tsx`
   - `client/src/components/SlaughterBatchForm.tsx`
   - `client/src/components/SlaughterCatchForm.tsx`
   - `client/src/components/SlaughterhouseDataForm.tsx`

3. **Modify existing files** as documented above:
   - `drizzle/schema.ts`
   - `server/routers.ts`
   - `client/src/App.tsx`

4. **Commit and push to GitHub**
   ```bash
   git add .
   git commit -m "feat: Add slaughter tracking system"
   git push origin main
   ```

5. **Railway will automatically redeploy**
   - The migration will run automatically
   - New tables will be created
   - Feature will be live

---

## Feature Usage

### Creating a Slaughter Batch

1. Navigate to a flock detail page
2. Click "Slaughter Management" or go to `/flocks/{flockId}/slaughter`
3. Click "New Slaughter Batch"
4. Enter:
   - **Batch Number**: Unique identifier (e.g., "BATCH-001")
   - **Transport Time**: Hours to slaughterhouse (default: 2)
   - **Notes**: Optional details

### Adding Catch Records

1. Select a batch
2. Go to "Catch Records" tab
3. Click "Add Catch Record"
4. Enter:
   - **Catch Date**: Date of catching
   - **Day Number**: Day of flock life (e.g., 35)
   - **Birds Caught**: Number of birds (e.g., 3000)
   - **Average Weight at Farm**: Weight before feed removal (kg)
   - **Feed Removal Hours**: Hours from feed removal to catching (typically 6-7)

The system automatically calculates:
- Shrinkage percentages for each component
- Total shrinkage percentage
- Estimated weight at slaughterhouse

### Adding Slaughterhouse Data

1. Select a catch record
2. Go to "Slaughterhouse Data" tab
3. Enter actual weight received from slaughterhouse
4. System calculates variance between estimated and actual

### Viewing Summary

The "Summary" tab shows:
- Total birds caught
- Average farm weight
- Average estimated slaughterhouse weight
- Number of catch records

---

## Shrinkage Calculation Formula

The system calculates weight loss during slaughter using these components:

| Component | Formula | Range |
|-----------|---------|-------|
| Gut Evacuation | 2% + (feedRemovalHours / 24) | 2.0 - 3.0% |
| Catching & Handling | Fixed | 1.75% |
| Loading & Holding | Fixed | 0.65% |
| Transport | 0.7% + (transportHours / 2 × 0.3) | 0.7 - 1.0% |
| **Total** | Sum of above | **4.7 - 6.8%** |

**Example calculation** (6-hour feed removal, 2-hour transport):
- Gut Evacuation: 2.0 + (6/24) = 2.25%
- Catching & Handling: 1.75%
- Loading & Holding: 0.65%
- Transport: 0.7 + (2/2 × 0.3) = 1.0%
- **Total Shrinkage: 5.65%**

If farm weight is 1.850 kg:
- Estimated slaughterhouse weight = 1.850 × (1 - 0.0565) = 1.745 kg

---

## API Endpoints (tRPC Procedures)

### Batch Operations

- `trpc.slaughter.createBatch.mutate(input)` - Create new batch
- `trpc.slaughter.getBatchesByFlock.useQuery({flockId})` - Get all batches for flock
- `trpc.slaughter.getBatchById.useQuery({batchId})` - Get batch with details

### Catch Record Operations

- `trpc.slaughter.addCatchRecord.mutate(input)` - Add daily catch record
- `trpc.slaughter.deleteCatchRecord.mutate({catchRecordId})` - Delete catch record

### Slaughterhouse Data

- `trpc.slaughter.addSlaughterhouseRecord.mutate(input)` - Add slaughterhouse weight data

---

## Database Queries

### Get all batches for a flock
```sql
SELECT * FROM slaughter_batches 
WHERE flockId = ? 
ORDER BY startDate DESC;
```

### Get catch records for a batch with slaughterhouse data
```sql
SELECT 
  scr.*,
  sr.actualWeightAtSlaughterhouse,
  sr.variance,
  sr.variancePercent
FROM slaughter_catch_records scr
LEFT JOIN slaughterhouse_records sr ON scr.id = sr.catchRecordId
WHERE scr.batchId = ?
ORDER BY scr.catchDate DESC;
```

### Calculate batch summary
```sql
SELECT 
  COUNT(*) as totalRecords,
  SUM(birdsCaught) as totalBirdsCaught,
  AVG(CAST(averageWeightAtFarm AS DECIMAL(10,3))) as avgFarmWeight,
  AVG(CAST(estimatedWeightAtSlaughterhouse AS DECIMAL(10,3))) as avgEstimatedWeight
FROM slaughter_catch_records
WHERE batchId = ?;
```

---

## Troubleshooting

### Migration fails on Railway
- Check that all three new tables are defined in `drizzle/schema-slaughter.ts`
- Ensure foreign key names don't exceed 64 characters (MySQL limit)
- Verify the migration file `drizzle/0015_slaughter_tracking.sql` exists

### Slaughter routes not appearing
- Verify `SlaughterManagement` component is imported in `App.tsx`
- Check that route path is `/flocks/:flockId/slaughter`
- Ensure `slaughterRouter` is added to `appRouter` in `server/routers.ts`

### Shrinkage calculations seem wrong
- Verify `feedRemovalHours` is in hours (not minutes)
- Check that `transportTimeHours` is a decimal (e.g., 2.5 for 2.5 hours)
- Ensure weights are in kg

---

## Testing Checklist

- [ ] Create a new slaughter batch
- [ ] Add a catch record with weight data
- [ ] Verify shrinkage percentages are calculated
- [ ] Verify estimated slaughterhouse weight is calculated
- [ ] Add slaughterhouse data
- [ ] Verify variance is calculated correctly
- [ ] Delete a catch record
- [ ] View batch summary
- [ ] Check database records are created

---

## Future Enhancements

Consider adding:
1. **Batch status workflow** - Auto-update status when all birds caught
2. **Reporting** - Export catch records and variance analysis
3. **Alerts** - Notify if variance exceeds threshold
4. **Batch notes** - Track issues or special handling
5. **Multiple destinations** - Support multiple slaughterhouses per batch
6. **Weight trends** - Chart weight progression across catch days

