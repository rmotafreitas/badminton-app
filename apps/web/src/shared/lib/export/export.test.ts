import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { collectRows, ExportAborted, ExportChanged, type ExportPage, noPages } from "./collect";
import { columnName, type ExportTable, toCsv, toXlsx } from "./sheet";

const table: ExportTable = {
  name: "Members: CFBG/2026",
  headers: ["id", "Name", "Rating", "Joined", "Born"],
  rows: [
    ["a1", "=HYPERLINK(\"x\")", 1234.5, new Date(2026, 1, 3, 14, 5), { day: "2004-12-04" }],
    ["a2", 'Ana "Nê"; Silva\nLisboa', null, null, null],
    ["a3", "+351 912 345 678 <b>&\u0007", -3, null, null],
  ],
};

describe("CSV", () => {
  it("Portuguese: ';', decimal comma, BOM, CRLF, quoted where needed, formulas defused", () => {
    const csv = toCsv(table, "pt");
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("id;Name;Rating;Joined;Born");
    expect(lines[1]).toBe(`a1;"'=HYPERLINK(""x"")";1234,5;2026-02-03 14:05;2004-12-04`);
    expect(lines[2]).toBe('a2;"Ana ""Nê""; Silva\nLisboa";;;');
    expect(csv).toContain("'+351 912 345 678");
    // Leading spaces don't hide a formula.
    expect(toCsv({ name: "x", headers: ["a"], rows: [["  =1+1"], ["\u00A0@SUM(A1)"], ["a = b"]] }, "en")).toBe("\uFEFFa\r\n'  =1+1\r\n'\u00A0@SUM(A1)\r\na = b\r\n");
    // Numbers aren't text, so a negative one isn't "defused".
    expect(csv).toContain(";-3;");
  });

  it("English: ',' and a decimal point", () => {
    const lines = toCsv(table, "en").slice(1).split("\r\n");
    expect(lines[0]).toBe("id,Name,Rating,Joined,Born");
    expect(lines[1]).toContain(",1234.5,");
  });
});

describe("Excel", () => {
  const files = unzipSync(toXlsx(table));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"] as Uint8Array);

  it("is a complete workbook", () => {
    expect(Object.keys(files).sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort(),
    );
    const workbook = strFromU8(files["xl/workbook.xml"] as Uint8Array);
    // Sheet names can't hold : or /.
    expect(workbook).toContain('<sheet name="Members  CFBG 2026"');
    expect(workbook).toContain("_xlnm._FilterDatabase");
  });

  it("numbers and dates are real cells; text is never a formula; XML is safe", () => {
    expect(sheet).toContain('<c r="C2"><v>1234.5</v></c>');
    // 2026-02-03 14:05 local → serial 46056.586…, date-time style.
    expect(sheet).toMatch(/<c r="D2" s="3"><v>46056\.58680555/);
    expect(sheet).toContain('<c r="E2" s="2"><v>38325</v></c>');
    expect(sheet).toContain('<t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t>');
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("+351 912 345 678 &lt;b&gt;&amp;</t>");
    expect(sheet).not.toContain("\u0007");
    expect(sheet).toContain('<autoFilter ref="A1:E4"/>');
  });

  it("names columns past Z", () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
});

describe("collecting pages", () => {
  const source = (total: number, pageSize: number, fail: (page: number, attempt: number) => boolean = () => false) => {
    const attempts = new Map<number, number>();
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchPage = async (page: number): Promise<ExportPage> => {
      const attempt = (attempts.get(page) ?? 0) + 1;
      attempts.set(page, attempt);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      if (fail(page, attempt)) throw new Error(`page ${page} failed`);
      const from = (page - 1) * pageSize;
      return { total, rows: Array.from({ length: Math.max(Math.min(pageSize, total - from), 0) }, (_, i) => [from + i]) };
    };
    return { fetchPage, attempts, maxInFlight: () => maxInFlight };
  };

  it("fetches every page, a few at a time, in order, reporting progress", async () => {
    const s = source(1050, 100);
    const progress: number[] = [];
    const result = await collectRows({ fetchPage: s.fetchPage, pageSize: 100, maxRows: 100_000, signal: new AbortController().signal, onProgress: (p) => progress.push(p.done) });
    expect(result.rows.map((r) => r[0])).toEqual(Array.from({ length: 1050 }, (_, i) => i));
    expect(result.capped).toBe(false);
    expect(s.maxInFlight()).toBeLessThanOrEqual(4);
    expect(s.maxInFlight()).toBeGreaterThan(1);
    expect(progress.at(-1)).toBe(1050);
  });

  it("retries a failing page, and stops at the cap", async () => {
    const s = source(500, 100, (page, attempt) => page === 3 && attempt < 3);
    const result = await collectRows({ fetchPage: s.fetchPage, pageSize: 100, maxRows: 250, signal: new AbortController().signal });
    expect(result.rows).toHaveLength(250);
    expect(result.capped).toBe(true);
    expect(s.attempts.get(3)).toBe(3);
    expect(s.attempts.has(4)).toBe(false);
  });

  it("a page that keeps failing rejects; trying again fetches only what's missing", async () => {
    let broken = true;
    const s = source(300, 100, (page) => broken && page === 2);
    const received = noPages();
    const signal = new AbortController().signal;
    await expect(collectRows({ fetchPage: s.fetchPage, pageSize: 100, maxRows: 1000, signal, received, retries: 1 })).rejects.toThrow("page 2 failed");
    broken = false;
    const before = s.attempts.get(3);
    const result = await collectRows({ fetchPage: s.fetchPage, pageSize: 100, maxRows: 1000, signal, received, retries: 1 });
    expect(result.rows).toHaveLength(300);
    expect(s.attempts.get(3)).toBe(before);
  });

  it("rows moving between pages mean starting over, never a file with gaps", async () => {
    let total = 300;
    const received = noPages();
    const fetchPage = async (page: number): Promise<ExportPage> => {
      if (page === 2) total = 299; // someone deleted a row meanwhile
      return { total, rows: [[page]] };
    };
    await expect(collectRows({ fetchPage, pageSize: 100, maxRows: 1000, signal: new AbortController().signal, received })).rejects.toBeInstanceOf(ExportChanged);
    expect(received.pages.size).toBe(0);
  });

  it("resuming after the total changed refetches everything", async () => {
    let total = 300;
    let fail = true;
    const fetched: number[] = [];
    const fetchPage = async (page: number): Promise<ExportPage> => {
      fetched.push(page);
      if (fail && page === 3) throw new Error("down");
      return { total, rows: Array.from({ length: Math.min(100, total - (page - 1) * 100) }, () => [page]) };
    };
    const received = noPages();
    const signal = new AbortController().signal;
    await expect(collectRows({ fetchPage, pageSize: 100, maxRows: 1000, signal, received, retries: 0 })).rejects.toThrow("down");
    total = 250;
    fail = false;
    fetched.length = 0;
    const result = await collectRows({ fetchPage, pageSize: 100, maxRows: 1000, signal, received, retries: 0 });
    expect(result.rows).toHaveLength(250);
    expect(fetched.sort()).toEqual([1, 2, 3]);
  });

  it("cancelling stops it", async () => {
    const controller = new AbortController();
    const s = source(1000, 100, () => true);
    const run = collectRows({ fetchPage: s.fetchPage, pageSize: 100, maxRows: 1000, signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await expect(run).rejects.toBeInstanceOf(ExportAborted);
  });
});
