export type StressPackAdministrationStatus = "scheduled" | "active" | "completed" | "cancelled";

export function validateStressPackAdministration(input: {
  status: StressPackAdministrationStatus | null | undefined;
  quantityUsed: string;
  administeredAt: Date;
  now?: Date;
}): { ok: true } | { ok: false; error: string } {
  if (input.status !== "scheduled" && input.status !== "active") {
    return { ok: false, error: "Only scheduled or active stress-pack periods can be administered." };
  }

  if (!input.quantityUsed.trim()) {
    return { ok: false, error: "Quantity used is required when recording a stress-pack administration." };
  }

  if (Number.isNaN(input.administeredAt.getTime())) {
    return { ok: false, error: "Enter a valid administration date and time." };
  }

  if (input.administeredAt.getTime() > (input.now ?? new Date()).getTime()) {
    return { ok: false, error: "Administration time cannot be in the future." };
  }

  return { ok: true };
}
