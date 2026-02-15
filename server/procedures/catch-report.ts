import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";
import { getDb } from "../db";
import { catchSessions, catchBatches, flocks, houses } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const generateTransportReportInputSchema = z.object({
  sessionId: z.number(),
  farmName: z.string().min(1, "Farm name is required"),
  processingDate: z.string().min(1, "Processing date is required"),
  lotNumber: z.string().min(1, "Lot number is required"),
  transporter: z.string().optional(),
});

export const catchReportProcedures = {
  generateTransportReport: protectedProcedure
    .input(generateTransportReportInputSchema)
    .mutation(async ({ input }) => {
      // Fetch catch session data
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessionResult = await db
        .select()
        .from(catchSessions)
        .where(eq(catchSessions.id, input.sessionId))
        .limit(1);

      const session = sessionResult[0];

      if (!session) {
        throw new Error("Catch session not found");
      }

      // Fetch all batches for this session
      const batches = await db
        .select()
        .from(catchBatches)
        .where(eq(catchBatches.sessionId, input.sessionId));

      console.log('[Transport Report] Session ID:', input.sessionId);
      console.log('[Transport Report] Batches found:', batches.length);
      console.log('[Transport Report] Session summary - Birds:', session.totalBirdsCaught, 'Crates:', session.totalCrates);

      // Calculate summary statistics
      // If no batches exist (old sessions), fall back to session summary data
      let totalCrates: number;
      let totalBirds: number;
      let avgBirdsPerCrate: number;
      let oddCrates: number;

      if (batches.length === 0) {
        // Use session summary data for old sessions without batch records
        totalCrates = session.totalCrates || 0;
        totalBirds = session.totalBirdsCaught || 0;
        avgBirdsPerCrate = totalCrates > 0 ? Math.round(totalBirds / totalCrates) : 0;
        oddCrates = 0; // Cannot determine odd crates without batch data
        console.log('[Transport Report] Using session summary data (no batches)');
      } else {
        // Calculate from batch data for new sessions
        totalCrates = batches.reduce((sum: number, batch: any) => sum + (batch.numberOfCrates || 0), 0);
        totalBirds = batches.reduce((sum: number, batch: any) => sum + (batch.totalBirds || 0), 0);
        avgBirdsPerCrate = totalCrates > 0 ? Math.round(totalBirds / totalCrates) : 0;
        
        // Find odd crates (crates with different bird count than average)
        oddCrates = batches.filter((batch: any) => {
          const birdsPerCrate = batch.birdsPerCrate || 0;
          return birdsPerCrate !== avgBirdsPerCrate && birdsPerCrate > 0;
        }).length;
        console.log('[Transport Report] Using batch data');
      }

      // Create Word document
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            // Title
            new Paragraph({
              text: "Broiler Transport Report and Checklist",
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),
            
            new Paragraph({
              text: "AFGRO Farming Group",
              heading: HeadingLevel.HEADING_2,
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Farm details table
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Farm", bold: true })] })],
                      width: { size: 33, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Processing Date", bold: true })] })],
                      width: { size: 33, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Transporter", bold: true })] })],
                      width: { size: 34, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph(input.farmName)],
                    }),
                    new TableCell({
                      children: [new Paragraph(input.processingDate)],
                    }),
                    new TableCell({
                      children: [new Paragraph(input.transporter || "N/A")],
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Lot #", bold: true })] })],
                      columnSpan: 3,
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph(input.lotNumber)],
                      columnSpan: 3,
                    }),
                  ],
                }),
              ],
            }),

            new Paragraph({ text: "", spacing: { after: 200 } }),

            // Summary statistics table
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Crates", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Birds / Crate", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Odd # Crates", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Birds", bold: true })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(totalCrates.toString())] }),
                    new TableCell({ children: [new Paragraph(avgBirdsPerCrate.toString())] }),
                    new TableCell({ children: [new Paragraph(oddCrates.toString())] }),
                    new TableCell({ children: [new Paragraph(totalBirds.toString())] }),
                  ],
                }),
              ],
            }),

            new Paragraph({ text: "", spacing: { after: 200 } }),

            // Important notice
            new Paragraph({
              children: [
                new TextRun({
                  text: "Maintaining body temperature of birds while having appropriate ventilation is key at any point of life, but is especially difficult during transport to the processor. It is the responsibility of the farmer to ensure their birds are responsibly loaded for transport. It will be the responsibility of the hauler to have appropriate items to secure the load and ensure the thermal comfort of the birds.",
                  size: 20,
                }),
              ],
              spacing: { after: 300 },
            }),

            // Farmer responsibilities
            new Paragraph({
              text: "Farmer responsibilities",
              heading: HeadingLevel.HEADING_2,
              spacing: { after: 200 },
            }),

            new Paragraph({
              children: [new TextRun({ text: "During hot, dry weather", bold: true })],
              spacing: { after: 100 },
            }),

            new Paragraph({ text: "☐ Appropriate space per bird in each crate (normally 10-12)" }),
            new Paragraph({ text: "☐ Load 10 birds per crate if above average live weights or high temperature weather" }),
            new Paragraph({ text: "☐ Load 9 birds per crate if extremely large birds", spacing: { after: 200 } }),

            new Paragraph({
              children: [new TextRun({ text: "During cold or wet weather", bold: true })],
              spacing: { after: 100 },
            }),

            new Paragraph({ text: "☐ Appropriate space per bird in each crate (normally 10-12)" }),
            new Paragraph({ text: "☐ Load less birds/crate if above average weights" }),
            new Paragraph({ text: "☐ Wind block in front of first row of crates if below 10 degree temperature" }),
            new Paragraph({ text: "☐ Tarp top and sides when precipitation is forecasted", spacing: { after: 300 } }),

            // Driver responsibilities
            new Paragraph({
              text: "Driver responsibilities",
              heading: HeadingLevel.HEADING_2,
              spacing: { after: 200 },
            }),

            new Paragraph({ text: "☐ Inspect load, tarps, boards, etc are secured" }),
            new Paragraph({ text: "☐ Stop and inspect comfort of birds" }),
            new Paragraph({ text: "☐ Roll up tarp sides when stopped", spacing: { after: 300 } }),

            // Additional comments
            new Paragraph({
              children: [new TextRun({ text: "Additional Comments:", bold: true })],
              spacing: { after: 100 },
            }),
            new Paragraph({ text: "_".repeat(100), spacing: { after: 100 } }),
            new Paragraph({ text: "_".repeat(100), spacing: { after: 300 } }),

            // Signatures
            new Paragraph({ text: "Signature Transporter: _________________________________________", spacing: { after: 200 } }),
            new Paragraph({ text: "Signature Farm Production Manager: _____________________________" }),
          ],
        }],
      });

      // Generate document bytes
      const docBytes = await Packer.toBuffer(doc);
      console.log('[Word Generation] Document bytes length:', docBytes.length);
      
      // Convert to base64 for transmission
      const base64Doc = Buffer.from(docBytes).toString("base64");
      console.log('[Word Generation] Base64 length:', base64Doc.length);
      console.log('[Word Generation] Filename:', `Transport_Report_${input.lotNumber}_${new Date().toISOString().split('T')[0]}.docx`);

      return {
        success: true,
        docBase64: base64Doc,
        filename: `Transport_Report_${input.lotNumber}_${new Date().toISOString().split('T')[0]}.docx`,
      };
    }),
};
