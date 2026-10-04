import { PDFDocument, PDFPage, rgb } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

export interface InvoicePdfLineItem {
  description: string;
  quantity: number;
  pricePerUnit: number;
  discount?: number;
  vatPercentage?: number;
  /** Persisted amounts are preferred so output always reconciles to the invoice record. */
  discountAmount?: number;
  exclusiveAmount?: number;
  vatAmount?: number;
  totalAmount?: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  customerName: string;
  customerVATNo?: string;
  customerRegNo?: string;
  customerAddress?: string;
  lineItems: InvoicePdfLineItem[];
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
    reference?: string;
  };
  companyInfo: {
    name: string;
    vatNumber?: string;
    registrationNumber?: string;
    address: string;
    phone?: string;
    email?: string;
    website?: string;
  };
}

type PdfLineAmounts = {
  subtotal: number;
  discount: number;
  exclusive: number;
  vat: number;
  total: number;
};

type EmbeddedLogo = {
  image: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  width: number;
  height: number;
};

export type FirstPageHeaderLayout = {
  companyBoxX: number;
  companyBoxWidth: number;
  companyBoxY: number;
  companyBoxHeight: number;
};

export type FirstPageContentLayout = {
  detailsY: number;
  separatorY: number;
  tableY: number;
  summaryTopY: number;
  descriptionColumnWidth: number;
  descriptionTextLimit: number;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 40;
const RIGHT = 40;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const ROW_HEIGHT = 18;
const TABLE_HEADER_HEIGHT = 16;
const CONTINUATION_TOP = PAGE_HEIGHT - 62;
const FINAL_CONTENT_MIN_Y = 222;
// Keep the original top edge while adding room for a wrapped contact line.
const COMPANY_BOX_Y = PAGE_HEIGHT - 157;
const COMPANY_BOX_HEIGHT = 65;
const LOGO_TO_COMPANY_BOX_GAP = 12;
// The logo's transparent canvas extends below the visible wordmark. Keep a
// deliberate visual gap before the invoice-detail block starts.
const FIRST_PAGE_DETAILS_Y = PAGE_HEIGHT - 268;
const FIRST_PAGE_SEPARATOR_Y = PAGE_HEIGHT - 320;
const FIRST_PAGE_TABLE_Y = PAGE_HEIGHT - 336;
// Use the lower A4 area for totals and payment information whenever the table
// is short, but never overlap a longer line-item table.
const PREFERRED_SUMMARY_TOP_Y = 300;
const DESCRIPTION_COLUMN_WIDTH = 180;
const DESCRIPTION_TEXT_LIMIT = 42;

/**
 * Keeps the square logo canvas and the company-information panel apart.
 * The supplied AFGRO logo has transparent padding, so the panel must clear the
 * full embedded canvas rather than only the visible wordmark.
 */
export function getFirstPageHeaderLayout(logoWidth?: number): FirstPageHeaderLayout {
  const companyBoxX = logoWidth ? LEFT + logoWidth + LOGO_TO_COMPANY_BOX_GAP : LEFT;
  return {
    companyBoxX,
    companyBoxWidth: PAGE_WIDTH - RIGHT - companyBoxX,
    companyBoxY: COMPANY_BOX_Y,
    companyBoxHeight: COMPANY_BOX_HEIGHT,
  };
}

export function getFirstPageContentLayout(): FirstPageContentLayout {
  return {
    detailsY: FIRST_PAGE_DETAILS_Y,
    separatorY: FIRST_PAGE_SEPARATOR_Y,
    tableY: FIRST_PAGE_TABLE_Y,
    summaryTopY: PREFERRED_SUMMARY_TOP_Y,
    descriptionColumnWidth: DESCRIPTION_COLUMN_WIDTH,
    descriptionTextLimit: DESCRIPTION_TEXT_LIMIT,
  };
}

const COLORS = {
  darkBlue: rgb(0.05, 0.35, 0.5),
  orange: rgb(1, 0.55, 0),
  black: rgb(0, 0, 0),
  gray: rgb(0.4, 0.4, 0.4),
  lightGray: rgb(0.95, 0.95, 0.95),
  veryLightGray: rgb(0.98, 0.98, 0.98),
  borderGray: rgb(0.85, 0.85, 0.85),
  white: rgb(1, 1, 1),
};

const COLUMNS = [
  { header: "Description", x: LEFT + 3, width: DESCRIPTION_COLUMN_WIDTH },
  { header: "Qty", x: LEFT + 184, width: 36 },
  { header: "Unit Price", x: LEFT + 222, width: 63 },
  { header: "Disc %", x: LEFT + 287, width: 42 },
  { header: "Disc (R)", x: LEFT + 331, width: 61 },
  { header: "VAT %", x: LEFT + 395, width: 42 },
  { header: "Amount", x: LEFT + 439, width: 73 },
];

function money(value: number): string {
  return `R ${value.toFixed(2)}`;
}

function truncate(text: string, maxChars: number): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-ZA");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

export function getInvoicePdfLineAmounts(item: InvoicePdfLineItem): PdfLineAmounts {
  const discountPercent = Number.isFinite(item.discount) ? item.discount ?? 0 : 0;
  const vatPercent = Number.isFinite(item.vatPercentage) ? item.vatPercentage ?? 0 : 0;
  const subtotal = item.quantity * item.pricePerUnit;
  const calculatedDiscount = subtotal * (discountPercent / 100);
  const calculatedExclusive = subtotal - calculatedDiscount;
  const calculatedVat = calculatedExclusive * (vatPercent / 100);

  const discount = item.discountAmount ?? calculatedDiscount;
  const exclusive = item.exclusiveAmount ?? calculatedExclusive;
  const vat = item.vatAmount ?? calculatedVat;
  const total = item.totalAmount ?? exclusive + vat;

  return { subtotal, discount, exclusive, vat, total };
}

export function getInvoicePdfRoundingAdjustment(data: Pick<InvoicePdfData, "lineItems" | "totalInclusive">): number {
  const lineTotal = data.lineItems.reduce((sum, item) => sum + getInvoicePdfLineAmounts(item).total, 0);
  const adjustment = data.totalInclusive - lineTotal;
  return Math.abs(adjustment) < 0.005 ? 0 : Number(adjustment.toFixed(2));
}

function drawAccent(page: PDFPage) {
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 15,
    width: PAGE_WIDTH,
    height: 3,
    color: COLORS.orange,
    borderColor: COLORS.orange,
  });
}

