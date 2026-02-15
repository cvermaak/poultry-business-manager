import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, ArrowLeft, Trash2 } from "lucide-react";
import SlaughterBatchForm from "@/components/SlaughterBatchForm";
import SlaughterCatchForm from "@/components/SlaughterCatchForm";
import SlaughterhouseDataForm from "@/components/SlaughterhouseDataForm";

export default function SlaughterManagement() {
  const { flockId } = useParams<{ flockId: string }>();
  const [, setLocation] = useLocation();
  const [showNewBatchForm, setShowNewBatchForm] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  const flockIdNum = parseInt(flockId || "0", 10);

  // Get flock details
  const { data: flock } = trpc.flocks.getById.useQuery({ id: flockIdNum });

  // Get all slaughter batches for this flock
  const { data: batches, isLoading: batchesLoading, refetch: refetchBatches } =
    trpc.slaughter.getBatchesByFlock.useQuery({ flockId: flockIdNum });

  // Get selected batch details
  const { data: selectedBatch, refetch: refetchBatch } =
    trpc.slaughter.getBatchById.useQuery(
      { batchId: selectedBatchId || 0 },
      { enabled: !!selectedBatchId }
    );

  const deleteCatchRecord = trpc.slaughter.deleteCatchRecord.useMutation({
    onSuccess: () => {
      refetchBatch();
      refetchBatches();
    },
  });

  const handleDeleteCatchRecord = (catchRecordId: number) => {
    if (
      confirm(
        "Are you sure you want to delete this catch record? This action cannot be undone."
      )
    ) {
      deleteCatchRecord.mutate({ catchRecordId });
    }
  };

  if (!flock) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">Loading flock...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/flocks/${flockIdNum}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{flock.flockNumber}</h1>
            <p className="text-sm text-muted-foreground">Slaughter Management</p>
          </div>
        </div>
        {!showNewBatchForm && (
          <Button onClick={() => setShowNewBatchForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Slaughter Batch
          </Button>
        )}
      </div>

      {/* New Batch Form */}
      {showNewBatchForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Slaughter Batch</CardTitle>
          </CardHeader>
          <CardContent>
            <SlaughterBatchForm
              flockId={flockIdNum}
              onSuccess={() => {
                setShowNewBatchForm(false);
                refetchBatches();
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Batches List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Slaughter Batches</h2>
        {batchesLoading ? (
          <div className="text-center text-muted-foreground">
            Loading batches...
          </div>
        ) : !batches || batches.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No slaughter batches yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {batches.map((batch) => (
              <Card
                key={batch.id}
                className={`cursor-pointer transition-colors ${
                  selectedBatchId === batch.id
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50"
                }`}
                onClick={() => setSelectedBatchId(batch.id)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {batch.batchNumber}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Started:{" "}
                        {new Date(batch.startDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {batch.totalBirdsSold || 0} birds
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {batch.status}
                      </p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Selected Batch Details */}
      {selectedBatchId && selectedBatch && (
        <Tabs defaultValue="catch-records" className="w-full">
          <TabsList>
            <TabsTrigger value="catch-records">Catch Records</TabsTrigger>
            <TabsTrigger value="slaughterhouse-data">
              Slaughterhouse Data
            </TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>

          {/* Catch Records Tab */}
          <TabsContent value="catch-records" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add Catch Record</CardTitle>
              </CardHeader>
              <CardContent>
                <SlaughterCatchForm
                  batchId={selectedBatchId}
                  onSuccess={() => refetchBatch()}
                />
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h3 className="font-semibold">Catch Records</h3>
              {selectedBatch.catchRecords.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No catch records yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {selectedBatch.catchRecords.map((record) => (
                    <Card key={record.id}>
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Date
                            </p>
                            <p className="font-medium">
                              {new Date(record.catchDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Birds Caught
                            </p>
                            <p className="font-medium">{record.birdsCaught}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Farm Weight
                            </p>
                            <p className="font-medium">
                              {parseFloat(
                                record.averageWeightAtFarm.toString()
                              ).toFixed(3)}{" "}
                              kg
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Est. Slaughterhouse
                            </p>
                            <p className="font-medium">
                              {parseFloat(
                                record.estimatedWeightAtSlaughterhouse.toString()
                              ).toFixed(3)}{" "}
                              kg
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Shrinkage
                            </p>
                            <p className="font-medium">
                              {parseFloat(
                                record.totalShrinkagePercent.toString()
                              ).toFixed(2)}
                              %
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Feed Removal
                            </p>
                            <p className="font-medium">
                              {record.feedRemovalHours}h
                            </p>
                          </div>
                          {record.slaughterhouseRecord && (
                            <>
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  Actual Weight
                                </p>
                                <p className="font-medium">
                                  {parseFloat(
                                    record.slaughterhouseRecord.actualWeightAtSlaughterhouse.toString()
                                  ).toFixed(3)}{" "}
                                  kg
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  Variance
                                </p>
                                <p className="font-medium">
                                  {parseFloat(
                                    record.slaughterhouseRecord.variance.toString()
                                  ).toFixed(3)}{" "}
                                  kg (
                                  {parseFloat(
                                    record.slaughterhouseRecord.variancePercent.toString()
                                  ).toFixed(2)}
                                  %)
                                </p>
                              </div>
                            </>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleDeleteCatchRecord(record.id)
                              }
                              disabled={deleteCatchRecord.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Slaughterhouse Data Tab */}
          <TabsContent value="slaughterhouse-data" className="space-y-4">
            <div className="space-y-2">
              {selectedBatch.catchRecords.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No catch records to add slaughterhouse data.
                  </CardContent>
                </Card>
              ) : (
                selectedBatch.catchRecords.map((record) => (
                  <Card key={record.id}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {new Date(record.catchDate).toLocaleDateString()} - Day{" "}
                        {record.dayNumber}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {record.slaughterhouseRecord ? (
                        <div className="grid gap-2">
                          <p className="text-sm">
                            <span className="font-medium">Actual Weight:</span>{" "}
                            {parseFloat(
                              record.slaughterhouseRecord.actualWeightAtSlaughterhouse.toString()
                            ).toFixed(3)}{" "}
                            kg
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Variance:</span>{" "}
                            {parseFloat(
                              record.slaughterhouseRecord.variance.toString()
                            ).toFixed(3)}{" "}
                            kg (
                            {parseFloat(
                              record.slaughterhouseRecord.variancePercent.toString()
                            ).toFixed(2)}
                            %)
                          </p>
                        </div>
                      ) : (
                        <SlaughterhouseDataForm
                          catchRecordId={record.id}
                          estimatedWeight={parseFloat(
                            record.estimatedWeightAtSlaughterhouse.toString()
                          )}
                          onSuccess={() => refetchBatch()}
                        />
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <CardTitle>Batch Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Birds Caught
                    </p>
                    <p className="text-2xl font-bold">
                      {selectedBatch.totalBirdsCaught}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Avg Farm Weight
                    </p>
                    <p className="text-2xl font-bold">
                      {selectedBatch.avgFarmWeight.toFixed(3)} kg
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Avg Est. Slaughterhouse Weight
                    </p>
                    <p className="text-2xl font-bold">
                      {selectedBatch.avgEstimatedSlaughterhouseWeight.toFixed(
                        3
                      )}{" "}
                      kg
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Catch Records
                    </p>
                    <p className="text-2xl font-bold">
                      {selectedBatch.catchRecords.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
