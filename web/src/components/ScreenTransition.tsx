import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigation } from "react-router";
import HuddleLoading from "./HuddleLoading";

// A shared route boundary covers account tabs, group steps and browser history.
// Mount the destination immediately so data loads during the animation.
export default function ScreenTransition() {
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const [transition, setTransition] = useState({ pathname, animating: true });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransition(current => current.pathname === pathname ? { ...current, animating: false } : current);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // Cover the new destination before it paints, including rapid back/forward.
  if (transition.pathname !== pathname) setTransition({ pathname, animating: true });
  const waiting = transition.pathname !== pathname || transition.animating || navigation.state !== "idle";
  return <>
    <div className="huddle-route-view" inert={waiting} aria-busy={waiting} aria-hidden={waiting || undefined}>
      <Outlet />
    </div>
    {waiting ? <HuddleLoading label="Opening your next screen" /> : null}
  </>;
}