function drawTableHeader(page: PDFPage, y: number) {
  page.drawRectangle({
    x: LEFT,
    y: y - TABLE_HEADER_HEIGHT,
    width: CONTENT_WIDTH,
    height: TABLE_HEADER_HEIGHT,
    color: COLORS.darkBlue,
    borderColor: COLORS.darkBlue,
  });

  for (const column of COLUMNS) {
    page.drawText(column.header, { x: column.x, y: y - 12, size: 7.5, color: COLORS.white });
  }
}

function drawLineItem(page: PDFPage, item: InvoicePdfLineItem, index: number, y: number) {
  const rowColor = index % 2 === 0 ? COLORS.white : COLORS.veryLightGray;
  const amounts = getInvoicePdfLineAmounts(item);
  const vat = item.vatPercentage ?? 0;
  const discount = item.discount ?? 0;

  page.drawRectangle({
    x: LEFT,
    y: y - ROW_HEIGHT,
    width: CONTENT_WIDTH,
    height: ROW_HEIGHT,
    color: rowColor,
    borderColor: COLORS.borderGray,
    borderWidth: 0.5,
  });

  const values = [
    truncate(item.description, DESCRIPTION_TEXT_LIMIT),
    Number(item.quantity || 0).toFixed(2),
    money(item.pricePerUnit),
    `${discount.toFixed(2)}%`,
    money(amounts.discount),
    `${vat.toFixed(2)}%`,
    money(amounts.total),
  ];

  for (let columnIndex = 0; columnIndex < COLUMNS.length; columnIndex += 1) {
    page.drawText(values[columnIndex], {
      x: COLUMNS[columnIndex].x,
      y: y - 12,
      size: 7.6,
      color: COLORS.black,
    });
  }
}

