export interface InitiateAuthDto {
  provider: string;
  input: Record<string, string>;
}

export interface CompleteAuthDto {
  provider: string;
  input: Record<string, string>;
}
