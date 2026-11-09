import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { isMinor } from "./download";
import { buildRegistrationPdf, type RegistrationPdfInput } from "./pdf";

const person = {
  fullName: "Ricardo Freitas",
  sex: "M" as const,
  birthday: "2004-12-04",
  nationality: "Portuguesa",
  address: "Rua das Marinhas 59 M19",
  locality: "Porto Gaia",
  municipality: "Vila Nova de Gaia",
  postalCode: "4405-663",
  idNumber: "30748394",
  idValidUntil: "2026-10-27",
  nif: "255402015",
  phone: "967083100",
  email: "rmotafreitas@gmail.com",
  profession: "Estudante",
};

const input: RegistrationPdfInput = {
  clubName: "Clube Badminton de Gaia",
  form: { season: "2025/2026", feeEuros: 15, declaration: "", footer: "NIF: 510376690\nclube@gmail.com" },
  declaration: "Declaro que tomei conhecimento do valor da quota anual de sócio no valor de 15,00€.",
  categories: ["FORMACAO"],
  person,
  nib: null,
  guardian: null,
};

/** Every stream of the file, inflated (pdf-lib compresses page content). */
function contents(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const start = raw.indexOf("stream\n", at);
    if (start < 0) break;
    const end = raw.indexOf("\nendstream", start);
    try {
      out.push(inflateSync(raw.subarray(start + 7, end)).toString("latin1"));
    } catch {
      // not a Flate stream (e.g. the XRef stream's own encoding): skip
    }
    at = end + 10;
  }
  return out.join("\n").toUpperCase();
}

/** pdf-lib writes standard-font text as hex WinAnsi strings: `<52696361...> Tj`. */
const hex = (text: string) => Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

describe("registration PDF", () => {
  it("is one A4 page with the member's details in it", async () => {
    const bytes = await buildRegistrationPdf(input);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(doc.getTitle()).toContain("2025/2026");
    const raw = contents(bytes);
    for (const text of ["Ricardo Freitas", "255402015", "4405", "663", "2004", "FICHA DE INSCRI"]) expect(raw).toContain(hex(text));
  });

  it("survives characters the PDF fonts can't print", async () => {
    await expect(buildRegistrationPdf({ ...input, person: { ...person, fullName: "Zoë 🏸 Ł" } })).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("isMinor", () => {
  const day = new Date(2026, 10, 9);
  it("is under 18 on the day", () => {
    expect(isMinor("2008-11-10", day)).toBe(true);
    expect(isMinor("2008-11-09", day)).toBe(false);
    expect(isMinor("2004-12-04", day)).toBe(false);
    expect(isMinor(null, day)).toBe(false);
  });
});