function drawFooter(page: PDFPage, pageIndex: number, pageCount: number) {
  const y = 20;
  page.drawLine({
    start: { x: LEFT, y },
    end: { x: PAGE_WIDTH - RIGHT, y },
    thickness: 0.5,
    color: COLORS.borderGray,
  });
  page.drawText("This is an electronically generated invoice. No signature is required.", {
    x: LEFT,
    y: y - 9,
    size: 6.5,
    color: COLORS.gray,
  });
  page.drawText(`Page ${pageIndex + 1} of ${pageCount}`, {
    x: PAGE_WIDTH - RIGHT - 58,
    y: y - 9,
    size: 6.5,
    color: COLORS.gray,
  });
}

function drawContinuationHeading(page: PDFPage, data: InvoicePdfData) {
  drawAccent(page);
  page.drawText(data.companyInfo.name.toUpperCase(), { x: LEFT, y: PAGE_HEIGHT - 36, size: 10, color: COLORS.darkBlue });
  page.drawText(`INVOICE ${data.invoiceNumber} — CONTINUED`, {
    x: PAGE_WIDTH - RIGHT - 180,
    y: PAGE_HEIGHT - 36,
    size: 8,
    color: COLORS.gray,
  });
  page.drawLine({
    start: { x: LEFT, y: PAGE_HEIGHT - 46 },
    end: { x: PAGE_WIDTH - RIGHT, y: PAGE_HEIGHT - 46 },
    thickness: 0.5,
    color: COLORS.borderGray,
  });
}

function drawFirstPageHeading(page: PDFPage, data: InvoicePdfData, logo?: EmbeddedLogo) {
  drawAccent(page);
  const topY = PAGE_HEIGHT - 36;
  const headerLayout = getFirstPageHeaderLayout(logo?.width);

  if (logo) {
    page.drawImage(logo.image, { x: LEFT, y: topY - logo.height + 8, width: logo.width, height: logo.height });
  } else {
    page.drawText("AFGRO", { x: LEFT, y: topY - 24, size: 25, color: COLORS.darkBlue });
  }

  page.drawText("INVOICE", { x: PAGE_WIDTH - RIGHT - 128, y: topY - 2, size: 24, color: COLORS.darkBlue });
  page.drawText(`#${data.invoiceNumber}`, { x: PAGE_WIDTH - RIGHT - 128, y: topY - 22, size: 10, color: COLORS.orange });

  page.drawRectangle({
    x: headerLayout.companyBoxX,
    y: headerLayout.companyBoxY,
    width: headerLayout.companyBoxWidth,
    height: headerLayout.companyBoxHeight,
    color: COLORS.veryLightGray,
    borderColor: COLORS.borderGray,
    borderWidth: 0.5,
  });
  const companyTextX = headerLayout.companyBoxX + 10;
  page.drawText(truncate(data.companyInfo.name.toUpperCase(), logo ? 42 : 70), {
    x: companyTextX,
    y: headerLayout.companyBoxY + 49,
    size: 9,
    color: COLORS.darkBlue,
  });

  const registrationParts = [
    data.companyInfo.vatNumber ? `VAT NO: ${data.companyInfo.vatNumber}` : undefined,
    data.companyInfo.registrationNumber ? `REG NO: ${data.companyInfo.registrationNumber}` : undefined,
    data.companyInfo.address,
  ].filter(Boolean);
  page.drawText(truncate(registrationParts.join(" | "), logo ? 60 : 112), {
    x: companyTextX,
    y: headerLayout.companyBoxY + 35,
    size: 7.2,
    color: COLORS.gray,
  });

  const contactParts = [
    data.companyInfo.phone ? `Phone: ${data.companyInfo.phone}` : undefined,
    data.companyInfo.email ? `Email: ${data.companyInfo.email}` : undefined,
    data.companyInfo.website ? `Web: ${data.companyInfo.website}` : undefined,
  ].filter(Boolean);
  if (contactParts.length > 0) {
    const contactLines = logo
      ? wrapText(contactParts.join(" | "), 60).slice(0, 2)
      : [truncate(contactParts.join(" | "), 118)];
    let contactY = headerLayout.companyBoxY + 21;
    for (const line of contactLines) {
      page.drawText(line, { x: companyTextX, y: contactY, size: 7.2, color: COLORS.gray });
      contactY -= 9;
    }
  }

  const detailsY = FIRST_PAGE_DETAILS_Y;
  page.drawText("INVOICE DETAILS", { x: LEFT, y: detailsY, size: 8, color: COLORS.darkBlue });
  page.drawText("Invoice Number:", { x: LEFT, y: detailsY - 13, size: 7.5, color: COLORS.gray });
  page.drawText(data.invoiceNumber, { x: LEFT + 90, y: detailsY - 13, size: 8.5, color: COLORS.black });
  page.drawText("Invoice Date:", { x: LEFT, y: detailsY - 25, size: 7.5, color: COLORS.gray });
  page.drawText(formatDate(data.invoiceDate), { x: LEFT + 90, y: detailsY - 25, size: 8.5, color: COLORS.black });
  page.drawText("Due Date:", { x: LEFT, y: detailsY - 37, size: 7.5, color: COLORS.gray });
  page.drawText(formatDate(data.dueDate), { x: LEFT + 90, y: detailsY - 37, size: 8.5, color: COLORS.black });

  const customerX = PAGE_WIDTH / 2 + 15;
  page.drawText("BILL TO", { x: customerX, y: detailsY, size: 8, color: COLORS.darkBlue });
  page.drawText(truncate(data.customerName, 44), { x: customerX, y: detailsY - 13, size: 8.5, color: COLORS.black });
  let customerY = detailsY - 25;
  if (data.customerVATNo) {
    page.drawText(`VAT No: ${truncate(data.customerVATNo, 35)}`, { x: customerX, y: customerY, size: 7.2, color: COLORS.gray });
    customerY -= 9;
  }
  if (data.customerRegNo) {
    page.drawText(`Reg No: ${truncate(data.customerRegNo, 35)}`, { x: customerX, y: customerY, size: 7.2, color: COLORS.gray });
    customerY -= 9;
  }
  if (data.customerAddress) {
    for (const line of wrapText(data.customerAddress, 50).slice(0, 2)) {
      page.drawText(line, { x: customerX, y: customerY, size: 7.2, color: COLORS.gray });
      customerY -= 9;
    }
  }

  page.drawLine({
    start: { x: LEFT, y: FIRST_PAGE_SEPARATOR_Y },
    end: { x: PAGE_WIDTH - RIGHT, y: FIRST_PAGE_SEPARATOR_Y },
    thickness: 1,
    color: COLORS.orange,
  });
}

