import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserPlus, MoreHorizontal, Key, UserX, UserCheck, Copy, AlertCircle, Shield, Users as UsersIcon, CheckCircle2 } from "lucide-react";

const ROLES = [
  { value: "admin", label: "Administrator", description: "Full system access" },
  { value: "farm_manager", label: "Farm Manager", description: "Manage flocks, houses, and health records" },
  { value: "accountant", label: "Accountant", description: "Access to finance and reports" },
  { value: "sales_staff", label: "Sales Staff", description: "Manage customers and sales orders" },
  { value: "production_worker", label: "Production Worker", description: "View and update daily records" },
] as const;

type Role = typeof ROLES[number]["value"];

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case "admin": return "destructive";
    case "farm_manager": return "default";
    case "accountant": return "secondary";
    case "sales_staff": return "outline";
    default: return "outline";
  }
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Form state for creating user
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    name: "",
    role: "production_worker" as Role,
  });

  const { data: users, isLoading } = trpc.users.list.useQuery();

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const createUserMutation = trpc.users.create.useMutation({
    onSuccess: (data) => {
      setNewPassword(data.temporaryPassword);
      utils.users.list.invalidate();
      showNotification("success", `User ${newUser.username} has been created successfully.`);
      setNewUser({ username: "", email: "", name: "", role: "production_worker" });
    },
    onError: (error) => {
      showNotification("error", error.message);
    },
  });

  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      showNotification("success", "User role has been updated.");
    },
    onError: (error) => {
      showNotification("error", error.message);
    },
  });

  const resetPasswordMutation = trpc.users.resetPassword.useMutation({
    onSuccess: (data) => {
      setNewPassword(data.temporaryPassword);
      setIsResetPasswordDialogOpen(true);
      showNotification("success", "A new temporary password has been generated.");
    },
    onError: (error) => {
      showNotification("error", error.message);
    },
  });

  const deactivateMutation = trpc.users.deactivate.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      showNotification("success", "User has been deactivated.");
    },
    onError: (error) => {
      showNotification("error", error.message);
    },
  });

  const activateMutation = trpc.users.activate.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      showNotification("success", "User has been activated.");
    },
    onError: (error) => {
      showNotification("error", error.message);
    },
  });

  const handleCreateUser = () => {
    if (!newUser.username || !newUser.email || !newUser.name) {
      setValidationError("Please fill in all required fields.");
      return;
    }
    setValidationError(null);
    createUserMutation.mutate(newUser);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification("success", "Password copied to clipboard.");
  };

  // Check if current user is admin
  if (currentUser?.role !== "admin") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Manage system users and permissions</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You don't have permission to access this page. Only administrators can manage users.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification Banner */}
      {notification && (
        <Alert variant={notification.type === "error" ? "destructive" : "default"} className="mb-4">
          {notification.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{notification.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Create and manage user accounts</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            setNewPassword(null);
            setValidationError(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to the system. They will receive a temporary password to sign in.
              </DialogDescription>
            </DialogHeader>
            
            {newPassword ? (
              <div className="space-y-4 py-4">
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertTitle>User Created Successfully</AlertTitle>
                  <AlertDescription>
                    Share this temporary password with the user. They will be required to change it on first login.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label>Temporary Password</Label>
                  <div className="flex gap-2">
                    <Input value={newPassword} readOnly className="font-mono" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(newPassword)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => {
                    setIsCreateDialogOpen(false);
                    setNewPassword(null);
                  }}>
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <>
                {validationError && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{validationError}</AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="username">Username *</Label>
                    <Input
                      id="username"
                      placeholder="johndoe"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role">Role *</Label>
                    <Select
                      value={newUser.role}
                      onValueChange={(value: Role) => setNewUser({ ...newUser, role: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            <div className="flex flex-col">
                              <span>{role.label}</span>
                              <span className="text-xs text-muted-foreground">{role.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                    {createUserMutation.isPending ? "Creating..." : "Create User"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Password Reset Dialog */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Reset</DialogTitle>
            <DialogDescription>
              Share this temporary password with the user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <Key className="h-4 w-4" />
              <AlertTitle>New Temporary Password</AlertTitle>
              <AlertDescription>
                The user will be required to change this password on their next login.
              </AlertDescription>
            </Alert>
            {newPassword && (
              <div className="space-y-2">
                <Label>Temporary Password</Label>
                <div className="flex gap-2">
                  <Input value={newPassword} readOnly className="font-mono" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(newPassword)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setIsResetPasswordDialogOpen(false);
              setNewPassword(null);
            }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users?.filter(u => u.isActive).length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Administrators</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users?.filter(u => u.role === "admin").length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Manage user accounts, roles, and access permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading users...</div>
          ) : users && users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Login Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className={!user.isActive ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{user.name || "-"}</TableCell>
                    <TableCell>{user.username || "-"}</TableCell>
                    <TableCell>{user.email || "-"}</TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(value: Role) => {
                          if (user.id === currentUser?.id) {
                            showNotification("error", "You cannot change your own role.");
                            return;
                          }
                          updateRoleMutation.mutate({ userId: user.id, role: value });
                        }}
                        disabled={user.id === currentUser?.id}
                      >
                        <SelectTrigger className="w-[160px]">
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {ROLES.find(r => r.value === user.role)?.label || user.role}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {user.loginMethod === "email" ? "Email/Password" : "Manus OAuth"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "default" : "secondary"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastSignedIn 
                        ? new Date(user.lastSignedIn).toLocaleDateString() 
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {user.loginMethod === "email" && (
                            <DropdownMenuItem
                              onClick={() => {
                                resetPasswordMutation.mutate({ userId: user.id });
                              }}
                            >
                              <Key className="h-4 w-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                          )}
                          {user.id !== currentUser?.id && (
                            <>
                              {user.isActive ? (
                                <DropdownMenuItem
                                  onClick={() => deactivateMutation.mutate({ userId: user.id })}
                                  className="text-destructive"
                                >
                                  <UserX className="h-4 w-4 mr-2" />
                                  Deactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => activateMutation.mutate({ userId: user.id })}
                                >
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Activate
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No users found. Click "Add User" to create the first user.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
