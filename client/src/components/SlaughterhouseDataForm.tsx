import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const slaughterhouseRecordSchema = z.object({
  actualWeightAtSlaughterhouse: z.string().min(1, "Actual weight is required"),
  slaughterhouseReference: z.string().optional(),
  notes: z.string().optional(),
});

type SlaughterhouseRecordInput = z.infer<typeof slaughterhouseRecordSchema>;

interface SlaughterhouseDataFormProps {
  catchRecordId: number;
  estimatedWeight: number;
  onSuccess?: () => void;
}

export default function SlaughterhouseDataForm({
  catchRecordId,
  estimatedWeight,
  onSuccess,
}: SlaughterhouseDataFormProps) {
  const [formData, setFormData] = useState<SlaughterhouseRecordInput>({
    actualWeightAtSlaughterhouse: "",
    slaughterhouseReference: "",
    notes: "",
  });
  const [error, setError] = useState<string>("");

  const addSlaughterhouseRecord =
    trpc.slaughter.addSlaughterhouseRecord.useMutation({
      onSuccess: () => {
        setFormData({
          actualWeightAtSlaughterhouse: "",
          slaughterhouseReference: "",
          notes: "",
        });
        setError("");
        onSuccess?.();
      },
      onError: (error) => {
        setError(error.message || "Failed to add slaughterhouse data");
      },
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const validated = slaughterhouseRecordSchema.parse(formData);
      addSlaughterhouseRecord.mutate({
        catchRecordId,
        actualWeightAtSlaughterhouse: parseFloat(
          validated.actualWeightAtSlaughterhouse
        ),
        slaughterhouseReference: validated.slaughterhouseReference,
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

      <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
        <p className="font-medium">Estimated Weight: {estimatedWeight.toFixed(3)} kg</p>
        <p className="text-xs mt-1">
          This is the expected weight after shrinkage. Compare with actual weight to calculate variance.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Actual Weight at Slaughterhouse (kg)
        </label>
        <Input
          type="number"
          step="0.001"
          value={formData.actualWeightAtSlaughterhouse}
          onChange={(e) =>
            setFormData({
              ...formData,
              actualWeightAtSlaughterhouse: e.target.value,
            })
          }
          placeholder="e.g., 1.735"
          disabled={addSlaughterhouseRecord.isPending}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Slaughterhouse Reference (optional)
        </label>
        <Input
          value={formData.slaughterhouseReference}
          onChange={(e) =>
            setFormData({
              ...formData,
              slaughterhouseReference: e.target.value,
            })
          }
          placeholder="e.g., LOT-12345"
          disabled={addSlaughterhouseRecord.isPending}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any notes from the slaughterhouse..."
          disabled={addSlaughterhouseRecord.isPending}
          rows={2}
        />
      </div>

      <Button type="submit" disabled={addSlaughterhouseRecord.isPending}>
        {addSlaughterhouseRecord.isPending
          ? "Adding..."
          : "Add Slaughterhouse Data"}
      </Button>
    </form>
  );
}
