export interface ArtJob {
  id: string;
  kind: string;
  transparent: boolean;
  prompt: string;
  columns?: number;
  rows?: number;
}
export interface Candidate {
  asset: string;
  variant: number;
  file: string;
  prompt: string;
  provider: string;
  model: string;
  params: Record<string, unknown>;
  date: string;
  sha256: string;
  selected: boolean;
  reason: string;
  reviewer: string;
}
export interface ArtManifest {
  version: number;
  styleReference: string;
  humanApproval: "pending" | "approved";
  candidates: Candidate[];
  assets: Record<
    string,
    { file: string; width: number; height: number; sha256: string }
  >;
  notes: string[];
}
