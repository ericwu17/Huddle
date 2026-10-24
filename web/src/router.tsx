import { createBrowserRouter, redirect } from "react-router";
import { getSession } from "./session";
import Home from "./routes/Home";
import Join from "./routes/Join";
import GroupLayout from "./routes/GroupLayout";
import Lobby from "./routes/Lobby";
import Prefs from "./routes/Prefs";
import Swipe from "./routes/Swipe";
import Plans from "./routes/Plans";
import Vote from "./routes/Vote";
import Call from "./routes/Call";
import Judge from "./routes/Judge";

export const router = createBrowserRouter([
  { path: "/start", Component: Home },
  { path: "/join/:code", Component: Join },
  {
    path: "/g/:groupId",
    id: "group",
    Component: GroupLayout,
    loader: ({ params }) => {
      const session = getSession(params.groupId!);
      if (!session) throw redirect("/start");
      return session;
    },
    children: [
      { index: true, loader: ({ params }) => redirect(`/g/${params.groupId}/lobby`) },
      { path: "lobby", Component: Lobby },
      { path: "prefs", Component: Prefs },
      { path: "swipe", Component: Swipe },
      { path: "plans", Component: Plans },
      { path: "vote", Component: Vote },
      { path: "call", Component: Call },
      { path: "judge", Component: Judge },
    ],
  },
]);
