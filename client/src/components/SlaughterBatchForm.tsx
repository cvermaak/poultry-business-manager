import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const slaughterBatchSchema = z.object({
  batchNumber: z.string().min(1, "Batch number is required"),
  transportTimeHours: z.string().optional(),
  notes: z.string().optional(),
});

type SlaughterBatchInput = z.infer<typeof slaughterBatchSchema>;

interface SlaughterBatchFormProps {
  flockId: number;
  onSuccess?: () => void;
}

export default function SlaughterBatchForm({
  flockId,
  onSuccess,
}: SlaughterBatchFormProps) {
  const [formData, setFormData] = useState<SlaughterBatchInput>({
    batchNumber: "",
    transportTimeHours: "2",
    notes: "",
  });
  const [error, setError] = useState<string>("");

  const createBatch = trpc.slaughter.createBatch.useMutation({
    onSuccess: () => {
      setFormData({
        batchNumber: "",
        transportTimeHours: "2",
        notes: "",
      });
      setError("");
      onSuccess?.();
    },
    onError: (error) => {
      setError(error.message || "Failed to create batch");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const validated = slaughterBatchSchema.parse(formData);
      createBatch.mutate({
        flockId,
        batchNumber: validated.batchNumber,
        transportTimeHours: validated.transportTimeHours
          ? parseFloat(validated.transportTimeHours)
          : undefined,
        notes: validated.notes,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message || "Validation failed");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Batch Number</label>
        <Input
          value={formData.batchNumber}
          onChange={(e) =>
            setFormData({ ...formData, batchNumber: e.target.value })
          }
          placeholder="e.g., BATCH-001"
          disabled={createBatch.isPending}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Transport Time (hours)
        </label>
        <Input
          type="number"
          step="0.5"
          value={formData.transportTimeHours}
          onChange={(e) =>
            setFormData({ ...formData, transportTimeHours: e.target.value })
          }
          placeholder="2"
          disabled={createBatch.isPending}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Typical transport time to slaughterhouse
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any additional notes about this batch..."
          disabled={createBatch.isPending}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={createBatch.isPending}>
        {createBatch.isPending ? "Creating..." : "Create Batch"}
      </Button>
    </form>
  );
}
