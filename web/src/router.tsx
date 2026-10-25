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
import Login from "./routes/Login";
import Friends from "./routes/Friends";
import Inbox from "./routes/Inbox";
import Invitation from "./routes/Invitation";
import Context from "./routes/Context";
import Connectors from "./routes/Connectors";
import Done from "./routes/Done";
import SharedResult from "./routes/SharedResult";
import ScreenTransition from "./components/ScreenTransition";

export const router = createBrowserRouter([{ Component: ScreenTransition, children: [
  { path: "/", loader: () => redirect("/start") },
  { path: "/start", Component: Home },
  { path: "/login", Component: Login },
  { path: "/friends", Component: Friends },
  { path: "/inbox", Component: Inbox },
  { path: "/invite/:invitationId", Component: Invitation },
  { path: "/context", Component: Context },
  { path: "/connectors", Component: Connectors },
  { path: "/result/:shareId", Component: SharedResult },
  { path: "/join/:code", Component: Join },
  {
    path: "/g/:groupId",
    id: "group",
    Component: GroupLayout,
    loader: ({ params }) => {
      const session = getSession(params.groupId!);
      if (!session) throw redirect(`/start?open=${encodeURIComponent(params.groupId!)}`);
      return session;
    },
    children: [
      { index: true, loader: ({ params }) => redirect(`/g/${params.groupId}/lobby`) },
      { path: "lobby", Component: Lobby },
      { path: "prefs", Component: Prefs },
      { path: "swipe", Component: Swipe },
      { path: "plans", Component: Plans },
      { path: "vote", Component: Vote },
      { path: "done", Component: Done },
      { path: "call", Component: Call },
      { path: "judge", Component: Judge },
    ],
  },
]}]);
