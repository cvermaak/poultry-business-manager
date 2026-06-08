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
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();

  // Colors
  const darkBlue = rgb(0.05, 0.35, 0.5);
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.95, 0.95, 0.95);
  const borderGray = rgb(0.85, 0.85, 0.85);
  const white = rgb(1, 1, 1);

  // Font sizes
  const titleSize = 24;
  const labelSize = 8;
  const normalSize = 9;
  const smallSize = 7.5;

  let y = height - 30;

  // ===== HEADER SECTION =====
  // Logo on left
  let logoHeight = 0;
  try {
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
          const logoDims = logoImage.scale(0.18);
          logoHeight = logoDims.height;
          page.drawImage(logoImage, {
            x: 40,
            y: y - logoHeight,
            width: logoDims.width,
            height: logoDims.height,
          });
          logoLoaded = true;
          break;
        } catch (e) {
          // Continue
        }
      }
    }
    
    if (!logoLoaded) {
      throw new Error('Logo not found');
    }
  } catch (error) {
    page.drawText('AFGRO', {
      x: 40,
      y: y - 30,
      size: titleSize,
      color: darkBlue,
    });
    logoHeight = 40;
  }

  // Invoice title and details on right
  page.drawText('INVOICE', {
    x: width - 150,
    y: y - 10,
    size: titleSize,
    color: black,
  });

  // Invoice details
  const detailsX = width - 200;
  let detailY = y - 45;
  const detailLineHeight = 11;

  page.drawText('NUMBER:', { x: detailsX, y: detailY, size: labelSize, color: gray });
  page.drawText(invoiceData.invoiceNumber, { x: detailsX + 80, y: detailY, size: normalSize, color: black });
  detailY -= detailLineHeight;

  page.drawText('REFERENCE:', { x: detailsX, y: detailY, size: labelSize, color: gray });
  page.drawText(invoiceData.invoiceDate.toLocaleDateString(), { x: detailsX + 80, y: detailY, size: normalSize, color: black });
  detailY -= detailLineHeight;

  page.drawText('DATE:', { x: detailsX, y: detailY, size: labelSize, color: gray });
  page.drawText(invoiceData.invoiceDate.toLocaleDateString(), { x: detailsX + 80, y: detailY, size: normalSize, color: black });
  detailY -= detailLineHeight;

  page.drawText('DUE DATE:', { x: detailsX, y: detailY, size: labelSize, color: gray });
  page.drawText(invoiceData.dueDate.toLocaleDateString(), { x: detailsX + 80, y: detailY, size: normalSize, color: black });
  detailY -= detailLineHeight;

  page.drawText('SALES REP:', { x: detailsX, y: detailY, size: labelSize, color: gray });
  page.drawText('AFGRO - Brendon', { x: detailsX + 80, y: detailY, size: normalSize, color: black });
  detailY -= detailLineHeight;

  page.drawText('OVERALL DISCOUNT %:', { x: detailsX, y: detailY, size: labelSize, color: gray });
  page.drawText('0.00%', { x: detailsX + 80, y: detailY, size: normalSize, color: black });
  detailY -= detailLineHeight;

  page.drawText('PAGE:', { x: detailsX, y: detailY, size: labelSize, color: gray });
  page.drawText('1/1', { x: detailsX + 80, y: detailY, size: normalSize, color: black });

  y -= (logoHeight + 30);

  // ===== FROM/TO SECTION =====
  // FROM section (left)
  page.drawText('FROM', {
    x: 40,
    y,
    size: labelSize,
    color: gray,
  });
  y -= 11;

  page.drawText('AFGRO FARMING GROUP (PTY) LTD', {
    x: 40,
    y,
    size: normalSize,
    color: black,
  });
  y -= 10;

  page.drawText('VAT NO: 4960323782', { x: 40, y, size: smallSize, color: black });
  y -= 9;
  page.drawText('REG NO: 2024/149547/07', { x: 40, y, size: smallSize, color: black });
  y -= 9;
  page.drawText('POSTAL ADDRESS:', { x: 40, y, size: smallSize, color: gray });
  y -= 9;
  page.drawText('221 Market Street', { x: 40, y, size: smallSize, color: black });
  y -= 9;
  page.drawText('Fairland, Randburg 2170', { x: 40, y, size: smallSize, color: black });
  y -= 9;
  page.drawText('PHYSICAL ADDRESS:', { x: 40, y, size: smallSize, color: gray });
  y -= 9;
  page.drawText('221 Market Street', { x: 40, y, size: smallSize, color: black });
  y -= 9;
  page.drawText('Fairland, Randburg 2170', { x: 40, y, size: smallSize, color: black });

  // TO section (right) - positioned at same level as FROM
  const toX = width / 2 + 30;
  let toY = height - 150;

  page.drawText('TO', {
    x: toX,
    y: toY,
    size: labelSize,
    color: gray,
  });
  toY -= 11;

  page.drawText(invoiceData.customerName.toUpperCase(), {
    x: toX,
    y: toY,
    size: normalSize,
    color: black,
  });
  toY -= 10;

  if (invoiceData.customerVATNo) {
    page.drawText('CUSTOMER VAT NO:', { x: toX, y: toY, size: smallSize, color: gray });
    page.drawText(invoiceData.customerVATNo, { x: toX + 110, y: toY, size: smallSize, color: black });
    toY -= 9;
  }

  if (invoiceData.customerRegNo) {
    page.drawText('CUSTOMER REG NO:', { x: toX, y: toY, size: smallSize, color: gray });
    page.drawText(invoiceData.customerRegNo, { x: toX + 110, y: toY, size: smallSize, color: black });
    toY -= 9;
  }

  page.drawText('POSTAL ADDRESS:', { x: toX, y: toY, size: smallSize, color: gray });
  toY -= 9;
  page.drawText('72 Kerk Street', { x: toX, y: toY, size: smallSize, color: black });
  toY -= 9;
  page.drawText('Rustenburg', { x: toX, y: toY, size: smallSize, color: black });
  toY -= 9;
  page.drawText('PHYSICAL ADDRESS:', { x: toX, y: toY, size: smallSize, color: gray });
  toY -= 9;
  page.drawText('72 Kerk Street', { x: toX, y: toY, size: smallSize, color: black });
  toY -= 9;
  page.drawText('Rustenburg', { x: toX, y: toY, size: smallSize, color: black });

  y -= 100;

  // ===== SEPARATOR LINE =====
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.5,
    color: borderGray,
  });

  y -= 15;

  // ===== LINE ITEMS TABLE =====
  const tableX = 40;
  const tableWidth = width - 80;
  
  // Column widths
  const cols = [
    { header: 'Description', width: 100 },
    { header: 'Quantity', width: 60 },
    { header: 'P/KG', width: 50 },
    { header: 'Weight(kg)', width: 60 },
    { header: 'Disc %', width: 40 },
    { header: 'VAT %', width: 40 },
    { header: 'Excl. Total', width: 70 },
    { header: 'Incl. Total', width: 75 },
  ];

  // Table header background
  page.drawRectangle({
    x: tableX,
    y: y - 14,
    width: tableWidth,
    height: 14,
    color: lightGray,
    borderColor: borderGray,
    borderWidth: 0.5,
  });

  // Table header text
  let colX = tableX + 3;
  for (const col of cols) {
    page.drawText(col.header, {
      x: colX,
      y: y - 11,
      size: smallSize,
      color: gray,
    });
    colX += col.width;
  }

  y -= 18;

  // Table row
  page.drawRectangle({
    x: tableX,
    y: y - 14,
    width: tableWidth,
    height: 14,
    color: white,
    borderColor: borderGray,
    borderWidth: 0.5,
  });

  colX = tableX + 3;
  
  // Description
  page.drawText('AFGRO - Live Chickens', { x: colX, y: y - 10, size: normalSize, color: black });
  colX += cols[0].width;
  
  // Quantity
  page.drawText(invoiceData.totalBirds.toString(), { x: colX + 20, y: y - 10, size: normalSize, color: black });
  colX += cols[1].width;
  
  // P/KG
  page.drawText(Number(invoiceData.pricePerKgExcl).toFixed(2), { x: colX + 5, y: y - 10, size: normalSize, color: black });
  colX += cols[2].width;
  
  // Weight
  page.drawText(Number(invoiceData.totalWeight).toFixed(2), { x: colX + 15, y: y - 10, size: normalSize, color: black });
  colX += cols[3].width;
  
  // Discount %
  page.drawText('0.00%', { x: colX + 10, y: y - 10, size: normalSize, color: black });
  colX += cols[4].width;
  
  // VAT %
  page.drawText(Number(invoiceData.vatPercentage).toFixed(2) + '%', { x: colX + 10, y: y - 10, size: normalSize, color: black });
  colX += cols[5].width;
  
  // Exclusive Total
  page.drawText('R ' + Number(invoiceData.exclusiveTotal).toFixed(2), { x: colX, y: y - 10, size: normalSize, color: black });
  colX += cols[6].width;
  
  // Inclusive Total
  page.drawText('R ' + Number(invoiceData.inclusiveTotal).toFixed(2), { x: colX, y: y - 10, size: normalSize, color: black });

  y -= 20;

  // ===== SEPARATOR LINE =====
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.5,
    color: borderGray,
  });

  y -= 15;

  // ===== PAYMENT METHOD (LEFT) =====
  page.drawText('Payment Method', {
    x: 40,
    y,
    size: 10,
    color: black,
  });
  y -= 12;

  page.drawText('• Bank Transfer:', { x: 40, y, size: normalSize, color: black });
  y -= 10;
  page.drawText('Bank: First National Bank', { x: 50, y, size: smallSize, color: black });
  y -= 9;
  page.drawText('Branch Code: 250655', { x: 50, y, size: smallSize, color: black });
  y -= 9;
  page.drawText('Account Name: Afgro Farming Group (pty)ltd', { x: 50, y, size: smallSize, color: black });
  y -= 9;
  page.drawText('Account Number: 6315 3992 433', { x: 50, y, size: smallSize, color: black });
  y -= 9;
  page.drawText(`Reference: ${invoiceData.invoiceNumber}`, { x: 50, y, size: smallSize, color: black });

  // ===== TOTALS SECTION (RIGHT) =====
  let summaryY = height - 320;
  const summaryX = width - 220;

  // Summary box background
  page.drawRectangle({
    x: summaryX - 10,
    y: summaryY - 100,
    width: 210,
    height: 100,
    color: lightGray,
    borderColor: borderGray,
    borderWidth: 0.5,
  });

  summaryY -= 8;
  page.drawText('Total Discount:', { x: summaryX, y: summaryY, size: smallSize, color: gray });
  page.drawText('R0.00', { x: summaryX + 120, y: summaryY, size: smallSize, color: black });

  summaryY -= 12;
  page.drawText('Total Exclusive:', { x: summaryX, y: summaryY, size: smallSize, color: gray });
  page.drawText(`R ${Number(invoiceData.exclusiveTotal).toFixed(2)}`, { x: summaryX + 120, y: summaryY, size: smallSize, color: black });

  summaryY -= 12;
  page.drawText('Total VAT:', { x: summaryX, y: summaryY, size: smallSize, color: gray });
  page.drawText(`R ${Number(invoiceData.vatAmount).toFixed(2)}`, { x: summaryX + 120, y: summaryY, size: smallSize, color: black });

  summaryY -= 12;
  page.drawText('Sub Total:', { x: summaryX, y: summaryY, size: smallSize, color: gray });
  page.drawText(`R ${Number(invoiceData.inclusiveTotal).toFixed(2)}`, { x: summaryX + 120, y: summaryY, size: smallSize, color: black });

  summaryY -= 16;
  page.drawText('Grand Total:', { x: summaryX, y: summaryY, size: 11, color: black });
  page.drawText(`R ${Number(invoiceData.inclusiveTotal).toFixed(2)}`, { x: summaryX + 120, y: summaryY, size: 11, color: darkBlue });

  summaryY -= 18;
  page.drawText('BALANCE DUE', { x: summaryX, y: summaryY, size: smallSize, color: gray });
  summaryY -= 12;
  page.drawText(`R ${Number(invoiceData.inclusiveTotal).toFixed(2)}`, { x: summaryX, y: summaryY, size: 14, color: darkBlue });

  // Convert to buffer
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