function drawTotals(page: PDFPage, data: InvoicePdfData, y: number) {
  const totalsBoxWidth = 215;
  const x = PAGE_WIDTH - RIGHT - totalsBoxWidth;
  const adjustment = getInvoicePdfRoundingAdjustment(data);
  const vatRates = new Set(data.lineItems.map((item) => item.vatPercentage ?? 0));
  const vatLabel = vatRates.size === 1 ? `Total VAT (${Array.from(vatRates)[0].toFixed(2)}%)` : "Total VAT (mixed rates)";
  const boxHeight = adjustment !== 0 || (data.totalDiscount ?? 0) > 0 ? 100 : 84;

  page.drawRectangle({
    x,
    y: y - boxHeight,
    width: totalsBoxWidth,
    height: boxHeight,
    color: COLORS.veryLightGray,
    borderColor: COLORS.darkBlue,
    borderWidth: 1.2,
  });

  let textY = y - 14;
  const line = (label: string, value: string, color = COLORS.black) => {
    page.drawText(label, { x: x + 7, y: textY, size: 7.7, color: COLORS.gray });
    page.drawText(value, { x: x + 138, y: textY, size: 7.7, color });
    textY -= 13;
  };

  line("Subtotal:", money(data.totalExclusive));
  line(vatLabel, money(data.totalVAT));
  if ((data.totalDiscount ?? 0) > 0) line("Total Discount:", money(data.totalDiscount ?? 0));
  if (adjustment !== 0) line("Rounding adjustment:", money(adjustment));
  textY -= 1;
  page.drawText("TOTAL DUE:", { x: x + 7, y: textY, size: 11, color: COLORS.darkBlue });
  page.drawText(money(data.totalInclusive), { x: x + 138, y: textY, size: 11, color: COLORS.orange });

  return { topY: y, bottomY: y - boxHeight };
}

