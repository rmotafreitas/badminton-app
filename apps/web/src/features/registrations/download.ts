import type { PersonalDetails, RegistrationCategory, RegistrationSheet } from "@bb/contracts";

/** Club logos are served as WebP; PDFs take PNG or JPEG, so the browser re-draws it as PNG. Best effort. */
async function logoPng(url: string | null): Promise<{ bytes: Uint8Array; type: "png" } | null> {
  if (!url) return null;
  try {
    const blob = await (await fetch(url, { credentials: "same-origin" })).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    // 3× the printed size, so it stays sharp on paper.
    const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return png ? { bytes: new Uint8Array(await png.arrayBuffer()), type: "png" } : null;
  } catch {
    return null;
  }
}

/** Under 18 on the day the form is printed. */
export function isMinor(birthday: string | null, today = new Date()): boolean {
  if (!birthday) return false;
  const [y, m, d] = birthday.split("-").map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age < 18;
}

const hasAny = (p: PersonalDetails | null) => !!p && Object.values(p).some((v) => v !== null && v !== "");

const formatEuros = (value: number) => `${value.toFixed(2).replace(".", ",")}€`;

export const fileName = (sheet: RegistrationSheet) =>
  `Ficha de inscricao ${sheet.form.season.replace(/[^\w-]+/g, "-")} - ${(sheet.person.fullName ?? sheet.member.name ?? "membro")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w ]+/g, "")}.pdf`;

/** Draws the member's form (pdf-lib loads only now: it isn't in any page's bundle). */
export async function buildFormPdf(sheet: RegistrationSheet, categories: readonly RegistrationCategory[]): Promise<Blob> {
  const [{ buildRegistrationPdf }, logo] = await Promise.all([import("./pdf"), logoPng(sheet.club.pictureUrl)]);
  const declaration = sheet.form.declaration
    .replaceAll("{fee}", formatEuros(sheet.form.feeEuros))
    .replaceAll("{season}", sheet.form.season)
    .replaceAll("{club}", sheet.club.name);
  const bytes = await buildRegistrationPdf({
    clubName: sheet.club.name,
    logo,
    form: sheet.form,
    declaration,
    categories,
    person: sheet.person,
    nib: sheet.nib,
    // The guardian's block is for minors; an adult's stays blank even if something was saved once.
    guardian: isMinor(sheet.person.birthday) && hasAny(sheet.guardian) ? sheet.guardian : null,
  });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** Phones: the share sheet (print, save to Files, send by WhatsApp…). Elsewhere: a normal download. */
export async function saveOrShare(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: "application/pdf" });
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      // Share failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
