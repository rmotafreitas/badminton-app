import type { PersonalDetails, RegistrationCategory, RegistrationForm } from "@bb/contracts";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

/**
 * The club's "Ficha de Inscrição", drawn on A4 the way the paper form looks, with the member's details already in the
 * blanks. Always Portuguese: it's the club's document. Pure (no DOM), so it runs in tests too.
 */

export interface RegistrationPdfInput {
  clubName: string;
  /** PNG or JPEG bytes of the club's logo; without one the club's name is printed instead. */
  logo?: { bytes: Uint8Array; type: "png" | "jpg" } | null;
  form: RegistrationForm;
  /** The declaration with {fee}/{season}/{club} already filled in. */
  declaration: string;
  categories: readonly RegistrationCategory[];
  person: PersonalDetails;
  nib: string | null;
  /** Only for minors; null leaves the legal guardian's section blank. */
  guardian: PersonalDetails | null;
}

const A4: [number, number] = [595.28, 841.89];
const LEFT = 56;
const RIGHT = 540;
const INK = rgb(0, 0, 0);
const BLUE = rgb(0.07, 0.2, 0.85);
const GREY = rgb(0.35, 0.35, 0.35);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  boldItalic: PDFFont;
}

/** Standard PDF fonts speak WinAnsi (Portuguese accents and € included); anything else becomes "?". */
function printable(font: PDFFont, text: string): string {
  let out = "";
  // Line breaks and tabs become spaces; runs of spaces are kept (the form's "Aprovado em   /   /" needs them).
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** "2004-12-04" → ["4", "12", "2004"]; nothing → three blanks. */
const dateParts = (iso: string | null): string[] => {
  if (!iso) return [];
  const [y, m, d] = iso.split("-");
  return [String(Number(d)), String(Number(m)), y ?? ""];
};

const dmy = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} / ${Number(m)} / ${y}`;
};

class Sheet {
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts,
  ) {}

  /** `top` is measured from the top of the page, like the paper form. */
  y = (top: number) => A4[1] - top;

  text(x: number, top: number, value: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) {
    const font = options.font ?? this.fonts.regular;
    this.page.drawText(printable(font, value), { x, y: this.y(top), size: options.size ?? 9, font, color: options.color ?? INK });
  }

  width = (value: string, size: number, font: PDFFont = this.fonts.regular) => font.widthOfTextAtSize(printable(font, value), size);

  centered(top: number, value: string, options: { size?: number; font?: PDFFont; from?: number; to?: number } = {}) {
    const size = options.size ?? 9;
    const from = options.from ?? 0;
    const to = options.to ?? A4[0];
    this.text(from + (to - from - this.width(value, size, options.font)) / 2, top, value, { ...options, size });
  }

  line(x1: number, x2: number, top: number, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: this.y(top) }, end: { x: x2, y: this.y(top) }, thickness, color: INK });
  }

  checkbox(x: number, top: number, checked: boolean) {
    const s = 7;
    this.page.drawRectangle({ x, y: this.y(top), width: s, height: s, borderColor: INK, borderWidth: 0.6 });
    if (checked) {
      this.page.drawLine({ start: { x: x + 1.2, y: this.y(top) + 1.2 }, end: { x: x + s - 1.2, y: this.y(top) + s - 1.2 }, thickness: 0.8, color: INK });
      this.page.drawLine({ start: { x: x + 1.2, y: this.y(top) + s - 1.2 }, end: { x: x + s - 1.2, y: this.y(top) + 1.2 }, thickness: 0.8, color: INK });
    }
  }

  /** A small-caps label followed by a blank (underline) holding `value`, shrunk to fit. Returns where it ends. */
  field(x: number, top: number, label: string, value: string, end: number) {
    const labelSize = 7.6;
    this.text(x, top, label, { size: labelSize });
    const start = x + this.width(label, labelSize) + 2;
    this.line(start, end, top + 1.5);
    if (value) {
      let size = 9;
      while (size > 5.5 && this.width(value, size) > end - start - 4) size -= 0.25;
      let shown = value;
      while (shown.length > 1 && this.width(shown, size) > end - start - 4) shown = shown.slice(0, -1);
      this.text(start + 3, top - 0.5, shown, { size });
    }
    return end;
  }

  /**
   * A label followed by short blanks split by `sep` (a date's `__/__/____`, a postal code's `____-___`), so the paper
   * reads right whether it was filled in here or will be by hand. Each part's value is centred on its own blank.
   */
  slots(x: number, top: number, label: string, end: number, weights: readonly number[], sep: string, values: readonly string[]) {
    const labelSize = 7.6;
    this.text(x, top, label, { size: labelSize });
    const start = x + this.width(label, labelSize) + 2;
    const sepWidth = this.width(sep, 9) + 4;
    const room = end - start - sepWidth * (weights.length - 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let at = start;
    weights.forEach((weight, i) => {
      const width = (room * weight) / total;
      this.line(at, at + width, top + 1.5);
      const value = values[i] ?? "";
      if (value) this.text(at + (width - this.width(value, 9)) / 2, top - 0.5, value);
      at += width;
      if (i < weights.length - 1) {
        this.text(at + 2, top, sep, { size: 9 });
        at += sepWidth;
      }
    });
    return end;
  }

  /** Word-wrapped paragraph; returns the top of the line after it. */
  paragraph(top: number, value: string, size: number, lineHeight: number) {
    const words = printable(this.fonts.regular, value).split(/ +/).filter(Boolean);
    let line = "";
    let y = top;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (this.width(next, size) > RIGHT - LEFT && line) {
        this.text(LEFT, y, line, { size });
        y += lineHeight;
        line = word;
      } else line = next;
    }
    if (line) this.text(LEFT, y, line, { size });
    return y + lineHeight;
  }
}

/** The identification block (athlete or guardian): seven rows of label + blank, like the paper. */
function personRows(sheet: Sheet, top: number, p: PersonalDetails | null, nib: string | null | undefined) {
  const v = (s: string | null | undefined) => s ?? "";
  const row = 13.2;
  let t = top;
  sheet.field(LEFT, t, "NOME:", v(p?.fullName), RIGHT);
  t += row;
  sheet.text(LEFT, t, "SEXO:  M", { size: 7.6 });
  const m = LEFT + sheet.width("SEXO:  M", 7.6) + 3;
  sheet.checkbox(m, t, p?.sex === "M");
  sheet.text(m + 12, t, "F", { size: 7.6 });
  sheet.checkbox(m + 12 + sheet.width("F", 7.6) + 3, t, p?.sex === "F");
  sheet.slots(LEFT + 82, t, "DATA DE NASCIMENTO:", 298, [1, 1, 1.5], "/", dateParts(p?.birthday ?? null));
  sheet.field(310, t, "NACIONALIDADE:", v(p?.nationality), RIGHT);
  t += row;
  sheet.field(LEFT, t, "MORADA:", v(p?.address), 384);
  sheet.field(388, t, "LOCALIDADE:", v(p?.locality), RIGHT);
  t += row;
  sheet.field(LEFT, t, "CONCELHO:", v(p?.municipality), 346);
  sheet.slots(360, t, "CÓDIGO POSTAL:", RIGHT, [4, 3], "-", p?.postalCode ? p.postalCode.split("-") : []);
  t += row;
  sheet.field(LEFT, t, "BI/ CC:", v(p?.idNumber), 190);
  sheet.field(204, t, "EMITIDO/VÁLIDO:", dmy(p?.idValidUntil ?? null).replaceAll(" ", ""), 413);
  sheet.field(422, t, "NIF:", v(p?.nif), RIGHT);
  t += row;
  sheet.field(LEFT, t, "TELEMÓVEL:", v(p?.phone), 238);
  sheet.field(270, t, "EMAIL:", v(p?.email), RIGHT);
  t += row;
  sheet.field(LEFT, t, "PROFISSÃO / OCUPAÇÃO:", v(p?.profession), 320);
  if (nib !== undefined) {
    t += row;
    sheet.field(LEFT, t, "NIB:", v(nib), 320);
  }
  return t + row;
}

export async function buildRegistrationPdf(input: RegistrationPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Ficha de Inscrição ${input.form.season} — ${input.person.fullName ?? ""}`.trim());
  doc.setCreator("Badminton Buddy");
  doc.setLanguage("pt-PT");
  const page = doc.addPage(A4);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const s = new Sheet(page, fonts);

  // ── Header: logo left, title right ──
  if (input.logo) {
    const image = input.logo.type === "png" ? await doc.embedPng(input.logo.bytes) : await doc.embedJpg(input.logo.bytes);
    const scale = Math.min(190 / image.width, 100 / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: LEFT + 10 + (190 - w) / 2, y: s.y(42 + 100) + (100 - h) / 2, width: w, height: h });
  } else {
    s.centered(98, input.clubName.toUpperCase(), { size: 13, font: fonts.bold, from: LEFT, to: 290 });
  }
  s.centered(80, "FICHA DE INSCRIÇÃO", { size: 15, font: fonts.bold, from: 300, to: RIGHT });
  s.centered(108, `ÉPOCA DESPORTIVA ${input.form.season}`, { size: 15, font: fonts.bold, from: 300, to: RIGHT });

  // ── 1. Athlete ──
  s.text(LEFT, 178, "1 – Identificação do atleta", { size: 9.5, font: fonts.bold });
  const boxes: [RegistrationCategory, string, number][] = [
    ["ATLETA", "ATLETA", LEFT],
    ["FORMACAO", "FORMAÇÃO", 168],
    ["PRATICANTE", "PRATICANTE", 308],
    ["SOCIO", "SÓCIO", 492],
  ];
  for (const [key, label, x] of boxes) {
    s.text(x, 190, label, { size: 7.6 });
    s.checkbox(x + s.width(label, 7.6) + 3, 190, input.categories.includes(key));
  }
  let top = personRows(s, 204, input.person, input.nib);

  // ── Legal guardian ──
  top += 14;
  s.text(LEFT, top, "REPRESENTANTE LEGAL:", { size: 9, font: fonts.boldItalic });
  s.text(LEFT + s.width("REPRESENTANTE LEGAL:", 9, fonts.boldItalic) + 4, top, "(PREENCHIMENTO EM CASO DE MENORES DE 18 ANOS)", { size: 7.6 });
  top = personRows(s, top + 14, input.guardian, undefined);

  // ── 2. Declaration ──
  top += 12;
  s.text(LEFT, top, `2 – Declaração / Autorização Época desportiva ${input.form.season}`, { size: 9.5, font: fonts.bold });
  top = s.paragraph(top + 20, input.declaration, 9.4, 12.2);

  // ── Signatures ──
  top += 8;
  s.text(LEFT, top, "Assinatura do proposto", { size: 9.4 });
  s.text(255, top, "Data ____ / ____ / ____", { size: 9.4 });
  s.text(RIGHT - s.width("Assinatura do Representante legal", 9.4), top, "Assinatura do Representante legal", { size: 9.4 });
  s.line(LEFT, 238, top + 26);
  s.line(352, RIGHT, top + 26);

  // ── The club's box ──
  const boxTop = top + 40;
  const boxHeight = 118;
  page.drawRectangle({ x: LEFT, y: s.y(boxTop + boxHeight), width: RIGHT - LEFT, height: boxHeight, borderColor: INK, borderWidth: 0.7 });
  s.centered(boxTop + 18, `A PREENCHER PELO ${input.clubName.toUpperCase()}`, { size: 9, font: fonts.bold, from: LEFT, to: RIGHT });
  s.text(LEFT + 8, boxTop + 42, "Aprovado em      /      /", { size: 9 });
  s.text(350, boxTop + 42, "Assinatura do Presidente da direção", { size: 9 });
  s.text(LEFT + 8, boxTop + 80, "Obs:", { size: 9 });
  s.line(352, RIGHT - 12, boxTop + 86);

  // ── Footer: the club's contacts, e-mail addresses in blue like a link ──
  let footerTop = boxTop + boxHeight + 22;
  for (const line of input.form.footer.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const words = line.split(/(\s+)/);
    const width = s.width(line, 10);
    let x = (A4[0] - width) / 2;
    for (const word of words) {
      if (!word) continue;
      s.text(x, footerTop, word, { size: 10, color: word.includes("@") ? BLUE : INK });
      x += s.width(word, 10);
    }
    footerTop += 14;
  }
  s.text(LEFT, A4[1] - 14, "Gerado pelo Badminton Buddy", { size: 6, color: GREY });

  return doc.save();
}