function drawPaymentAndNotes(page: PDFPage, data: InvoicePdfData, y: number, maxWidth = CONTENT_WIDTH) {
  let currentY = y;
  page.drawText("PAYMENT INFORMATION", { x: LEFT, y: currentY, size: 8, color: COLORS.darkBlue });
  currentY -= 13;
  if (data.bankDetails) {
    const bankLines = [
      `Bank: ${data.bankDetails.bank}`,
      data.bankDetails.branchCode ? `Branch Code: ${data.bankDetails.branchCode}` : undefined,
      `Account Name: ${data.bankDetails.accountName}`,
      `Account Number: ${data.bankDetails.accountNumber}`,
      `Reference: ${data.bankDetails.reference || data.invoiceNumber}`,
    ].filter(Boolean) as string[];
    for (const line of bankLines) {
      for (const wrappedLine of wrapText(line, maxWidth >= 250 ? 50 : 36).slice(0, 2)) {
        page.drawText(wrappedLine, { x: LEFT, y: currentY, size: 7.2, color: COLORS.black });
        currentY -= 9;
      }
    }
  } else {
    page.drawText(truncate("Payment details are available from the issuer on request.", maxWidth >= 250 ? 50 : 36), { x: LEFT, y: currentY, size: 7.2, color: COLORS.gray });
    currentY -= 9;
  }

  currentY -= 13;
  page.drawText(data.notes ? "NOTES" : "TERMS & CONDITIONS", { x: LEFT, y: currentY, size: 8, color: COLORS.darkBlue });
  currentY -= 11;
  const text = data.notes || "Payment is due by the due date shown on this invoice. Thank you for your business.";
  for (const line of wrapText(text, maxWidth >= 250 ? 50 : 36).slice(0, 7)) {
    page.drawText(line, { x: LEFT, y: currentY, size: 6.8, color: COLORS.gray });
    currentY -= 8;
  }
}

async function loadLogo(pdfDoc: PDFDocument) {
  const possiblePaths = [
    path.join(process.cwd(), "client", "public", "afgro-logo.png"),
    path.join(process.cwd(), "dist", "public", "afgro-logo.png"),
    "/home/ubuntu/poultry-business-manager/client/public/afgro-logo.png",
  ];

  for (const logoPath of possiblePaths) {
    if (!fs.existsSync(logoPath)) continue;
    try {
      const image = await pdfDoc.embedPng(fs.readFileSync(logoPath));
      const dimensions = image.scale(0.22);
      return { image, width: dimensions.width, height: dimensions.height };
    } catch {
      // Try the next known PNG location.
    }
  }
  return undefined;
}

/** Generates a paginated A4 invoice that uses persisted invoice values as the source of truth. */
export async function generatePremiumInvoicePDF(invoiceData: InvoicePdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const logo = await loadLogo(pdfDoc);
  const pages: PDFPage[] = [];
  const addPage = () => {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    return page;
  };

  let page = addPage();
  drawFirstPageHeading(page, invoiceData, logo);
  let y = FIRST_PAGE_TABLE_Y;
  drawTableHeader(page, y);
  y -= TABLE_HEADER_HEIGHT + 2;

  for (let index = 0; index < invoiceData.lineItems.length; index += 1) {
    if (y - ROW_HEIGHT < FINAL_CONTENT_MIN_Y) {
      page = addPage();
      drawContinuationHeading(page, invoiceData);
      y = CONTINUATION_TOP;
      drawTableHeader(page, y);
      y -= TABLE_HEADER_HEIGHT + 2;
    }
    drawLineItem(page, invoiceData.lineItems[index], index, y);
    y -= ROW_HEIGHT;
  }

  if (y < 330) {
    page = addPage();
    drawContinuationHeading(page, invoiceData);
    y = CONTINUATION_TOP;
  }

  const summaryTopY = Math.min(y - 8, PREFERRED_SUMMARY_TOP_Y);
  const totalsLayout = drawTotals(page, invoiceData, summaryTopY);
  const sideBySidePaymentWidth = PAGE_WIDTH - RIGHT - 24 - LEFT - 215;
  drawPaymentAndNotes(page, invoiceData, totalsLayout.topY - 4, sideBySidePaymentWidth);

  for (let index = 0; index < pages.length; index += 1) {
    drawFooter(pages[index], index, pages.length);
  }

  return Buffer.from(await pdfDoc.save());
}
