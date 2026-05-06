import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';

interface LineItem {
  description: string;
  quantity: number;
  pricePerUnit: number;
  weight?: number;
  discount?: number;
  vatPercentage?: number;
}

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  customerName: string;
  customerVATNo?: string;
  customerRegNo?: string;
  customerAddress?: string;
  lineItems: LineItem[];
  totalDiscount?: number;
  totalExclusive: number;
  totalVAT: number;
  totalInclusive: number;
  paymentTerms?: string;
  notes?: string;
  bankDetails?: {
    bank: string;
    branchCode: string;
    accountName: string;
    accountNumber: string;
  };
}

export async function generatePremiumInvoicePDF(invoiceData: InvoiceData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  // Colors
  const darkBlue = rgb(0.05, 0.35, 0.5);
  const orange = rgb(1, 0.55, 0);
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.95, 0.95, 0.95);
  const veryLightGray = rgb(0.98, 0.98, 0.98);
  const borderGray = rgb(0.85, 0.85, 0.85);
  const white = rgb(1, 1, 1);

  // Font sizes
  const titleSize = 28;
  const headerSize = 11;
  const labelSize = 8;
  const normalSize = 9;
  const smallSize = 7.5;
  const tinySize = 6.5;

  let y = height - 20;

  // ===== TOP ACCENT BAR =====
  page.drawRectangle({
    x: 0,
    y: y + 5,
    width: width,
    height: 3,
    color: orange,
    borderColor: orange,
  });

  y -= 15;

  // ===== HEADER SECTION WITH LOGO AND INVOICE TITLE =====
  // Logo on left - positioned higher
  let logoHeight = 0;
  let logoWidth = 0;
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
          const logoDims = logoImage.scale(0.22);
          logoHeight = logoDims.height;
          logoWidth = logoDims.width;
          page.drawImage(logoImage, {
            x: 40,
            y: y - logoHeight + 5,
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

  // Invoice title and number on right - lowered slightly
  page.drawText('INVOICE', {
    x: width - 160,
    y: y - 15,
    size: titleSize,
    color: darkBlue,
  });

  page.drawText(`#${invoiceData.invoiceNumber}`, {
    x: width - 160,
    y: y - 35,
    size: headerSize,
    color: orange,
  });

  y -= (logoHeight + 5);
  y -= 10; // Minimal gap after logo - move company block much higher

  // ===== COMPANY INFO BOX - moved significantly higher =====
  page.drawRectangle({
    x: 40,
    y: y - 50,
    width: width - 80,
    height: 50,
    color: veryLightGray,
    borderColor: borderGray,
    borderWidth: 0.5,
  });

  page.drawText('AFGRO FARMING GROUP (PTY) LTD', {
    x: 50,
    y: y - 15,
    size: normalSize,
    color: darkBlue,
  });

  page.drawText('VAT NO: 4960323782 | REG NO: 2024/149547/07 | 221 Market Street, Fairland, Randburg 2170', {
    x: 50,
    y: y - 28,
    size: smallSize,
    color: gray,
  });

  page.drawText('Phone: +27 (0)11 234 5678 | Email: info@afgro.co.za | Web: www.afgro.co.za', {
    x: 50,
    y: y - 38,
    size: smallSize,
    color: gray,
  });

  y -= 100; // Reduced gap - move invoice details higher to consume more white space

  // ===== INVOICE DETAILS AND CUSTOMER INFO SECTION =====
  // Left column - Invoice details
  const detailsX = 40;
  let detailsY = y;

  page.drawText('INVOICE DETAILS', {
    x: detailsX,
    y: detailsY,
    size: labelSize,
    color: darkBlue,
  });
  detailsY -= 12;

  page.drawText('Invoice Number:', { x: detailsX, y: detailsY, size: smallSize, color: gray });
  page.drawText(invoiceData.invoiceNumber, { x: detailsX + 90, y: detailsY, size: normalSize, color: black });
  detailsY -= 10;

  page.drawText('Invoice Date:', { x: detailsX, y: detailsY, size: smallSize, color: gray });
  page.drawText(invoiceData.invoiceDate.toLocaleDateString(), { x: detailsX + 90, y: detailsY, size: normalSize, color: black });
  detailsY -= 10;

  page.drawText('Due Date:', { x: detailsX, y: detailsY, size: smallSize, color: gray });
  page.drawText(invoiceData.dueDate.toLocaleDateString(), { x: detailsX + 90, y: detailsY, size: normalSize, color: black });
  detailsY -= 10;

  if (invoiceData.paymentTerms) {
    page.drawText('Payment Terms:', { x: detailsX, y: detailsY, size: smallSize, color: gray });
    page.drawText(invoiceData.paymentTerms, { x: detailsX + 90, y: detailsY, size: normalSize, color: black });
    detailsY -= 10;
  }

  // Right column - Customer info
  const customerX = width / 2 + 20;
  let customerY = y;

  page.drawText('BILL TO', {
    x: customerX,
    y: customerY,
    size: labelSize,
    color: darkBlue,
  });
  customerY -= 12;

  page.drawText(invoiceData.customerName, {
    x: customerX,
    y: customerY,
    size: normalSize,
    color: black,
  });
  customerY -= 10;

  if (invoiceData.customerVATNo) {
    page.drawText('VAT No: ' + invoiceData.customerVATNo, { x: customerX, y: customerY, size: smallSize, color: gray });
    customerY -= 9;
  }

  if (invoiceData.customerRegNo) {
    page.drawText('Reg No: ' + invoiceData.customerRegNo, { x: customerX, y: customerY, size: smallSize, color: gray });
    customerY -= 9;
  }

  if (invoiceData.customerAddress) {
    page.drawText('Address: ' + invoiceData.customerAddress, { x: customerX, y: customerY, size: smallSize, color: gray });
    customerY -= 9;
  }

  y -= 60;

  // ===== SEPARATOR =====
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: orange,
  });

  y -= 15;

  // ===== LINE ITEMS TABLE =====
  const tableX = 40;
  const tableWidth = width - 80;

  // Table header
  page.drawRectangle({
    x: tableX,
    y: y - 16,
    width: tableWidth,
    height: 16,
    color: darkBlue,
    borderColor: darkBlue,
  });

  const cols = [
	 { header: 'Description', width: 130, x: tableX + 3 },
	 { header: 'Qty',         width: 45,  x: tableX + 133 },
	 { header: 'Unit Price',  width: 65,  x: tableX + 178 },
	 { header: 'Disc %',      width: 55,  x: tableX + 243 },

	 // ✅ NEW COLUMN
	 { header: 'Disc (R)',    width: 70,  x: tableX + 298 },

	 { header: 'VAT %',       width: 50,  x: tableX + 368 },
	 { header: 'Amount',      width: 75,  x: tableX + 418 },
	];

  for (const col of cols) {
    page.drawText(col.header, {
      x: col.x,
      y: y - 12,
      size: smallSize,
      color: white,
    });
  }

  y -= 18;

  // Table rows
  let rowY = y;
  for (let i = 0; i < invoiceData.lineItems.length; i++) {
    const item = invoiceData.lineItems[i];
    const rowColor = i % 2 === 0 ? white : veryLightGray;

    page.drawRectangle({
      x: tableX,
      y: rowY - 14,
      width: tableWidth,
      height: 14,
      color: rowColor,
      borderColor: borderGray,
      borderWidth: 0.5,
    });

    const discount = item.discount || 0;
    const vat = item.vatPercentage || 15;
    const subtotal = item.quantity * item.pricePerUnit;
    const discountAmount = subtotal * (discount / 100);
    const exclusive = subtotal - discountAmount;
    const vatAmount = exclusive * (vat / 100);
    const total = exclusive + vatAmount;

    // Description
    page.drawText(item.description, {
      x: cols[0].x,
      y: rowY - 10,
      size: normalSize,
      color: black,
    });

    // Quantity
    page.drawText(item.quantity.toString(), {
      x: cols[1].x,
      y: rowY - 10,
      size: normalSize,
      color: black,
    });

    // Unit Price
    page.drawText(`R ${item.pricePerUnit.toFixed(2)}`, {
      x: cols[2].x,
      y: rowY - 10,
      size: normalSize,
      color: black,
    });

    // Discount %
    page.drawText(`${discount.toFixed(2)}%`, {
      x: cols[3].x,
      y: rowY - 10,
      size: normalSize,
      color: black,
    });
	
	// Discount Amount (NEW)
	page.drawText(`R ${discountAmount.toFixed(2)}`, {
	  x: cols[4].x,
	  y: rowY - 10,
	  size: normalSize,
	  color: black,
	});

    // VAT %
    page.drawText(`${vat.toFixed(2)}%`, {
      x: cols[5].x,
      y: rowY - 10,
      size: normalSize,
      color: black,
    });

    // Amount
    page.drawText(`R ${total.toFixed(2)}`, {
      x: cols[6].x + 10,
      y: rowY - 10,
      size: normalSize,
      color: black,
    });

    rowY -= 16;
  }

  y = rowY - 10;

  // ===== TOTALS SECTION =====
  // Align right edge with line items table right edge (width - 40)
  const totalsBoxWidth = 210;
  const totalsX = width - 40 - totalsBoxWidth;
  let totalsY = y - 20; // Move down

  // Totals box
  page.drawRectangle({
    x: totalsX,
    y: totalsY - 80,
    width: totalsBoxWidth,
    height: 80,
    color: veryLightGray,
    borderColor: darkBlue,
    borderWidth: 1.5,
  });

  totalsY -= 8;
  page.drawText('Subtotal:', { x: totalsX + 5, y: totalsY, size: smallSize, color: gray });
  page.drawText(`R ${invoiceData.totalExclusive.toFixed(2)}`, { x: totalsX + 115, y: totalsY, size: smallSize, color: black });

  totalsY -= 12;
  page.drawText('Total VAT:', { x: totalsX + 5, y: totalsY, size: smallSize, color: gray });
  page.drawText(`R ${invoiceData.totalVAT.toFixed(2)}`, { x: totalsX + 115, y: totalsY, size: smallSize, color: black });

  if (invoiceData.totalDiscount && invoiceData.totalDiscount > 0) {
    totalsY -= 12;
    page.drawText('Total Discount:', { x: totalsX + 5, y: totalsY, size: smallSize, color: gray });
    page.drawText(`R ${invoiceData.totalDiscount.toFixed(2)}`, { x: totalsX + 115, y: totalsY, size: smallSize, color: black });
  }

  totalsY -= 16;
  page.drawText('TOTAL DUE:', { x: totalsX + 5, y: totalsY, size: 11, color: darkBlue });
  page.drawText(`R ${invoiceData.totalInclusive.toFixed(2)}`, { x: totalsX + 115, y: totalsY, size: 12, color: orange });

  y -= 100;

  // ===== PAYMENT INFORMATION - lowered =====
  y -= 20;
  page.drawText('PAYMENT INFORMATION', {
    x: 40,
    y,
    size: labelSize,
    color: darkBlue,
  });
  y -= 12;

  if (invoiceData.bankDetails) {
    page.drawText(`Bank: ${invoiceData.bankDetails.bank}`, { x: 40, y, size: smallSize, color: black });
    y -= 9;
    page.drawText(`Branch Code: ${invoiceData.bankDetails.branchCode}`, { x: 40, y, size: smallSize, color: black });
    y -= 9;
    page.drawText(`Account Name: ${invoiceData.bankDetails.accountName}`, { x: 40, y, size: smallSize, color: black });
    y -= 9;
    page.drawText(`Account Number: ${invoiceData.bankDetails.accountNumber}`, { x: 40, y, size: smallSize, color: black });
    y -= 9;
    page.drawText(`Reference: ${invoiceData.invoiceNumber}`, { x: 40, y, size: smallSize, color: black });
  }

  // ===== TERMS AND CONDITIONS - moved 20mm lower =====
  y -= 56; // Move 20mm lower (56 points ≈ 20mm)
  page.drawText('TERMS & CONDITIONS', {
    x: 40,
    y,
    size: labelSize,
    color: darkBlue,
  });
  y -= 10;

  const termsText = invoiceData.notes || 'Payment is due within the specified payment terms. Late payments may incur interest charges as per agreement. Thank you for your business.';
  const wrappedTerms = wrapText(termsText, 90);
  for (const line of wrappedTerms) {
    page.drawText(line, { x: 40, y, size: tinySize, color: gray });
    y -= 8;
  }

  // ===== FOOTER =====
  y = 20;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.5,
    color: borderGray,
  });

  y -= 8;
  page.drawText('This is an electronically generated invoice. No signature is required.', {
    x: 40,
    y,
    size: tinySize,
    color: gray,
  });

  page.drawText(`Generated on ${new Date().toLocaleDateString()} | Page 1 of 1`, {
    x: width - 200,
    y,
    size: tinySize,
    color: gray,
  });

  // Convert to buffer
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// Helper function to wrap text
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }

  if (currentLine) lines.push(currentLine.trim());
  return lines;
}
