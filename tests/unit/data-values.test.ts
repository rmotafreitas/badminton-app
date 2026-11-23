import { describe, expect, it } from "bun:test";
import { type FieldDef, parseValue, parseValues, type TableDef, TABLES, tableDef } from "@bb/application";
import { ROLES } from "@bb/domain";

const field = (f: Partial<FieldDef> & Pick<FieldDef, "type">): FieldDef => ({ key: "x", label: { en: "X", pt: "X" }, ...f });

describe("data: submitted values", () => {
  it("days are real calendar days", () => {
    expect(parseValue(field({ type: "day" }), "2026-02-28")).toBe("2026-02-28");
    expect(() => parseValue(field({ type: "day" }), "2026-02-31")).toThrow();
    expect(() => parseValue(field({ type: "day" }), "28/02/2026")).toThrow();
    expect(parseValue(field({ type: "day" }), null)).toBeNull();
  });

  it("text is trimmed and bounded; empty clears", () => {
    expect(parseValue(field({ type: "text", max: 5 }), "  abc ")).toBe("abc");
    expect(parseValue(field({ type: "text" }), "   ")).toBeNull();
    expect(() => parseValue(field({ type: "text", max: 2 }), "abc")).toThrow();
    expect(() => parseValue(field({ type: "text" }), 3)).toThrow();
  });

  it("numbers, enums, roles, ids and sets are checked", () => {
    expect(parseValue(field({ type: "integer" }), "7")).toBe(7);
    expect(() => parseValue(field({ type: "integer" }), 7.5)).toThrow();
    expect(parseValue(field({ type: "enum", options: ["A", "B"] }), "B")).toBe("B");
    expect(() => parseValue(field({ type: "enum", options: ["A"] }), "Z")).toThrow();
    expect(parseValue(field({ type: "roles" }), ["COACH", "COACH"])).toEqual(["COACH"]);
    expect(() => parseValue(field({ type: "roles" }), ["KING"])).toThrow();
    expect(() => parseValue(field({ type: "ref" }), "not-an-id")).toThrow();
    expect(parseValue(field({ type: "sets" }), [{ team1Score: 21, team2Score: 19 }])).toEqual([{ team1Score: 21, team2Score: 19 }]);
    expect(() => parseValue(field({ type: "sets" }), [{ team1Score: 100, team2Score: 0 }])).toThrow();
    expect(() => parseValue(field({ type: "datetime" }), "yesterday")).toThrow();
  });

  it("fields the caller may not set are an error, and required ones must be there on create", () => {
    const name = field({ key: "name", type: "text", required: true });
    expect(() => parseValues([name], { email: "x@y.z" }, "edit")).toThrow();
    expect(() => parseValues([name], {}, "create")).toThrow();
    expect(parseValues([name], {}, "edit")).toEqual({});
    expect(() => parseValues([name], { name: " " }, "edit")).toThrow();
  });
});

describe("data: the registry is consistent", () => {
  it("every view and related link names real fields of the right kind", () => {
    for (const table of TABLES) {
      const field = (t: TableDef, key: string) => t.fields.find((f) => f.key === key);
      for (const view of table.views ?? []) {
        expect(view.where.length).toBeGreaterThan(0);
        for (const c of view.where) {
          const f = field(table, c.field);
          expect(f, `${table.key}.${view.key}: no field "${c.field}"`).toBeDefined();
          if ("is" in c) {
            if (f!.type === "boolean") expect(typeof c.is).toBe("boolean");
            if (f!.type === "enum") expect(f!.options).toContain(c.is as string);
            if (f!.type === "roles") expect(ROLES).toContain(c.is as never);
          } else if (!("empty" in c)) {
            expect(["datetime"], `${table.key}.${view.key}: dates only`).toContain(f!.type);
          }
        }
      }
      for (const r of table.related ?? []) {
        const child = tableDef(r.table)!;
        for (const key of r.fields) {
          const f = field(child, key);
          expect(f, `${table.key} → ${r.table}.${key}`).toBeDefined();
          expect(["ref", "refs"]).toContain(f!.type);
          expect(f!.ref).toBe(table.key);
        }
      }
      for (const f of table.fields) if (f.optionLabels) expect(Object.keys(f.optionLabels).sort()).toEqual([...(f.options ?? [])].sort());
    }
  });
});
