import { Outlet, useNavigation } from "react-router";
import HuddleLoading from "./HuddleLoading";

// A shared route boundary covers account tabs, group steps and browser history.
// Show the animation only while routing is pending. Account and group screens
// keep their own loading states until their data is ready.
export default function ScreenTransition() {
  const navigation = useNavigation();
  const waiting = navigation.state !== "idle";
  return <>
    <div className="huddle-route-view" inert={waiting} aria-busy={waiting} aria-hidden={waiting || undefined}>
      <Outlet />
    </div>
    {waiting ? <HuddleLoading label="Opening your next screen" /> : null}
  </>;
}
