import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings";
import { router } from "./router";
import MissingConfig from "./MissingConfig";
import { DoodleWorld } from "./doodle/Doodle";
import { loadToken, saveToken } from "./session";
import "./index.css";
import AccountContextProvider from "./components/AccountContextProvider";

const uri = import.meta.env.NEXT_PUBLIC_SPACETIMEDB_URI as string | undefined;
const db = import.meta.env.NEXT_PUBLIC_SPACETIMEDB_DB as string | undefined;

// The token is this phone's identity: every reducer acts as the member it
// belongs to (docs/CONTRACT.md S5.5), so it has to survive reloads.
const connectionBuilder =
  uri && db
    ? DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(db)
        .withToken(loadToken())
        .onConnect((_conn, _identity, token) => saveToken(token))
    : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DoodleWorld />
    {connectionBuilder ? (
      <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
        <AccountContextProvider><RouterProvider router={router} /></AccountContextProvider>
      </SpacetimeDBProvider>
    ) : (
      <MissingConfig />
    )}
  </StrictMode>,
);
