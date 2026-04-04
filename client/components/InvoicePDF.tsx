import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

interface InvoiceData {
  invoiceNumber: string;
  reference: string;
  date: string;
  dueDate: string;
  salesRep: string;
  overallDiscount: number;
  
  // From (Supplier)
  fromCompany: string;
  fromVatNo: string;
  fromRegNo: string;
  fromPostalAddress: string;
  fromPhysicalAddress: string;
  
  // To (Customer)
  toCompany: string;
  toVatNo: string;
  toRegNo: string;
  toPostalAddress: string;
  toPhysicalAddress: string;
  
  // Line items
  lineItems: Array<{
    description: string;
    quantity: number;
    pricePerKg: number;
    weight: number;
    discountPercent: number;
    vatPercent: number;
    exclusiveTotal: number;
    inclusiveTotal: number;
  }>;
  
  // Totals
  totalDiscount: number;
  totalExclusive: number;
  totalVat: number;
  subTotal: number;
  grandTotal: number;
  balanceDue: number;
  
  // Payment details
  bankName: string;
  branchCode: string;
  accountName: string;
  accountNumber: string;
  reference: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: "#003d5c",
    paddingBottom: 20,
  },
  logo: {
    width: 120,
    height: 120,
  },
  invoiceTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#003d5c",
    marginBottom: 15,
  },
  invoiceDetails: {
    textAlign: "right",
  },
  detailRow: {
    display: "flex",
    flexDirection: "row",
    marginBottom: 5,
    fontSize: 10,
  },
  detailLabel: {
    width: 120,
    fontWeight: "bold",
    color: "#333",
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
    color: "#666",
  },
  fromToSection: {
    display: "flex",
    flexDirection: "row",
    gap: 40,
    marginBottom: 30,
  },
  fromToBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 15,
    backgroundColor: "#f9f9f9",
  },
  fromToLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#003d5c",
    textTransform: "uppercase",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 5,
  },
  companyName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  companyInfo: {
    fontSize: 10,
    color: "#666",
    lineHeight: 1.5,
    marginBottom: 3,
  },
  table: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 2,
    borderBottomColor: "#003d5c",
    paddingVertical: 8,
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 8,
  },
  tableCell: {
    fontSize: 10,
    padding: 5,
    color: "#333",
  },
  tableCellHeader: {
    fontSize: 10,
    fontWeight: "bold",
    padding: 5,
    color: "#003d5c",
  },
  descriptionCol: { flex: 2 },
  numberCol: { flex: 1, textAlign: "right" },
  totalsSection: {
    display: "flex",
    flexDirection: "row",
    marginBottom: 20,
  },
  totalsBox: {
    marginLeft: "auto",
    width: 250,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  totalRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  totalRowFinal: {
    display: "flex",
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: "#003d5c",
    borderBottomWidth: 2,
    borderBottomColor: "#003d5c",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9f9f9",
  },
  totalLabel: {
    flex: 1,
    fontSize: 10,
    color: "#333",
  },
  totalLabelFinal: {
    flex: 1,
    fontSize: 12,
    fontWeight: "bold",
    color: "#003d5c",
  },
  totalValue: {
    fontSize: 10,
    textAlign: "right",
    color: "#333",
  },
  totalValueFinal: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "right",
    color: "#003d5c",
  },
  paymentSection: {
    display: "flex",
    flexDirection: "row",
    gap: 20,
    marginBottom: 20,
  },
  paymentBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
  paymentTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#003d5c",
    marginBottom: 8,
  },
  paymentInfo: {
    fontSize: 9,
    color: "#666",
    lineHeight: 1.5,
    marginBottom: 3,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#003d5c",
    paddingTop: 10,
    textAlign: "center",
    fontSize: 8,
    color: "#999",
  },
});

