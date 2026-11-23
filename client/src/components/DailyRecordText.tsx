import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Read-only display: the complete original string is never shortened or saved. */
export function DailyRecordText({ text, label, emptyText = "—" }: {
  text: string | null | undefined;
  label: string;
  emptyText?: string;
}) {
  if (text == null || !text.trim()) return <span>{emptyText}</span>;

  return (
    <Dialog>
      <div className="min-w-0">
        <div
          data-daily-text-preview=""
          className="line-clamp-2 max-h-10 overflow-hidden whitespace-normal leading-5 [overflow-wrap:anywhere]"
        >
          {text}
        </div>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="link"
            className="h-auto px-0 py-0.5 text-xs"
            aria-label={`View full text: ${label}`}
          >
            View full text
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Full text from this daily record.</DialogDescription>
        </DialogHeader>
        <div
          data-daily-text-full=""
          className="max-h-[60vh] min-w-0 overflow-y-auto whitespace-pre-wrap text-sm [overflow-wrap:anywhere]"
        >
          {text}
        </div>
      </DialogContent>
    </Dialog>
  );
}
