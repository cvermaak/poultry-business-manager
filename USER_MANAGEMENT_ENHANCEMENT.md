# User Management Enhancement - Complete User Lifecycle

## Problem Solved
Previously, deactivating a user prevented creating a new user with the same username or email, causing "user already exists" errors. There was no way to reactivate deactivated users or permanently remove them.

## Solution
Added complete user lifecycle management with four actions: Change Role, Reset Password, Deactivate/Reactivate, and Delete.

---

## Changes Made

### Backend Changes

#### 1. Add deleteUser function to server/db.ts

**Location**: After `activateUser` function (around line 270)

```typescript
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db.delete(users).where(eq(users.id, userId));
  return true;
}
```

#### 2. Update activate procedure and add delete procedure to server/routers.ts

**Location**: In the `users` router (around line 260-278)

**Change 1**: Add activity logging to activate procedure

```typescript
// Activate user
activate: adminProcedure
  .input(z.object({ userId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    await db.activateUser(input.userId);
    await db.logUserActivity(ctx.user.id, "activate_user", "user", input.userId, `Activated user`);
    return { success: true };
  }),
```

**Change 2**: Add delete procedure after activate

```typescript
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
```

---

### Frontend Changes

#### File: client/src/pages/UserManagement.tsx

**Change 1**: Update imports (line 11)

```typescript
import { Users, Shield, UserCog, AlertTriangle, Check, X, Key, UserX, UserCheck, Trash2 } from "lucide-react";
```

**Change 2**: Add state for delete dialog (around line 28-29)

```typescript
const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
const [userToDelete, setUserToDelete] = useState<{ id: number; name: string } | null>(null);
```

**Change 3**: Add mutations for reset password, deactivate, activate, and delete (after updateRoleMutation, around line 45-85)

```typescript
const resetPasswordMutation = trpc.users.resetPassword.useMutation({
  onSuccess: (data) => {
    toast.success(`Password reset! Temporary password: ${data.temporaryPassword}`);
    refetch();
  },
  onError: (error) => {
    toast.error(`Failed to reset password: ${error.message}`);
  },
});

const deactivateMutation = trpc.users.deactivate.useMutation({
  onSuccess: () => {
    toast.success("User deactivated successfully");
    refetch();
  },
  onError: (error) => {
    toast.error(`Failed to deactivate user: ${error.message}`);
  },
});

const activateMutation = trpc.users.activate.useMutation({
  onSuccess: () => {
    toast.success("User activated successfully");
    refetch();
  },
  onError: (error) => {
    toast.error(`Failed to activate user: ${error.message}`);
  },
});

const deleteMutation = trpc.users.delete.useMutation({
  onSuccess: () => {
    toast.success("User deleted permanently");
    refetch();
    setIsDeleteDialogOpen(false);
    setUserToDelete(null);
  },
  onError: (error) => {
    toast.error(`Failed to delete user: ${error.message}`);
  },
});
```

**Change 4**: Replace the Actions column in the table (around line 217-270)

Replace the single "Change Role" button with:

```typescript
<TableCell className="text-right">
  <div className="flex justify-end gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => handleRoleChange(user.id, user.name || "", user.role)}
      disabled={user.id === currentUser?.id}
      title="Change user role"
    >
      <UserCog className="h-4 w-4" />
    </Button>
    <Button
      variant="outline"
      size="sm"
      onClick={() => resetPasswordMutation.mutate({ userId: user.id })}
      disabled={user.id === currentUser?.id || !user.passwordHash}
      title="Reset password"
    >
      <Key className="h-4 w-4" />
    </Button>
    {user.isActive ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => deactivateMutation.mutate({ userId: user.id })}
        disabled={user.id === currentUser?.id}
        title="Deactivate user"
      >
        <UserX className="h-4 w-4" />
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        onClick={() => activateMutation.mutate({ userId: user.id })}
        title="Reactivate user"
      >
        <UserCheck className="h-4 w-4" />
      </Button>
    )}
    <Button
      variant="destructive"
      size="sm"
      onClick={() => {
        setUserToDelete({ id: user.id, name: user.name || "Unknown" });
        setIsDeleteDialogOpen(true);
      }}
      disabled={user.id === currentUser?.id}
      title="Delete user permanently"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
</TableCell>
```

**Change 5**: Add delete confirmation dialog (before closing `</div>`, around line 336-369)

```typescript
{/* Delete Confirmation Dialog */}
<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        Delete User Permanently?
      </DialogTitle>
      <DialogDescription>
        This action cannot be undone. This will permanently delete the user account for <strong>{userToDelete?.name}</strong> and remove all associated data.
      </DialogDescription>
    </DialogHeader>
    <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 space-y-2">
      <p className="text-sm font-medium text-destructive">Warning:</p>
      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
        <li>User will be permanently removed from the database</li>
        <li>All user activity logs will be preserved</li>
        <li>User cannot be recovered after deletion</li>
      </ul>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        onClick={() => userToDelete && deleteMutation.mutate({ userId: userToDelete.id })}
        disabled={deleteMutation.isPending}
      >
        {deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Features

### 1. **Change Role** (UserCog icon)
- Updates user's role (admin, farm_manager, accountant, sales_staff, production_worker)
- Disabled for your own account
- Opens dialog to select new role

### 2. **Reset Password** (Key icon)
- Generates temporary password
- Displays password in toast notification
- Disabled for OAuth users (no password hash)
- Disabled for your own account

### 3. **Deactivate/Reactivate** (UserX/UserCheck icon)
- **Deactivate**: Temporarily disables user (sets `isActive = false`)
- **Reactivate**: Re-enables deactivated user (sets `isActive = true`)
- Button changes based on user status
- Disabled for your own account

### 4. **Delete** (Trash2 icon, red)
- Permanently removes user from database
- Shows confirmation dialog with warnings
- Cannot be undone
- Disabled for your own account
- Activity logs are preserved

---

## User Workflow

### Scenario 1: Temporary Suspension
1. Admin deactivates user (UserX button)
2. User cannot log in (status shows "Inactive")
3. Admin reactivates user later (UserCheck button)
4. User can log in again

### Scenario 2: Employee Departure
1. Admin deactivates user first (optional, for grace period)
2. Admin permanently deletes user (Trash2 button)
3. Confirms deletion in dialog
4. User record removed, can create new user with same email/username

### Scenario 3: Password Reset
1. User forgets password
2. Admin clicks Reset Password (Key button)
3. Temporary password shown in toast
4. Admin shares password with user
5. User logs in and changes password

---

## Database Changes

**No schema changes required** - uses existing `isActive` field and adds `deleteUser` function.

---

## Testing Checklist

- [x] Deactivate user → status shows "Inactive" → Reactivate button appears
- [x] Reactivate user → status shows "Active" → Deactivate button appears
- [x] Reset password → temporary password displayed in toast
- [x] Delete user → confirmation dialog appears → user removed from database
- [x] Cannot deactivate/delete own account
- [x] Cannot reset password for OAuth users
- [x] Can create new user with same email/username after deletion

---

## Summary

This enhancement provides complete user lifecycle management, solving the "user already exists" issue and giving admins full control over user accounts. Users can now be temporarily suspended (deactivate), restored (reactivate), or permanently removed (delete) as needed.
