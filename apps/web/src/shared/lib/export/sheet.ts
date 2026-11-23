/**
 * Spreadsheet files built in the browser: Excel (.xlsx) and CSV from the same rows. No dependency for the CSV; the
 * .xlsx is a handful of XML parts zipped with fflate (this module is lazy-loaded, so it costs nothing until used).
 */
import { strToU8, zipSync } from "fflate";

/** A cell: text, a number, a moment (`Date`), a calendar day (`{ day: "YYYY-MM-DD" }`), or nothing. */
export type ExportCell = string | number | Date | { readonly day: string } | null;

export interface ExportTable {
  /** The sheet's name (Excel allows 31 characters) and the file's base name. */
  readonly name: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly ExportCell[])[];
}

// ── Shared ───────────────────────────────────────────────────────────────────

const isDay = (cell: ExportCell): cell is { day: string } => typeof cell === "object" && cell !== null && !(cell instanceof Date);
const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localMoment = (d: Date) => `${localDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Spreadsheet formula injection: text starting with = + - @ (or a tab / CR), even after leading spaces that a
 * spreadsheet may skip, would run as a formula.
 */
const csvText = (text: string, separator: string) => {
  const safe = /^[\s\u00A0]*[=+\-@]|^[\t\r]/.test(text) ? `'${text}` : text;
  return safe.includes(separator) || /["\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/**
 * CSV the way Excel opens it in that language: `;` and a decimal comma for Portuguese, `,` and a decimal point
 * otherwise. A UTF-8 BOM so accents survive, CRLF line ends, local dates.
 */
export function toCsv(table: ExportTable, lang: "en" | "pt"): string {
  const separator = lang === "pt" ? ";" : ",";
  const cell = (value: ExportCell) => {
    if (value === null) return "";
    if (typeof value === "number") return lang === "pt" ? String(value).replace(".", ",") : String(value);
    if (value instanceof Date) return localMoment(value);
    if (typeof value === "object") return value.day;
    return csvText(value, separator);
  };
  const lines = [table.headers.map((h) => csvText(h, separator)).join(separator), ...table.rows.map((row) => row.map(cell).join(separator))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ── Excel ────────────────────────────────────────────────────────────────────

const MAX_CELL_TEXT = 32_767;

/** XML-safe text: escaped, without the control characters XML 1.0 forbids, within Excel's cell limit. */
const xml = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .slice(0, MAX_CELL_TEXT)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A1-style column letters: 0 → A, 25 → Z, 26 → AA. */
export const columnName = (index: number): string => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

/** Excel's serial date: days since 1899-12-30, in local wall-clock time (what the person saw on screen). */
const serial = (d: Date) => (d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000 + 25_569;
const daySerial = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000 + 25_569;

/** Sheet names can't hold []:*?/\ and are at most 31 characters. */
const sheetName = (name: string) => name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet1";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Styles: 0 plain, 1 bold header, 2 date (built-in 14, follows Excel's locale), 3 date and time (built-in 22).
const STYLES = `${HEAD}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function xlsxCell(ref: string, value: ExportCell, header = false): string {
  if (value === null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : `<c r="${ref}" s="3"><v>${serial(value)}</v></c>`;
  if (typeof value === "object") {
    const n = daySerial(value.day);
    return Number.isNaN(n) ? "" : `<c r="${ref}" s="2"><v>${n}</v></c>`;
  }
  // Inline strings are never formulas, so nothing typed into the app can run in Excel.
  return `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

/** Column widths from the header and the first rows' contents, within reason. */
function widths(table: ExportTable): number[] {
  const sample = table.rows.slice(0, 200);
  return table.headers.map((h, i) => {
    let longest = h.length;
    for (const row of sample) {
      const v = row[i];
      const len = v === null ? 0 : v instanceof Date ? 16 : isDay(v) ? 10 : String(v).length;
      if (len > longest) longest = len;
    }
    return Math.min(Math.max(longest + 2, 8), 50);
  });
}

/** A one-sheet workbook: bold, frozen header row with filter buttons; real numbers and dates. */
export function toXlsx(table: ExportTable): Uint8Array {
  const name = sheetName(table.name);
  const columns = table.headers.length;
  const last = `${columnName(Math.max(columns - 1, 0))}${table.rows.length + 1}`;
  const letters = Array.from({ length: columns }, (_, i) => columnName(i));
  const parts: string[] = [];
  parts.push(`${HEAD}<worksheet xmlns="${NS}" xmlns:r="${REL_NS}">`);
  parts.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  parts.push(`<cols>${widths(table).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`);
  parts.push("<sheetData>");
  parts.push(`<row r="1">${table.headers.map((h, i) => xlsxCell(`${letters[i]}1`, h, true)).join("")}</row>`);
  table.rows.forEach((row, r) => {
    const n = r + 2;
    let cells = "";
    for (let i = 0; i < columns; i++) cells += xlsxCell(`${letters[i]}${n}`, row[i] ?? null);
    parts.push(`<row r="${n}">${cells}</row>`);
  });
  parts.push("</sheetData>");
  if (columns) parts.push(`<autoFilter ref="A1:${last}"/>`);
  parts.push("</worksheet>");

  const quoted = `'${name.replaceAll("'", "''")}'`;
  const filterRange = `${quoted}!$A$1:$${columnName(Math.max(columns - 1, 0))}$${table.rows.length + 1}`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `${HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `${HEAD}<workbook xmlns="${NS}" xmlns:r="${REL_NS}"><sheets><sheet name="${xml(name)}" sheetId="1" r:id="rId1"/></sheets>${
        columns ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xml(filterRange)}</definedName></definedNames>` : ""
      }</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(parts.join("")),
  };
  return zipSync(files, { level: 6 });
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
