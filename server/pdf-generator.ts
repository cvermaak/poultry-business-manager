import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  customerName: string;
  customerVATNo?: string;
  customerRegNo?: string;
  customerAddress?: string;
  totalBirds: number;
  totalWeight: number;
  pricePerKgExcl: number;
  exclusiveTotal: number;
  vatAmount: number;
  inclusiveTotal: number;
  vatPercentage: number;
}

export async function generateInvoicePDF(invoiceData: InvoiceData): Promise<Buffer> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();

  // Set up fonts and colors
  const fontSize = 9;
  const smallFontSize = 7;
  const titleFontSize = 24;
  const darkBlue = rgb(0.05, 0.35, 0.5); // AFGRO dark blue
  const orange = rgb(1, 0.55, 0); // AFGRO orange
  const black = rgb(0, 0, 0);
  const gray = rgb(0.5, 0.5, 0.5);
  const lightGray = rgb(0.95, 0.95, 0.95);
  const borderGray = rgb(0.8, 0.8, 0.8);

  let yPosition = height - 30;

  // Try to load and embed the AFGRO logo - positioned lower
  try {
    // Try multiple possible paths
    const possiblePaths = [
      path.join(process.cwd(), 'client', 'public', 'afgro-logo.png'),
      path.join(process.cwd(), 'dist', 'public', 'afgro-logo.png'),
      '/home/ubuntu/poultry-business-manager/client/public/afgro-logo.png',
    ];
    
    let logoLoaded = false;
    for (const logoPath of possiblePaths) {
      if (fs.existsSync(logoPath)) {
        try {
          const logoBytes = fs.readFileSync(logoPath);
          const logoImage = await pdfDoc.embedPng(logoBytes);
          const logoDims = logoImage.scale(0.10);
          page.drawImage(logoImage, {
            x: 40,
            y: yPosition - 50,  // Shifted down significantly
            width: logoDims.width,
            height: logoDims.height,
          });
          logoLoaded = true;
          break;
        } catch (e) {
          // Try next path
        }
      }
    }
    
    if (!logoLoaded) {
      throw new Error('Logo not found');
    }
  } catch (error) {
    // If logo fails to load, just use text
    page.drawText('AFGRO', {
      x: 40,
      y: yPosition - 50,
      size: 16,
      color: darkBlue,
    });
  }

  // Add INVOICE title on the right
  page.drawText('INVOICE', {
    x: width - 120,
    y: yPosition - 15,
    size: 18,
    color: black,
  });

  yPosition -= 70;

  // Add invoice header details on the right with better spacing
  const headerX = width - 280;
  const headerLineHeight = 14;
  
  page.drawText(`NUMBER:`, { x: headerX, y: yPosition, size: smallFontSize, color: gray });
  page.drawText(invoiceData.invoiceNumber, { x: headerX + 80, y: yPosition, size: smallFontSize, color: black });
  
  yPosition -= headerLineHeight;
  page.drawText(`DATE:`, { x: headerX, y: yPosition, size: smallFontSize, color: gray });
  page.drawText(invoiceData.invoiceDate.toLocaleDateString(), { x: headerX + 80, y: yPosition, size: smallFontSize, color: black });
  
  yPosition -= headerLineHeight;
  page.drawText(`DUE DATE:`, { x: headerX, y: yPosition, size: smallFontSize, color: gray });
  page.drawText(invoiceData.dueDate.toLocaleDateString(), { x: headerX + 80, y: yPosition, size: smallFontSize, color: black });

  yPosition -= 25;

  // FROM section
  page.drawText('FROM', {
    x: 50,
    y: yPosition,
    size: 9,
    color: gray,
  });

  yPosition -= 12;
  page.drawText('AFGRO FARMING GROUP (PTY) LTD', {
    x: 50,
    y: yPosition,
    size: fontSize,
    color: black,
  });

  yPosition -= 12;
  page.drawText('VAT NO: 4960323782', { x: 50, y: yPosition, size: smallFontSize, color: black });
  yPosition -= 10;
  page.drawText('REG NO: 2024/149547/07', { x: 50, y: yPosition, size: smallFontSize, color: black });
  yPosition -= 10;
  page.drawText('POSTAL ADDRESS: 221 Market Street', { x: 50, y: yPosition, size: smallFontSize, color: black });
  yPosition -= 10;
  page.drawText('Fairland, Randburg 2170', { x: 50, y: yPosition, size: smallFontSize, color: black });

  // TO section (on the right)
  const toX = width / 2 + 50;
  let toY = height - 90;

  page.drawText('TO', {
    x: toX,
    y: toY,
    size: 9,
    color: gray,
  });

  toY -= 12;
  page.drawText(invoiceData.customerName.toUpperCase(), {
    x: toX,
    y: toY,
    size: fontSize,
    color: black,
  });

  if (invoiceData.customerVATNo) {
    toY -= 10;
    page.drawText(`CUSTOMER VAT NO: ${invoiceData.customerVATNo}`, { x: toX, y: toY, size: smallFontSize, color: black });
  }

  if (invoiceData.customerRegNo) {
    toY -= 10;
    page.drawText(`CUSTOMER REG NO: ${invoiceData.customerRegNo}`, { x: toX, y: toY, size: smallFontSize, color: black });
  }

  if (invoiceData.customerAddress) {
    toY -= 10;
    page.drawText(`PHYSICAL ADDRESS: ${invoiceData.customerAddress}`, { x: toX, y: toY, size: smallFontSize, color: black });
  }

  yPosition = height - 280;

  // Draw table with better column widths
  const tableY = yPosition;
  const tableStartX = 40;
  const tableWidth = width - 80;
  
  // Adjusted column widths for better alignment - more space for totals
  const colWidths = [110, 35, 45, 55, 30, 30, 65, 65];
  const colHeaders = ['Description', 'Qty', 'P/KG', 'Wt(kg)', 'Disc%', 'VAT%', 'Excl.Total', 'Incl.Total'];
  
  // Draw header background
  page.drawRectangle({
    x: tableStartX,
    y: tableY - 16,
    width: tableWidth,
    height: 16,
    color: lightGray,
    borderColor: borderGray,
    borderWidth: 0.5,
  });

  // Draw header text with proper spacing
  let colX = tableStartX + 3;
  for (let i = 0; i < colHeaders.length; i++) {
    page.drawText(colHeaders[i], {
      x: colX,
      y: tableY - 12,
      size: smallFontSize,
      color: black,
    });
    colX += colWidths[i];
  }

  yPosition -= 20;

  // Draw table row border
  page.drawRectangle({
    x: tableStartX,
    y: yPosition - 16,
    width: tableWidth,
    height: 16,
    color: rgb(1, 1, 1),
    borderColor: borderGray,
    borderWidth: 0.5,
  });

  // Draw invoice line item with proper column alignment
  colX = tableStartX + 3;
  
  // Description
  const description = 'AFGRO - Live Chickens';
  page.drawText(description.substring(0, 18), { x: colX, y: yPosition - 12, size: fontSize, color: black });
  colX += colWidths[0];
  
  // Qty
  page.drawText(invoiceData.totalBirds.toString(), { x: colX + 5, y: yPosition - 12, size: fontSize, color: black });
  colX += colWidths[1];
  
  // P/KG
  page.drawText(`R ${Number(invoiceData.pricePerKgExcl).toFixed(2)}`, { x: colX, y: yPosition - 12, size: fontSize, color: black });
  colX += colWidths[2];
  
  // Weight
  page.drawText(Number(invoiceData.totalWeight).toFixed(2), { x: colX + 5, y: yPosition - 12, size: fontSize, color: black });
  colX += colWidths[3];
  
  // Discount %
  page.drawText('0.00%', { x: colX, y: yPosition - 12, size: fontSize, color: black });
  colX += colWidths[4];
  
  // VAT %
  page.drawText(`${Number(invoiceData.vatPercentage).toFixed(2)}%`, { x: colX, y: yPosition - 12, size: fontSize, color: black });
  colX += colWidths[5];
  
  // Exclusive Total
  page.drawText(`R ${Number(invoiceData.exclusiveTotal).toFixed(2)}`, { x: colX, y: yPosition - 12, size: fontSize, color: black });
  colX += colWidths[6];
  
  // Inclusive Total
  page.drawText(`R ${Number(invoiceData.inclusiveTotal).toFixed(2)}`, { x: colX, y: yPosition - 12, size: fontSize, color: black });

  yPosition -= 40;

  // Payment Method section
  page.drawText('Payment Method', {
    x: 50,
    y: yPosition,
    size: 10,
    color: black,
  });

  yPosition -= 12;
  page.drawText('Bank Transfer:', { x: 50, y: yPosition, size: fontSize, color: black });
  yPosition -= 10;
  page.drawText('Bank: First National Bank', { x: 50, y: yPosition, size: smallFontSize, color: black });
  yPosition -= 9;
  page.drawText('Branch Code: 250655', { x: 50, y: yPosition, size: smallFontSize, color: black });
  yPosition -= 9;
  page.drawText('Account Name: Afgro Farming Group (pty)ltd', { x: 50, y: yPosition, size: smallFontSize, color: black });
  yPosition -= 9;
  page.drawText('Account Number: 6315 3992 433', { x: 50, y: yPosition, size: smallFontSize, color: black });
  yPosition -= 9;
  page.drawText(`Reference: ${invoiceData.invoiceNumber}`, { x: 50, y: yPosition, size: smallFontSize, color: black });

  // Summary section (on the right)
  let summaryX = width - 220;
  let summaryY = height - 250;

  page.drawText('Total Discount:', { x: summaryX, y: summaryY, size: smallFontSize, color: gray });
  page.drawText('R0.00', { x: summaryX + 110, y: summaryY, size: smallFontSize, color: black });

  summaryY -= 12;
  page.drawText('Total Exclusive:', { x: summaryX, y: summaryY, size: smallFontSize, color: gray });
  page.drawText(`R ${Number(invoiceData.exclusiveTotal).toFixed(2)}`, { x: summaryX + 110, y: summaryY, size: smallFontSize, color: black });

  summaryY -= 12;
  page.drawText('Total VAT:', { x: summaryX, y: summaryY, size: smallFontSize, color: gray });
  page.drawText(`R ${Number(invoiceData.vatAmount).toFixed(2)}`, { x: summaryX + 110, y: summaryY, size: smallFontSize, color: black });

  summaryY -= 12;
  page.drawText('Sub Total:', { x: summaryX, y: summaryY, size: smallFontSize, color: gray });
  page.drawText(`R ${Number(invoiceData.inclusiveTotal).toFixed(2)}`, { x: summaryX + 110, y: summaryY, size: smallFontSize, color: black });

  summaryY -= 20;
  page.drawText('Grand Total:', { x: summaryX, y: summaryY, size: 11, color: black });
  page.drawText(`R ${Number(invoiceData.inclusiveTotal).toFixed(2)}`, { x: summaryX + 110, y: summaryY, size: 11, color: black });

  summaryY -= 18;
  page.drawText('BALANCE DUE', { x: summaryX, y: summaryY, size: smallFontSize, color: gray });
  summaryY -= 12;
  page.drawText(`R ${Number(invoiceData.inclusiveTotal).toFixed(2)}`, { x: summaryX, y: summaryY, size: 14, color: darkBlue });

  // Convert PDF to buffer
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
