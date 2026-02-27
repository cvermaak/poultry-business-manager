import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { inventoryRouter } from "./inventory-router";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { createVaccinationSchedulesForFlock, createStressPackSchedulesForFlock, createFlockVaccinationSchedule } from "./db-health-helpers";
import * as healthDb from "./db-health-helpers";
import { hashPassword, verifyPassword, generateTemporaryPassword, validatePasswordStrength } from "./password";
import { sdk } from "./_core/sdk";
// import { slaughterRouter } from "./procedures/slaughter";
import { harvestRouter } from "./procedures/harvest";
import { processorRouter } from "./procedures/processor";
import { harvestAnalyticsRouter } from "./procedures/harvestAnalytics";
import { catchRouter } from "./procedures/catch";
import { densityRouter } from "./procedures/density";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  inventory: inventoryRouter,

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    
    // Email/Password Login
    login: publicProcedure
      .input(z.object({
        identifier: z.string().min(1, "Email or username is required"),
        password: z.string().min(1, "Password is required"),
      }))
      .mutation(async ({ input, ctx }) => {
        // Find user by email or username
        const user = await db.getUserByEmailOrUsername(input.identifier);
        
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }
        
        if (!user.isActive) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Account is deactivated" });
        }
        
        if (!user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "This account uses OAuth login" });
        }
        
        // Verify password
        const isValid = await verifyPassword(input.password, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }
        
        // Update last sign in
        await db.updateUserLastSignIn(user.id);
        
        // Create session token using a unique identifier for email users
        const sessionToken = await sdk.createSessionToken(`email:${user.id}`, {
          name: user.name || "",
          expiresInMs: ONE_YEAR_MS,
        });
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        
        return {
          success: true,
          mustChangePassword: user.mustChangePassword,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        };
      }),
    
    // Change Password
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().optional(),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        
        // If user has a password and it's not a forced change, verify current password
        if (user.passwordHash && !user.mustChangePassword && input.currentPassword) {
          const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
          if (!isValid) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
          }
        }
        
        // Validate new password strength
        const strengthError = validatePasswordStrength(input.newPassword);
        if (strengthError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: strengthError });
        }
        
        // Hash and save new password
        const passwordHash = await hashPassword(input.newPassword);
        await db.updateUserPassword(ctx.user.id, passwordHash, false);
        
        return { success: true };
      }),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================
  users: router({
    list: adminProcedure.query(async () => {
      return await db.listUsers();
    }),

    getById: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getUserById(input.id);
    }),

    // Create new user with email/password
    create: adminProcedure
      .input(z.object({
        username: z.string().min(3, "Username must be at least 3 characters").max(50),
        email: z.string().email("Invalid email address"),
        name: z.string().min(1, "Name is required"),
        role: z.enum(["admin", "farm_manager", "accountant", "sales_staff", "production_worker"]),
        temporaryPassword: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Check if email already exists
        const existingEmail = await db.getUserByEmail(input.email);
        if (existingEmail) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
        }
        
        // Check if username already exists
        const existingUsername = await db.getUserByUsername(input.username);
        if (existingUsername) {
          throw new TRPCError({ code: "CONFLICT", message: "Username already in use" });
        }
        
        // Generate temporary password if not provided
        const tempPassword = input.temporaryPassword || generateTemporaryPassword();
        const passwordHash = await hashPassword(tempPassword);
        
        const userId = await db.createEmailUser({
          username: input.username,
          email: input.email,
          name: input.name,
          passwordHash,
          role: input.role,
          createdBy: ctx.user.id,
        });
        
        await db.logUserActivity(ctx.user.id, "create_user", "user", userId, `Created user ${input.username}`);
        
        return {
          success: true,
          userId,
          temporaryPassword: tempPassword,
        };
      }),

    updateRole: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          role: z.enum(["admin", "farm_manager", "accountant", "sales_staff", "production_worker"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.updateUserRole(input.userId, input.role);
        await db.logUserActivity(ctx.user.id, "update_user_role", "user", input.userId, `Changed role to ${input.role}`);
        return { success: true };
      }),
    
    // Update user details
    update: adminProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        username: z.string().min(3).max(50).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { userId, ...data } = input;
        
        // Check for email conflicts
        if (data.email) {
          const existing = await db.getUserByEmail(data.email);
          if (existing && existing.id !== userId) {
            throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
          }
        }
        
        // Check for username conflicts
        if (data.username) {
          const existing = await db.getUserByUsername(data.username);
          if (existing && existing.id !== userId) {
            throw new TRPCError({ code: "CONFLICT", message: "Username already in use" });
          }
        }
        
        await db.updateUser(userId, data);
        await db.logUserActivity(ctx.user.id, "update_user", "user", userId, `Updated user details`);
        return { success: true };
      }),
    
    // Reset user password
    resetPassword: adminProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tempPassword = input.newPassword || generateTemporaryPassword();
        const passwordHash = await hashPassword(tempPassword);
        
        await db.updateUserPassword(input.userId, passwordHash, true);
        await db.logUserActivity(ctx.user.id, "reset_password", "user", input.userId, `Password reset`);
        
        return {
          success: true,
          temporaryPassword: tempPassword,
        };
      }),
    
    // Deactivate user
    deactivate: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot deactivate your own account" });
        }
        await db.deactivateUser(input.userId);
        await db.logUserActivity(ctx.user.id, "deactivate_user", "user", input.userId, `Deactivated user`);
        return { success: true };
      }),
    
    // Activate user
    activate: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.activateUser(input.userId);
        await db.logUserActivity(ctx.user.id, "activate_user", "user", input.userId, `Activated user`);
        return { success: true };
      }),
    
    // Delete user permanently
    delete: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete your own account" });
        }
        await db.deleteUser(input.userId);
        await db.logUserActivity(ctx.user.id, "delete_user", "user", input.userId, `Permanently deleted user`);
        return { success: true };
      }),
  }),

  // ============================================================================
  // HOUSE MANAGEMENT
  // ============================================================================
  houses: router({
    list: protectedProcedure.query(async () => {
      return await db.listHouses();
    }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getHouseById(input.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          houseNumber: z.string().optional(),
          length: z.number().positive(),
          width: z.number().positive(),
          capacity: z.number().int().positive(),
          houseType: z.enum(["open_sided", "closed", "semi_closed"]).default("closed"),
          breed: z.enum(["ross_308", "cobb_500", "arbor_acres"]).default("ross_308"),
          farmName: z.string().optional(),
          physicalAddress: z.string().optional(),
          gpsLatitude: z.number().optional(),
          gpsLongitude: z.number().optional(),
          province: z.string().optional(),
          district: z.string().optional(),
          mortalityRate: z.number().min(0).max(100).default(4.0),
          targetSlaughterWeight: z.number().positive().default(1.9),
          densityKgPerSqm: z.number().positive().optional(),
          beddingType: z.string().default("pine_shavings"),
          beddingDepth: z.number().int().default(30),
          numberOfFeeders: z.number().int().optional(),
          numberOfDrinkers: z.number().int().optional(),
          heatingType: z.string().optional(),
          ventilationType: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Import capacity calculation helper
        const { calculateHouseCapacity, validateDensity, getRecommendedDensity } = await import("./house-capacity");
        
        // Calculate floor area
        const floorArea = input.length * input.width;
        
        // Use provided density or get recommended density for house type
        const densityToUse = input.densityKgPerSqm || getRecommendedDensity(input.houseType);
        
        // Validate density is within safe range
        const validation = validateDensity(input.houseType, densityToUse);
        if (!validation.valid) {
          throw new Error(validation.message);
        }
        
        // Calculate capacity if not manually overridden
        const capacityCalculation = calculateHouseCapacity({
          floorArea,
          houseType: input.houseType,
          densityKgPerSqm: densityToUse,
          targetSlaughterWeight: input.targetSlaughterWeight,
          mortalityRate: input.mortalityRate,
        });
        
        await db.createHouse({ 
          ...input, 
          length: input.length.toString(),
          width: input.width.toString(),
          gpsLatitude: input.gpsLatitude?.toString(),
          gpsLongitude: input.gpsLongitude?.toString(),
          mortalityRate: input.mortalityRate.toString(),
          targetSlaughterWeight: input.targetSlaughterWeight.toString(),
          densityKgPerSqm: densityToUse.toString(),
          // Use calculated capacity if not manually overridden
          capacity: input.capacity || capacityCalculation.placementCapacity,
          createdBy: ctx.user.id 
        });
        await db.logUserActivity(ctx.user.id, "create_house", "house", undefined, `Created house: ${input.name}`);
        return { 
          success: true,
          capacityCalculation: {
            ...capacityCalculation,
            calculatedCapacity: capacityCalculation.placementCapacity,
            usedCapacity: input.capacity || capacityCalculation.placementCapacity,
          },
        };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          houseNumber: z.string().optional(),
          length: z.number().positive().optional(),
          width: z.number().positive().optional(),
          capacity: z.number().int().positive().optional(),
          houseType: z.enum(["open_sided", "closed", "semi_closed"]).optional(),
          beddingType: z.string().optional(),
          beddingDepth: z.number().int().optional(),
          numberOfFeeders: z.number().int().optional(),
          numberOfDrinkers: z.number().int().optional(),
          heatingType: z.string().optional(),
          ventilationType: z.string().optional(),
          notes: z.string().optional(),
          isActive: z.boolean().optional(),
          farmName: z.string().optional(),
          physicalAddress: z.string().optional(),
          province: z.string().optional(),
          district: z.string().optional(),
          gpsLatitude: z.string().optional(),
          gpsLongitude: z.string().optional(),
          mortalityRate: z.number().min(0).max(100).optional(),
          targetSlaughterWeight: z.number().positive().optional(),
          densityKgPerSqm: z.number().positive().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, length, width, ...rest } = input;
        const data: any = { ...rest };
        if (length !== undefined) data.length = length.toString();
        if (width !== undefined) data.width = width.toString();
        await db.updateHouse(id, data);
        await db.logUserActivity(ctx.user.id, "update_house", "house", id, `Updated house: ${id}`);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.deleteHouse(input.id);
        await db.logUserActivity(ctx.user.id, "delete_house", "house", input.id, 
          result.softDeleted ? "Soft deleted house (marked inactive)" : "Permanently deleted house");
        return result;
      }),

    getFlockCount: protectedProcedure
      .input(z.object({ houseId: z.number() }))
      .query(async ({ input }) => {
        return await db.getHouseFlockCount(input.houseId);
      }),
  }),

  // ============================================================================
  // FLOCK MANAGEMENT
  // ============================================================================
  flocks: router({
    list: protectedProcedure
      .input(
        z
          .object({
            status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
            houseId: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await db.listFlocks(input);
      }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getFlockById(input.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          flockNumber: z.string().min(1),
          houseId: z.number(),
          placementDate: z.date(),
          initialCount: z.number().int().positive(),
          targetSlaughterWeight: z.number().positive().default(1.7),
          targetDeliveredWeight: z.number().positive().optional(),
          targetCatchingWeight: z.number().positive().optional(),
          growingPeriod: z.number().int().default(42),
          weightUnit: z.enum(["grams", "kg"]).default("kg"),
          starterFeedType: z.enum(["premium", "value", "econo"]).optional(),
          starterFromDay: z.number().int().default(0),
          starterToDay: z.number().int().optional(),
          growerFeedType: z.enum(["premium", "value", "econo"]).optional(),
          growerFromDay: z.number().int().optional(),
          growerToDay: z.number().int().optional(),
          finisherFeedType: z.enum(["premium", "value", "econo"]).optional(),
          finisherFromDay: z.number().int().optional(),
          finisherToDay: z.number().int().optional(),
          notes: z.string().optional(),
          vaccinationProtocol: z.enum(["standard", "premium", "none"]).default("standard"),
          vaccinationSchedules: z.array(
            z.object({
              vaccineId: z.number(),
              scheduledDay: z.number().int(),
            })
          ).default([]),
          stressPackSchedules: z.array(
            z.object({
              stressPackId: z.number(),
              startDay: z.number().int(),
              endDay: z.number().int(),
              dosageStrength: z.enum(["single", "double", "triple"]),
            })
          ).default([]),
          selectedTemplateIds: z.array(z.number()).default([]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.createFlock({
          ...input,
          targetSlaughterWeight: input.targetSlaughterWeight.toString(),
          targetDeliveredWeight: input.targetDeliveredWeight?.toString(),
          targetCatchingWeight: input.targetCatchingWeight?.toString(),
          currentCount: input.initialCount,
          status: "planned",
          createdBy: ctx.user.id,
        });
        
        const flockId = (result as any)[0]?.insertId || (result as any).insertId;
        
        // Create vaccination schedules from user selection
        if (input.vaccinationSchedules && input.vaccinationSchedules.length > 0) {
          // Use custom vaccination schedules - save to flockVaccinationSchedules table
          const { createFlockVaccinationSchedule } = await import("./db-health-helpers");
          for (const schedule of input.vaccinationSchedules) {
            await createFlockVaccinationSchedule({
              flockId,
              vaccineId: schedule.vaccineId,
              scheduledDay: schedule.scheduledDay,
              status: 'scheduled',
            });
          }
        } else if (input.vaccinationProtocol !== "none") {
          // Fallback to protocol-based creation for backward compatibility
          await createVaccinationSchedulesForFlock(flockId, input.vaccinationProtocol);
        }
        
        // Create stress pack schedules
        if (input.stressPackSchedules.length > 0) {
          await createStressPackSchedulesForFlock(flockId, input.stressPackSchedules);
        }
        
        // Generate reminders from selected templates
        if (input.selectedTemplateIds.length > 0) {
          await db.generateRemindersFromTemplates(flockId, input.selectedTemplateIds);
        }
        
        await db.logUserActivity(
          ctx.user.id,
          "create_flock",
          "flock",
          flockId,
          `Created flock: ${input.flockNumber}`
        );
        
        return { success: true, flockId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          flockNumber: z.string().optional(),
          houseId: z.number().optional(),
          placementDate: z.date().optional(),
          initialCount: z.number().optional(),
          targetSlaughterWeight: z.number().optional(),
          targetDeliveredWeight: z.number().positive().optional(),
          targetCatchingWeight: z.number().positive().optional(),
          growingPeriod: z.number().optional(),
          weightUnit: z.enum(["kg", "lbs"]).optional(),
          starterFeedType: z.string().optional(),
          starterToDay: z.number().optional(),
          growerFeedType: z.string().optional(),
          growerFromDay: z.number().optional(),
          growerToDay: z.number().optional(),
          finisherFeedType: z.string().optional(),
          finisherFromDay: z.number().optional(),
          finisherToDay: z.number().optional(),
          notes: z.string().optional(),
          vaccinationProtocol: z.enum(["standard", "premium", "none"]).optional(),
          vaccinationSchedules: z.array(z.object({
            vaccineId: z.number(),
            scheduledDay: z.number().int(),
          })).optional(),
          stressPackSchedules: z.array(z.object({
            stressPackId: z.number(),
            startDay: z.number(),
            endDay: z.number(),
            dosageStrength: z.enum(["single", "double", "triple"]),
          })).optional(),
          selectedTemplateIds: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, vaccinationProtocol, vaccinationSchedules, stressPackSchedules, selectedTemplateIds, targetSlaughterWeight, ...data } = input;
        const updateData: any = { ...data };
        if (targetSlaughterWeight !== undefined) {
          updateData.targetSlaughterWeight = targetSlaughterWeight.toString();
        }
        
        // Check if placement date changed to update reminder dates
        const oldFlock = await db.getFlockById(id);
        const placementDateChanged = data.placementDate && oldFlock && 
          new Date(data.placementDate).getTime() !== new Date(oldFlock.placementDate).getTime();
        
        await db.updateFlock(id, updateData);
        
        // Update reminder dates if placement date changed
        if (placementDateChanged && oldFlock) {
          const daysDiff = Math.round(
            (new Date(data.placementDate!).getTime() - new Date(oldFlock.placementDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          await db.updateFlockReminderDates(id, daysDiff);
        }
        
        // Update feed transition reminder dates if feed schedule changed
        const feedScheduleChanged = 
          data.starterToDay !== undefined ||
          data.growerFromDay !== undefined ||
          data.growerToDay !== undefined ||
          data.finisherFromDay !== undefined;
        
        if (feedScheduleChanged) {
          await db.updateFeedTransitionReminderDates(
            id,
            data.starterToDay,
            data.growerFromDay,
            data.growerToDay,
            data.finisherFromDay
          );
        }
        
        // Update health schedules selectively - only update what was provided
        if (vaccinationSchedules !== undefined) {
          // Delete existing vaccination schedules
          await db.deleteFlockVaccinationSchedules(id);
          // Get the flock to get placement date
          const flock = await db.getFlockById(id);
          if (flock && vaccinationSchedules.length > 0) {
            for (const schedule of vaccinationSchedules) {
              const vaccine = await db.getVaccineById(schedule.vaccineId);
              if (vaccine) {
                const scheduledDate = new Date(flock.placementDate);
                scheduledDate.setDate(scheduledDate.getDate() + schedule.scheduledDay);
                
                await healthDb.createFlockVaccinationSchedule({
                  flockId: id,
                  vaccineId: schedule.vaccineId,
                  scheduledDay: schedule.scheduledDay,
                  status: 'scheduled',
                });
              }
            }
          }
        } else if (vaccinationProtocol !== undefined) {
          // Fallback to protocol-based for backward compatibility
          await db.deleteFlockVaccinationSchedules(id);
          if (vaccinationProtocol !== "none") {
            await createVaccinationSchedulesForFlock(id, vaccinationProtocol);
          }
        }
        
        if (stressPackSchedules !== undefined) {
          await db.deleteFlockStressPackSchedules(id);
          if (stressPackSchedules.length > 0) {
            await createStressPackSchedulesForFlock(id, stressPackSchedules);
          }
        }
        
        if (selectedTemplateIds !== undefined) {
          await db.deleteFlockReminders(id);
          if (selectedTemplateIds.length > 0) {
            await db.generateRemindersFromTemplates(id, selectedTemplateIds);
          }
        }
        
        await db.logUserActivity(ctx.user.id, "update_flock", "flock", id, `Updated flock: ${id}`);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteFlock(input.id);
        await db.logUserActivity(ctx.user.id, "delete_flock", "flock", input.id, `Deleted flock: ${input.id}`);
        return { success: true };
      }),

    getDailyRecords: protectedProcedure.input(z.object({ flockId: z.number() })).query(async ({ input }) => {
      return await db.getFlockDailyRecords(input.flockId);
    }),

    createDailyRecord: protectedProcedure
      .input(
        z.object({
          flockId: z.number(),
          recordDate: z.date(),
          dayNumber: z.number().int(),
          mortality: z.number().int().default(0),
          feedConsumed: z.number().default(0),
          feedType: z.enum(["starter", "grower", "finisher"]).optional(),
          waterConsumed: z.number().optional(),
          averageWeight: z.number().optional(),
          weightSamples: z.string().optional(),
          temperature: z.number().optional(),
          humidity: z.number().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.createFlockDailyRecord({ 
          ...input, 
          feedConsumed: input.feedConsumed.toString(),
          waterConsumed: input.waterConsumed?.toString(),
          averageWeight: input.averageWeight?.toString(),
          temperature: input.temperature?.toString(),
          humidity: input.humidity?.toString(),
          recordedBy: ctx.user.id 
        });
        await db.logUserActivity(
          ctx.user.id,
          "create_daily_record",
          "flock_daily_record",
          input.flockId,
          `Recorded daily data for flock ${input.flockId}`
        );
        return { success: true };
      }),

    updateDailyRecord: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          flockId: z.number(),
          mortality: z.number().int().optional(),
          feedConsumed: z.number().optional(),
          feedType: z.enum(["starter", "grower", "finisher"]).optional(),
          waterConsumed: z.number().optional(),
          averageWeight: z.number().optional(),
          weightSamples: z.string().optional(),
          temperature: z.number().optional(),
          humidity: z.number().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, flockId, ...updateData } = input;
        await db.updateFlockDailyRecord(id, {
          ...updateData,
          feedConsumed: updateData.feedConsumed?.toString(),
          waterConsumed: updateData.waterConsumed?.toString(),
          averageWeight: updateData.averageWeight?.toString(),
          temperature: updateData.temperature?.toString(),
          humidity: updateData.humidity?.toString(),
        });
        await db.logUserActivity(
          ctx.user.id,
          "update_daily_record",
          "flock_daily_record",
          flockId,
          `Updated daily record ${id} for flock ${flockId}`
        );
        return { success: true };
      }),

    deleteDailyRecord: protectedProcedure
      .input(z.object({ id: z.number(), flockId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteFlockDailyRecord(input.id);
        await db.logUserActivity(
          ctx.user.id,
          "delete_daily_record",
          "flock_daily_record",
          input.flockId,
          `Deleted daily record ${input.id} from flock ${input.flockId}`
        );
        return { success: true };
      }),

    getVaccinationSchedule: protectedProcedure.input(z.object({ flockId: z.number() })).query(async ({ input }) => {
      return await db.getFlockVaccinationSchedule(input.flockId);
    }),

    getHealthRecords: protectedProcedure.input(z.object({ flockId: z.number() })).query(async ({ input }) => {
      return await db.getFlockHealthRecords(input.flockId);
    }),

    createHealthRecord: protectedProcedure
      .input(
        z.object({
          flockId: z.number(),
          recordDate: z.date(),
          recordType: z.enum(["observation", "treatment", "veterinary_visit", "medication", "other"]),
          description: z.string(),
          treatment: z.string().optional(),
          medication: z.string().optional(),
          dosage: z.string().optional(),
          veterinarianName: z.string().optional(),
          cost: z.number().optional(),
          followUpDate: z.date().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.createHealthRecord({
          ...input,
          cost: input.cost || null,
          recordedBy: ctx.user.id,
        });
        await db.logUserActivity(
          ctx.user.id,
          "create_health_record",
          "health_record",
          input.flockId,
          `Created health record for flock ${input.flockId}`
        );
        return { success: true };
      }),

    createVaccinationSchedule: protectedProcedure
      .input(
        z.object({
          flockId: z.number(),
          vaccineName: z.string(),
          scheduledDate: z.date(),
          scheduledDayNumber: z.number().int(),
          dosage: z.string().optional(),
          administrationMethod: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.createVaccinationSchedule({
          ...input,
          status: "scheduled",
        });
        await db.logUserActivity(
          ctx.user.id,
          "create_vaccination_schedule",
          "vaccination_schedule",
          input.flockId,
          `Scheduled vaccination for flock ${input.flockId}`
        );
        return { success: true };
      }),

    updateVaccinationSchedule: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["scheduled", "completed", "missed", "rescheduled"]).optional(),
          administeredDate: z.date().optional(),
          administeredBy: z.number().optional(),
          dosageUsed: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, administeredDate, ...rest } = input;
        const { updateFlockVaccinationSchedule } = await import("./db-health-helpers");
        await updateFlockVaccinationSchedule(id, {
          ...rest,
          actualDate: administeredDate,
        });
        await db.logUserActivity(
          ctx.user.id,
          "update_vaccination_schedule",
          "vaccination_schedule",
          id,
          `Updated vaccination schedule: ${id}`
        );
        return { success: true };
      }),

    getPerformanceMetrics: protectedProcedure.input(z.object({ flockId: z.number() })).query(async ({ input }) => {
      return await db.getFlockPerformanceMetrics(input.flockId);
    }),

    getAdvancedGrowthMetrics: protectedProcedure.input(z.object({ flockId: z.number() })).query(async ({ input }) => {
      return await db.getAdvancedGrowthMetrics(input.flockId);
    }),

    getFeedEfficiencyMetrics: protectedProcedure.input(z.object({ flockId: z.number() })).query(async ({ input }) => {
      return await db.getFeedEfficiencyMetrics(input.flockId);
    }),

    getTargetGrowthCurve: protectedProcedure
      .input(
        z.object({
          flockId: z.number().optional(),
          breed: z.enum(['ross_308', 'cobb_500', 'arbor_acres']).optional(),
          startDay: z.number().int().default(0),
          endDay: z.number().int().default(42),
        })
      )
      .query(async ({ input }) => {
        let breed: 'ross_308' | 'cobb_500' | 'arbor_acres' = input.breed || 'ross_308';
        
        // If flockId is provided, get breed from the flock's house
        if (input.flockId) {
          const flock = await db.getFlockById(input.flockId);
          if (flock) {
            const house = await db.getHouseById(flock.houseId);
            if (house && house.breed) {
              breed = house.breed as 'ross_308' | 'cobb_500' | 'arbor_acres';
            }
          }
        }
        
        return db.getTargetGrowthCurve(input.startDay, input.endDay, breed);
      }),

    getMortalityRecords: protectedProcedure.input(z.object({ flockId: z.number() })).query(async ({ input }) => {
      return await db.getMortalityRecords(input.flockId);
    }),

    getVaccinationSchedules: protectedProcedure
      .input(z.object({ flockId: z.number() }))
      .query(async ({ input }) => {
        const { getFlockVaccinationSchedules } = await import("./db-health-helpers");
        return await getFlockVaccinationSchedules(input.flockId);
      }),

    getStressPackSchedules: protectedProcedure
      .input(z.object({ flockId: z.number() }))
      .query(async ({ input }) => {
        const { getFlockStressPackSchedules } = await import("./db-health-helpers");
        return await getFlockStressPackSchedules(input.flockId);
      }),

    updateStressPackSchedule: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["scheduled", "active", "completed", "cancelled"]).optional(),
          quantityUsed: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const { updateFlockStressPackSchedule } = await import("./db-health-helpers");
        await updateFlockStressPackSchedule(id, data);
        await db.logUserActivity(
          ctx.user.id,
          "update_stress_pack_schedule",
          "flock_stress_pack_schedule",
          id,
          `Updated stress pack schedule: ${id}`
        );
        return { success: true };
      }),

    validateTargetWeight: protectedProcedure
      .input(
        z.object({
          breed: z.enum(['ross_308', 'cobb_500', 'arbor_acres']),
          growingPeriod: z.number().int(),
          targetWeight: z.number(),
        })
      )
      .query(async ({ input }) => {
        return db.validateTargetWeight(input.breed, input.growingPeriod, input.targetWeight);
      }),

    // Automatic activation
    autoActivateFlocks: protectedProcedure
      .mutation(async ({ ctx }) => {
        const count = await db.autoActivateFlocks();
        await db.logUserActivity(
          ctx.user.id,
          "auto_activate_flocks",
          "system",
          0,
          `Auto-activated ${count} flocks`
        );
        return { count };
      }),

    // Manual status change
    changeStatus: protectedProcedure
      .input(
        z.object({
          flockId: z.number(),
          status: z.enum(["planned", "active", "completed", "cancelled"]),
          reason: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.manuallyChangeFlockStatus(
          input.flockId,
          input.status,
          ctx.user.id,
          input.reason
        );
        await db.logUserActivity(
          ctx.user.id,
          "change_flock_status",
          "flock",
          input.flockId,
          `Changed flock ${input.flockId} status to ${input.status}: ${input.reason}`
        );
        return { success: true };
      }),

    // Get status history
    getStatusHistory: protectedProcedure
      .input(z.object({ flockId: z.number() }))
      .query(async ({ input }) => {
        return await db.getFlockStatusHistory(input.flockId);
      }),

    // Get activity logs for flock
    getActivityLogs: protectedProcedure
      .input(z.object({ flockId: z.number() }))
      .query(async ({ input }) => {
        return await db.getFlockActivityLogs(input.flockId);
      }),
  }),

  // ============================================================================
  // CUSTOMER MANAGEMENT
  // ============================================================================
  customers: router({
    list: protectedProcedure
      .input(
        z
          .object({
            segment: z.enum(["wholesale", "retail", "contract"]).optional(),
            isActive: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await db.listCustomers(input);
      }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getCustomerById(input.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          customerNumber: z.string().min(1),
          name: z.string().min(1),
          contactPerson: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          whatsapp: z.string().optional(),
          segment: z.enum(["wholesale", "retail", "contract"]).default("retail"),
          creditLimit: z.number().int().default(0),
          paymentTerms: z.string().default("cash"),
          taxNumber: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.createCustomer({ ...input, createdBy: ctx.user.id });
        await db.logUserActivity(ctx.user.id, "create_customer", "customer", undefined, `Created customer: ${input.name}`);
        return { success: true };
      }),

    getAddresses: protectedProcedure.input(z.object({ customerId: z.number() })).query(async ({ input }) => {
      return await db.getCustomerAddresses(input.customerId);
    }),
  }),

  // ============================================================================
  // SUPPLIER MANAGEMENT
  // ============================================================================
  suppliers: router({
    list: protectedProcedure
      .input(
        z
          .object({
            category: z.string().optional(),
            isActive: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await db.listSuppliers(input);
      }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getSupplierById(input.id);
    }),
  }),

  // ============================================================================
  // REMINDERS & ALERTS
  // ============================================================================
  reminders: router({
    list: protectedProcedure
      .input(
        z
          .object({
            flockId: z.number().optional(),
            houseId: z.number().optional(),
            status: z.enum(["pending", "completed", "dismissed"]).optional(),
            priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
            startDate: z.date().optional(),
            endDate: z.date().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await db.listReminders(input);
      }),

    getToday: protectedProcedure.query(async () => {
      return await db.getTodayReminders();
    }),

    getUpcoming: protectedProcedure
      .input(z.object({ days: z.number().default(7) }))
      .query(async ({ input }) => {
        return await db.getUpcomingReminders(input.days);
      }),

    listAll: protectedProcedure.query(async () => {
      return await db.listAllRemindersWithFlockInfo();
    }),

  getCompletedHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().optional(),
        status: z.enum(["completed", "dismissed", "all"]).optional(),
        priority: z.enum(["urgent", "high", "medium", "low", "all"]).optional(),
        dateRange: z.enum(["7", "30", "90", "all"]).optional(),
      })
    )
    .query(async ({ input }) => {
        const filters: any = {};
        
        // Status filter
        if (input?.status && input.status !== "all") {
          filters.status = input.status;
        } else {
          // Get both completed and dismissed
          filters.statusIn = ["completed", "dismissed"];
        }
        
        // Priority filter
        if (input?.priority && input.priority !== "all") {
          filters.priority = input.priority;
        }
        
        // Date range filter - for history, filter by completion date
        if (input?.dateRange && input.dateRange !== "all") {
          const days = parseInt(input.dateRange);
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(endDate.getDate() - days);
          filters.completedStartDate = startDate;
          filters.completedEndDate = endDate;
        }
        
        return await db.listReminders(filters);
      }),

    create: protectedProcedure
      .input(
        z.object({
          flockId: z.number().optional(),
          houseId: z.number().optional(),
          reminderType: z.enum([
            "vaccination",
            "feed_transition",
            "house_preparation",
            "environmental_check",
            "routine_task",
            "milestone",
            "biosecurity",
            "performance_alert",
          ]),
          title: z.string(),
          description: z.string().optional(),
          dueDate: z.date(),
          priority: z.enum(["urgent", "high", "medium", "low"]).default("medium"),
        })
      )
      .mutation(async ({ input }) => {
        return await db.createReminder(input);
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "completed", "dismissed"]),
          completedBy: z.number().optional(),
          actionNotes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return await db.updateReminderStatus(input.id, input.status, ctx.user?.id, input.actionNotes);
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return await db.deleteReminder(input.id);
    }),

    generateForFlock: protectedProcedure
      .input(z.object({ flockId: z.number() }))
      .mutation(async ({ input }) => {
        return await db.generateFlockReminders(input.flockId);
      }),

    syncFromTemplate: protectedProcedure
      .input(z.object({ flockId: z.number(), templateId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.syncFlockRemindersFromTemplate(input.flockId, input.templateId);
        await db.logUserActivity(ctx.user.id, "sync_reminders", "reminder", input.flockId, `Synced reminders from template ${input.templateId} for flock ${input.flockId}`);
        return result;
      }),

    getFlocksUsingTemplate: protectedProcedure
      .input(z.object({ templateId: z.number() }))
      .query(async ({ input }) => {
        return await db.getFlocksUsingTemplate(input.templateId);
      }),
  }),

  // ============================================================================
  // HEALTH MANAGEMENT
  // ============================================================================
  health: router({
    listVaccines: protectedProcedure.query(async () => {
      return await db.listVaccines();
    }),

    listStressPacks: protectedProcedure.query(async () => {
      return await db.listStressPacks();
    }),

    getVaccineById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getVaccineById(input.id);
      }),

    getStressPackById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getStressPackById(input.id);
      }),

    createVaccine: protectedProcedure
      .input(z.object({
        name: z.string(),
        brand: z.string(),
        manufacturer: z.string().optional(),
        diseaseType: z.enum(["newcastle_disease", "infectious_bronchitis", "gumboro", "mareks", "coccidiosis", "fowl_pox", "other"]),
        vaccineType: z.enum(["live", "inactivated", "recombinant", "vector"]),
        applicationMethod: z.enum(["drinking_water", "spray", "eye_drop", "injection", "wing_web"]),
        dosagePerBird: z.string().optional(),
        boosterIntervalDays: z.number().optional(),
        instructions: z.string().optional(),
        withdrawalPeriodDays: z.number().optional(),
        storageTemperature: z.string().optional(),
        shelfLifeDays: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createVaccine(input);
      }),

    updateVaccine: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        brand: z.string(),
        manufacturer: z.string().optional(),
        diseaseType: z.enum(["newcastle_disease", "infectious_bronchitis", "gumboro", "mareks", "coccidiosis", "fowl_pox", "other"]),
        vaccineType: z.enum(["live", "inactivated", "recombinant", "vector"]),
        applicationMethod: z.enum(["drinking_water", "spray", "eye_drop", "injection", "wing_web"]),
        dosagePerBird: z.string().optional(),
        boosterIntervalDays: z.number().optional(),
        instructions: z.string().optional(),
        withdrawalPeriodDays: z.number().optional(),
        storageTemperature: z.string().optional(),
        shelfLifeDays: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.updateVaccine(input);
      }),

    deleteVaccine: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteVaccine(input.id);
      }),

    createStressPack: protectedProcedure
      .input(z.object({
        name: z.string(),
        brand: z.string(),
        dosageStrength: z.enum(["single", "double", "triple"]).optional(),
        recommendedDurationDays: z.number(),
        instructions: z.string().optional(),
        costPerKg: z.string().optional(),
        activeIngredients: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createStressPack(input);
      }),

    updateStressPack: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        brand: z.string().optional(),
        dosageStrength: z.enum(["single", "double", "triple"]).optional(),
        recommendedDurationDays: z.number(),
        instructions: z.string().optional(),
        costPerKg: z.string().optional(),
        activeIngredients: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.updateStressPack(input);
      }),

    deleteStressPack: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteStressPack(input.id);
      }),

    // Health Protocol Templates
    listProtocolTemplates: protectedProcedure.query(async () => {
      return await db.getHealthProtocolTemplates();
    }),

    getProtocolTemplateById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getHealthProtocolTemplateById(input.id);
      }),

    createProtocolTemplate: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        vaccinationSchedules: z.array(z.object({
          vaccineId: z.number(),
          scheduledDay: z.number(),
        })).default([]),
        stressPackSchedules: z.array(z.object({
          stressPackId: z.number(),
          startDay: z.number(),
          endDay: z.number(),
          dosageStrength: z.enum(["single", "double", "triple"]).default("single"),
        })).default([]),
        isDefault: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createHealthProtocolTemplate({
          name: input.name,
          description: input.description,
          vaccinationSchedules: input.vaccinationSchedules,
          stressPackSchedules: input.stressPackSchedules,
          isDefault: input.isDefault,
          createdBy: ctx.user.id,
        });
        await db.logUserActivity(ctx.user.id, "create_health_protocol", "health_protocol_template", (result as any)[0]?.insertId, `Created health protocol template "${input.name}"`);
        return { success: true, id: (result as any)[0]?.insertId };
      }),

    updateProtocolTemplate: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        vaccinationSchedules: z.array(z.object({
          vaccineId: z.number(),
          scheduledDay: z.number(),
        })).optional(),
        stressPackSchedules: z.array(z.object({
          stressPackId: z.number(),
          startDay: z.number(),
          endDay: z.number(),
          dosageStrength: z.enum(["single", "double", "triple"]).default("single"),
        })).optional(),
        isDefault: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateHealthProtocolTemplate(id, data);
        await db.logUserActivity(ctx.user.id, "update_health_protocol", "health_protocol_template", id, `Updated health protocol template`);
        return { success: true };
      }),

    deleteProtocolTemplate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteHealthProtocolTemplate(input.id);
        await db.logUserActivity(ctx.user.id, "delete_health_protocol", "health_protocol_template", input.id, `Deleted health protocol template`);
        return { success: true };
      }),
  }),

  // ============================================================================
  // REMINDER TEMPLATES
  // ============================================================================
  reminderTemplates: router({
    list: protectedProcedure.query(async () => {
      return await db.listReminderTemplates();
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        reminderType: z.enum(["vaccination", "feed_transition", "house_preparation", "environmental_check", "routine_task", "milestone", "biosecurity", "performance_alert"]),
        priority: z.enum(["urgent", "high", "medium", "low"]),
        dayOffset: z.number(),
      }))
      .mutation(async ({ input }) => {
        return await db.createReminderTemplate(input);
      }),

    createBundle: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        templateIds: z.array(z.number()).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createBundleTemplate(input.name, input.description, input.templateIds);
        await db.logUserActivity(ctx.user.id, "create_bundle_template", "reminder_template", result.id, `Created bundle template "${input.name}" with ${input.templateIds.length} templates`);
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        description: z.string().optional(),
        reminderType: z.enum(["vaccination", "feed_transition", "house_preparation", "environmental_check", "routine_task", "milestone", "biosecurity", "performance_alert"]),
        priority: z.enum(["urgent", "high", "medium", "low"]),
        dayOffset: z.number(),
      }))
      .mutation(async ({ input }) => {
        return await db.updateReminderTemplate(input);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteReminderTemplate(input.id);
      }),

    updateBundle: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        description: z.string().optional(),
        bundleConfig: z.any(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.updateBundleTemplate(input.id, input.name, input.description, input.bundleConfig);
        await db.logUserActivity(ctx.user.id, "update_bundle_template", "reminder_template", input.id, `Updated bundle template "${input.name}"`);
        return result;
      }),

    addToFlock: protectedProcedure
      .input(z.object({ flockId: z.number(), templateId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const flock = await db.getFlockById(input.flockId);
        if (!flock) throw new TRPCError({ code: "NOT_FOUND" });
        
        // Use generateRemindersFromTemplates to handle both single and bundle templates
        const reminderCount = await db.generateRemindersFromTemplates(input.flockId, [input.templateId]);
        
        await db.logUserActivity(ctx.user.id, "add_template_to_flock", "reminder", input.flockId, `Added template ${input.templateId} to flock ${input.flockId} (${reminderCount} reminders)`);
        return { success: true, reminderCount };
      }),

    removeFromFlock: protectedProcedure
      .input(z.object({ flockId: z.number(), templateId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRemindersByTemplate(input.flockId, input.templateId);
        await db.logUserActivity(ctx.user.id, "remove_template_from_flock", "reminder", input.flockId, `Removed template ${input.templateId} from flock ${input.flockId}`);
        return { success: true };
      }),

    getAppliedTemplates: protectedProcedure
      .input(z.object({ flockId: z.number() }))
      .query(async ({ input }) => {
        return await db.getAppliedTemplatesForFlock(input.flockId);
      }),

    copyAndCustomize: protectedProcedure
      .input(z.object({
        sourceTemplateId: z.number(),
        newName: z.string(),
        bundleConfig: z.any(), // JSON array of customized categories
      }))
      .mutation(async ({ input, ctx }) => {
        const newTemplate = await db.copyAndCustomizeTemplate(
          input.sourceTemplateId,
          input.newName,
          input.bundleConfig
        );
        await db.logUserActivity(ctx.user.id, "copy_template", "reminder_template", input.sourceTemplateId, `Copied template to create "${input.newName}"`);
        return { success: true, templateId: newTemplate.id };
      }),
  }),

  // ============================================================================
  // CATCH OPERATIONS
  // ============================================================================
  catch: catchRouter,
  density: densityRouter,

  // ============================================================================
  // SLAUGHTER TRACKING
  // ============================================================================
  // slaughter: slaughterRouter, // Temporarily disabled - missing database schema

  // ============================================================================
  // HARVEST MANAGEMENT
  // ============================================================================
  harvest: harvestRouter,
  processor: processorRouter,
  harvestAnalytics: harvestAnalyticsRouter,

  // ============================================================================
  // ANALYTICS & DASHBOARD
  // ============================================================================
  analytics: router({
    dashboard: protectedProcedure.query(async () => {
      const activeFlocks = await db.getActiveFlockCount();
      const totalCustomers = await db.getTotalCustomerCount();
      const now = new Date();
      const monthlyRevenue = await db.getMonthlyRevenue(now.getFullYear(), now.getMonth() + 1);

      return {
        activeFlocks,
        totalCustomers,
        monthlyRevenue,
        // Additional KPIs will be calculated here
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
