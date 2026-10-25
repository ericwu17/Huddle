import { createContext } from "react";

export type AccountContext = {
  version: 1;
  preferences: string;
  dietary: string[];
  allergies: string[];
  budgetMaxPerPerson: number | null;
  maxOutingMinutes: number | null;
  preferredStops: number | null;
};

export const EMPTY_CONTEXT: AccountContext = { version: 1, preferences: "", dietary: [], allergies: [], budgetMaxPerPerson: null, maxOutingMinutes: null, preferredStops: null };

// Starting values for a new form; saved profiles and outing needs take priority.
export const DEFAULT_PREFERENCES: AccountContext = {
  version: 1, preferences: "", dietary: [], allergies: [],
  budgetMaxPerPerson: 30, maxOutingMinutes: 180, preferredStops: null,
};

export type SavedAccountContext = {
  accountId: string;
  contextJson: string;
  revision: number;
  updatedAt: number;
  context: AccountContext;
};

export const AccountContextState = createContext<SavedAccountContext | null | undefined>(undefined);
