/** Accent-insensitive search ("Joao" finds "João"). */
export const normalizeSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
