import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const catchRecordSchema = z.object({
  catchDate: z.string().min(1, "Catch date is required"),
  dayNumber: z.string().min(1, "Day number is required"),
  birdsCaught: z.string().min(1, "Number of birds is required"),
  averageWeightAtFarm: z.string().min(1, "Average weight is required"),
  feedRemovalHours: z.string().min(1, "Feed removal hours is required"),
  notes: z.string().optional(),
});

type CatchRecordInput = z.infer<typeof catchRecordSchema>;

interface SlaughterCatchFormProps {
  batchId: number;
  onSuccess?: () => void;
}

export default function SlaughterCatchForm({
  batchId,
  onSuccess,
}: SlaughterCatchFormProps) {
  const [formData, setFormData] = useState<CatchRecordInput>({
    catchDate: new Date().toISOString().split("T")[0],
    dayNumber: "",
    birdsCaught: "",
    averageWeightAtFarm: "",
    feedRemovalHours: "6",
    notes: "",
  });
  const [error, setError] = useState<string>("");

  const addCatchRecord = trpc.slaughter.addCatchRecord.useMutation({
    onSuccess: () => {
      setFormData({
        catchDate: new Date().toISOString().split("T")[0],
        dayNumber: "",
        birdsCaught: "",
        averageWeightAtFarm: "",
        feedRemovalHours: "6",
        notes: "",
      });
      setError("");
      onSuccess?.();
    },
    onError: (error) => {
      setError(error.message || "Failed to add catch record");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const validated = catchRecordSchema.parse(formData);
      addCatchRecord.mutate({
        batchId,
        catchDate: new Date(validated.catchDate),
        dayNumber: parseInt(validated.dayNumber, 10),
        birdsCaught: parseInt(validated.birdsCaught, 10),
        averageWeightAtFarm: parseFloat(validated.averageWeightAtFarm),
        feedRemovalHours: parseInt(validated.feedRemovalHours, 10),
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Catch Date</label>
          <Input
            type="date"
            value={formData.catchDate}
            onChange={(e) =>
              setFormData({ ...formData, catchDate: e.target.value })
            }
            disabled={addCatchRecord.isPending}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Day Number</label>
          <Input
            type="number"
            value={formData.dayNumber}
            onChange={(e) =>
              setFormData({ ...formData, dayNumber: e.target.value })
            }
            placeholder="e.g., 35"
            disabled={addCatchRecord.isPending}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Birds Caught
          </label>
          <Input
            type="number"
            value={formData.birdsCaught}
            onChange={(e) =>
              setFormData({ ...formData, birdsCaught: e.target.value })
            }
            placeholder="e.g., 3000"
            disabled={addCatchRecord.isPending}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Average Weight at Farm (kg)
          </label>
          <Input
            type="number"
            step="0.001"
            value={formData.averageWeightAtFarm}
            onChange={(e) =>
              setFormData({
                ...formData,
                averageWeightAtFarm: e.target.value,
              })
            }
            placeholder="e.g., 1.850"
            disabled={addCatchRecord.isPending}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Feed Removal Hours
          </label>
          <Input
            type="number"
            value={formData.feedRemovalHours}
            onChange={(e) =>
              setFormData({ ...formData, feedRemovalHours: e.target.value })
            }
            placeholder="e.g., 6"
            disabled={addCatchRecord.isPending}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Hours from feed removal to catching
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any notes about this catch..."
          disabled={addCatchRecord.isPending}
          rows={2}
        />
      </div>

      <Button type="submit" disabled={addCatchRecord.isPending}>
        {addCatchRecord.isPending ? "Adding..." : "Add Catch Record"}
      </Button>
    </form>
  );
}
