import { createContext } from "react";

export type AccountContext = {
  version: 1;
  preferences: string;
  dietary: string[];
  allergies: string[];
  budgetMaxPerPerson: number | null;
  maxOutingMinutes: number | null;
};

export const EMPTY_CONTEXT: AccountContext = { version: 1, preferences: "", dietary: [], allergies: [], budgetMaxPerPerson: null, maxOutingMinutes: null };

export type SavedAccountContext = {
  accountId: string;
  contextJson: string;
  revision: number;
  updatedAt: number;
  context: AccountContext;
};

export const AccountContextState = createContext<SavedAccountContext | null | undefined>(undefined);
