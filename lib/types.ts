export type Role = "PM" | "SPM";
export const ROLES: Role[] = ["PM", "SPM"];
export type Bucket = "requirements" | "pattern_hard" | "pattern_soft" | "trust";
export type Decision = "invite" | "reject";
export type LocationFlag = "mumbai" | "relocating" | "other" | "unknown";

export interface Pii {
  name: string | null;
  email: string | null;
  phone: string[];
  urls: string[];
  address: string | null;
}

export interface Criterion {
  id: string;
  role: Role;
  bucket: Bucket;
  key: string;
  name: string;
  strong_description: string;
  weak_description: string;
  weight: number;
  sort_order: number;
}

export interface CriterionScore {
  criterion_key: string;
  score: number;
  evidence: string;
  reason: string;
}

export interface Totals {
  total: number;
  requirements_subtotal: number;
  pattern_hard_subtotal: number;
  pattern_soft_subtotal: number;
  trust_subtotal: number;
}