export const InvoicePDF: React.FC<{ data: InvoiceData }> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Image src="/afgro-logo.png" style={styles.logo} />
        </View>
        <View style={styles.invoiceDetails}>
          <Text style={styles.invoiceTitle}>INVOICE</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>NUMBER:</Text>
            <Text style={styles.detailValue}>{data.invoiceNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>REFERENCE:</Text>
            <Text style={styles.detailValue}>{data.reference}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>DATE:</Text>
            <Text style={styles.detailValue}>{data.date}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>DUE DATE:</Text>
            <Text style={styles.detailValue}>{data.dueDate}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>SALES REP:</Text>
            <Text style={styles.detailValue}>{data.salesRep}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>OVERALL DISCOUNT %:</Text>
            <Text style={styles.detailValue}>{data.overallDiscount.toFixed(2)}%</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>PAGE:</Text>
            <Text style={styles.detailValue}>1/1</Text>
          </View>
        </View>
      </View>

      {/* From/To */}
      <View style={styles.fromToSection}>
        <View style={styles.fromToBox}>
          <Text style={styles.fromToLabel}>FROM</Text>
          <Text style={styles.companyName}>{data.fromCompany}</Text>
          <Text style={styles.companyInfo}>VAT NO: {data.fromVatNo}</Text>
          <Text style={styles.companyInfo}>REG NO: {data.fromRegNo}</Text>
          <Text style={styles.companyInfo}>POSTAL ADDRESS:</Text>
          <Text style={styles.companyInfo}>{data.fromPostalAddress}</Text>
          <Text style={styles.companyInfo}>PHYSICAL ADDRESS:</Text>
          <Text style={styles.companyInfo}>{data.fromPhysicalAddress}</Text>
        </View>
        <View style={styles.fromToBox}>
          <Text style={styles.fromToLabel}>TO</Text>
          <Text style={styles.companyName}>{data.toCompany}</Text>
          <Text style={styles.companyInfo}>CUSTOMER VAT NO: {data.toVatNo}</Text>
          <Text style={styles.companyInfo}>CUSTOMER REG NO: {data.toRegNo}</Text>
          <Text style={styles.companyInfo}>POSTAL ADDRESS:</Text>
          <Text style={styles.companyInfo}>{data.toPostalAddress}</Text>
          <Text style={styles.companyInfo}>PHYSICAL ADDRESS:</Text>
          <Text style={styles.companyInfo}>{data.toPhysicalAddress}</Text>
        </View>
      </View>

      {/* Line Items Table */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellHeader, styles.descriptionCol]}>Description</Text>
          <Text style={[styles.tableCellHeader, styles.numberCol]}>Quantity</Text>
          <Text style={[styles.tableCellHeader, styles.numberCol]}>P/KG</Text>
          <Text style={[styles.tableCellHeader, styles.numberCol]}>Weight(kg)</Text>
          <Text style={[styles.tableCellHeader, styles.numberCol]}>Disc %</Text>
          <Text style={[styles.tableCellHeader, styles.numberCol]}>VAT %</Text>
          <Text style={[styles.tableCellHeader, styles.numberCol]}>Excl. Total</Text>
          <Text style={[styles.tableCellHeader, styles.numberCol]}>Incl. Total</Text>
        </View>
        {data.lineItems.map((item, index) => (
          <View key={index} style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.descriptionCol]}>{item.description}</Text>
            <Text style={[styles.tableCell, styles.numberCol]}>{item.quantity}</Text>
            <Text style={[styles.tableCell, styles.numberCol]}>R {item.pricePerKg.toFixed(2)}</Text>
            <Text style={[styles.tableCell, styles.numberCol]}>{item.weight.toFixed(2)}</Text>
            <Text style={[styles.tableCell, styles.numberCol]}>{item.discountPercent.toFixed(2)}%</Text>
            <Text style={[styles.tableCell, styles.numberCol]}>{item.vatPercent.toFixed(2)}%</Text>
            <Text style={[styles.tableCell, styles.numberCol]}>R {item.exclusiveTotal.toFixed(2)}</Text>
            <Text style={[styles.tableCell, styles.numberCol]}>R {item.inclusiveTotal.toFixed(2)}</Text>
          </View>
        ))}
      </View>

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Discount:</Text>
            <Text style={styles.totalValue}>R {data.totalDiscount.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Exclusive:</Text>
            <Text style={styles.totalValue}>R {data.totalExclusive.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total VAT:</Text>
            <Text style={styles.totalValue}>R {data.totalVat.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Sub Total:</Text>
            <Text style={styles.totalValue}>R {data.subTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalLabelFinal}>Grand Total:</Text>
            <Text style={styles.totalValueFinal}>R {data.grandTotal.toFixed(2)}</Text>
          </View>
          <View style={[styles.totalRow, { paddingVertical: 10 }]}>
            <Text style={[styles.totalLabel, { fontWeight: "bold", color: "#003d5c" }]}>BALANCE DUE:</Text>
            <Text style={[styles.totalValue, { fontWeight: "bold", color: "#003d5c", fontSize: 12 }]}>
              R {data.balanceDue.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Payment Details */}
      <View style={styles.paymentSection}>
        <View style={styles.paymentBox}>
          <Text style={styles.paymentTitle}>Payment Method</Text>
          <Text style={styles.paymentInfo}>Bank Transfer</Text>
          <Text style={styles.paymentInfo}>Bank: {data.bankName}</Text>
          <Text style={styles.paymentInfo}>Branch Code: {data.branchCode}</Text>
          <Text style={styles.paymentInfo}>Account Name: {data.accountName}</Text>
          <Text style={styles.paymentInfo}>Account Number: {data.accountNumber}</Text>
          <Text style={styles.paymentInfo}>Reference: {data.reference}</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Company Registration: 2249-1 | AFGRO FARMING GROUP (PTY) LTD.</Text>
        <Text>VAT NO: 4960323782 | Email: 21/03/2054.71 | info@afgro.co.za</Text>
        <Text>Contact Info: afgrofarminggroupgro.ou.zu</Text>
      </View>
    </Page>
  </Document>
);
