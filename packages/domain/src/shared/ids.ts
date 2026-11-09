/** MongoDB ObjectId as 24 hex characters. Anything else can't exist, so lookups short-circuit to "not found". */
export const isObjectId = (value: string): boolean => /^[a-f0-9]{24}$/i.test(value);
