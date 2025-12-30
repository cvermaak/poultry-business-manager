import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Suppliers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
        <p className="text-muted-foreground">Manage your supplier relationships</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Supplier Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Supplier management interface coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
