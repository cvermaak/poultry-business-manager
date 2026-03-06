import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, Shield, UserCog, AlertTriangle, Check, X, Key, UserX, UserCheck, Trash2, UserPlus } from "lucide-react";

const ROLES = [
  { value: "admin", label: "Admin", description: "Full system access", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { value: "farm_manager", label: "Farm Manager", description: "Manage flocks, houses, and production", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "accountant", label: "Accountant", description: "Financial management and reporting", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "sales_staff", label: "Sales Staff", description: "Customer and sales management", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "production_worker", label: "Production Worker", description: "Daily data entry and records", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
] as const;

type RoleValue = typeof ROLES[number]["value"];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState<RoleValue | "">("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "" as RoleValue | "",
  });

  const { data: users, isLoading, refetch } = trpc.users.list.useQuery();
  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("User role updated successfully");
      refetch();
      setIsDialogOpen(false);
      setSelectedUser(null);
      setNewRole("");
    },
    onError: (error) => {
      toast.error(`Failed to update role: ${error.message}`);
    },
  });

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

  const createUserMutation = trpc.users.create.useMutation({
    onSuccess: (data) => {
      toast.success(`User created! Temporary password: ${data.temporaryPassword}`);
      refetch();
      setIsCreateDialogOpen(false);
      setNewUserData({ name: "", email: "", username: "", password: "", role: "" });
    },
    onError: (error) => {
      toast.error(`Failed to create user: ${error.message}`);
    },
  });

  const getRoleBadge = (role: string) => {
    const roleConfig = ROLES.find((r) => r.value === role);
    if (!roleConfig) return <Badge variant="outline">{role}</Badge>;
    return (
      <Badge className={roleConfig.color}>
        {roleConfig.label}
      </Badge>
    );
  };

  const handleRoleChange = (userId: number, userName: string, currentRole: string) => {
    setSelectedUser({ id: userId, name: userName || "Unknown User", currentRole });
    setNewRole("");
    setIsDialogOpen(true);
  };

  const confirmRoleChange = () => {
    if (!selectedUser || !newRole) return;
    updateRoleMutation.mutate({ userId: selectedUser.id, role: newRole });
  };

  // Check if current user is admin
  if (currentUser?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="h-16 w-16 text-yellow-500" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">You need admin privileges to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Manage user accounts and assign roles</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create New User
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Admin Only</span>
          </div>
        </div>
      </div>

      {/* Role Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Role Permissions
          </CardTitle>
          <CardDescription>Overview of available roles and their access levels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {ROLES.map((role) => (
              <div key={role.value} className="border rounded-lg p-3 space-y-2">
                <Badge className={role.color}>{role.label}</Badge>
                <p className="text-xs text-muted-foreground">{role.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users
          </CardTitle>
          <CardDescription>
            {users?.length || 0} registered users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : users && users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name || "—"}
                      {user.id === currentUser?.id && (
                        <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                      )}
                    </TableCell>
                    <TableCell>{user.email || "—"}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <Check className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          <X className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.lastSignedIn
                        ? new Date(user.lastSignedIn).toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Never"}
                    </TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No users found</h3>
              <p className="text-sm text-muted-foreground">Users will appear here once they sign in.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Change Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the role for <strong>{selectedUser?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Role</label>
              <div>{selectedUser && getRoleBadge(selectedUser.currentRole)}</div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Role</label>
              <Select value={newRole} onValueChange={(value) => setNewRole(value as RoleValue)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a new role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem
                      key={role.value}
                      value={role.value}
                      disabled={role.value === selectedUser?.currentRole}
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={role.color}>{role.label}</Badge>
                        <span className="text-xs text-muted-foreground">— {role.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmRoleChange}
              disabled={!newRole || updateRoleMutation.isPending}
            >
              {updateRoleMutation.isPending ? "Updating..." : "Confirm Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Create a new user account. A temporary password will be generated automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={newUserData.name}
                onChange={(e) => setNewUserData({ ...newUserData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={newUserData.email}
                onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                placeholder="johndoe"
                value={newUserData.username}
                onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select value={newUserData.role} onValueChange={(value) => setNewUserData({ ...newUserData, role: value as RoleValue })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{role.label}</span>
                        <span className="text-xs text-muted-foreground">{role.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <strong>Note:</strong> A temporary password will be generated and displayed after creation. The user must change it on first login.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!newUserData.name || !newUserData.email || !newUserData.username || !newUserData.role) {
                  toast.error("Please fill in all required fields");
                  return;
                }
                createUserMutation.mutate({
                  name: newUserData.name,
                  email: newUserData.email,
                  username: newUserData.username,
                  role: newUserData.role,
                });
              }}
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
