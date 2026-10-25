import { Link, useNavigate } from "react-router";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { isReadyAgentPlan, useAgentOrders } from "../agentData";
import { useAgentBallot } from "../useAgentBallot";
import { useLatestBooking } from "../data";
import { useRun } from "../useRun";
import ChosenResult from "../components/ChosenResult";
import MeetupCalendarAction from "../components/MeetupCalendarAction";
import CalendarDownload from "../components/CalendarDownload";
import ShareResultAction from "../components/ShareResultAction";

export default function Done() {
  const { group, agent, session, isHost } = useGroup();
  const { runId, loading, current, complete, winner, winnerNumber } = useAgentBallot(group, agent, session.memberId);
  const orders = useAgentOrders(runId, session.memberId);
  const booking = useLatestBooking();
  const startBooking = useReducer(reducers.startBooking);
  const navigate = useNavigate();
  const { run, busy, error } = useRun();
  if (loading) return <p className="card" role="status">Loading the group’s choice…</p>;
  if (!current || !complete || !winner || !runId) return <section className="card space-y-4">
    <h1 className="card-title">{!current ? "This result has changed" : complete ? "The vote is tied" : "Waiting for everyone’s choice"}</h1>
    <p>{!current ? "Open the updated plans to continue." : complete ? "Return to voting to resolve the tie." : "Everyone needs to vote before the result is final."}</p>
    <div className="flex flex-wrap gap-3"><Link className="btn btn-sun" to={`/g/${group.id}/plans`}>Open updated plans</Link><Link className="btn" to={`/g/${group.id}/vote`}>Back to voting</Link></div>
  </section>;
  const timed = "stops" in winner ? winner : null;
  const mealIndex = timed?.stops.findIndex(stop => stop.category === "meal") ?? -1;
  const canBook = isHost && timed && isReadyAgentPlan(timed) && mealIndex >= 0;
  const alreadyBooking = booking?.runId === runId && booking.planId === winner.id && ["pending", "calling", "confirmed"].includes(booking.status);
  return <div className="space-y-5">
    <div><span className="sticker sticker-lime">Everyone has voted</span><h1 className="shout mt-4 text-[48px]">Your Huddle is decided!</h1></div>
    <ChosenResult date={group.date} choice={winner} optionNumber={winnerNumber ?? undefined} order={orders.find(order => order.planId === winner.id)} />
    <Link className="btn" to={`/g/${group.id}/vote`}>Change my vote</Link>
    {timed ? <><MeetupCalendarAction key={`${runId}:${winner.id}`} runId={runId} planId={winner.id} isHost={isHost} /><CalendarDownload key={`calendar:${runId}:${winner.id}`} date={group.date} plan={timed} runId={runId} /></> : null}
    <ShareResultAction key={`${runId}:${winner.id}`} runId={runId} planId={winner.id} />
    {canBook ? <section className="card space-y-3"><h2 className="card-title">Try the booking demo</h2>
      <p className="muted">A simulation only. No restaurant will be called or reserved.</p>
      <button className="btn" disabled={busy || alreadyBooking} onClick={() => run(async () => {
        await startBooking({ runId, planId: winner.id, stopIndex: mealIndex }); navigate(`/g/${group.id}/call`);
      })}>{alreadyBooking ? "Booking simulation already started" : "Simulate booking"}</button>
    </section> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}
