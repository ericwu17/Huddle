import PageHeading from "../components/PageHeading";
import { useEffect } from "react";
import { Link } from "react-router";
import { useGroup } from "../groupContext";
import { useAgentOrders } from "../agentData";
import { useAgentBallot } from "../useAgentBallot";
import ChosenResult from "../components/ChosenResult";
import MeetupCalendarAction from "../components/MeetupCalendarAction";
import CalendarDownload from "../components/CalendarDownload";
import ShareResultAction from "../components/ShareResultAction";

export default function Done() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const { group, agent, session } = useGroup();
  const { runId, loading, current, complete, winner, winnerNumber } = useAgentBallot(group, agent, session.memberId);
  const orders = useAgentOrders(runId, session.memberId);
  if (loading) return <p className="card" role="status">Loading the group’s choice…</p>;
  if (!current || !complete || !winner || !runId) return <section className="card space-y-4">
    <h1 className="card-title">{!current ? "This result has changed" : complete ? "The vote is tied" : "Waiting for everyone’s choice"}</h1>
    <p>{!current ? "Open the updated plans to continue." : complete ? "Return to voting to resolve the tie." : "Everyone needs to vote before the result is final."}</p>
    <div className="flex flex-wrap gap-3"><Link className="btn btn-sun" to={`/g/${group.id}/plans`}>Open updated plans</Link><Link className="btn" to={`/g/${group.id}/vote`}>Back to voting</Link></div>
  </section>;
  const timed = "stops" in winner ? winner : null;
  return <div className="space-y-5">
    <div><span className="sticker sticker-lime">Everyone has voted</span><PageHeading lead="It’s" accent="a plan!" /></div>
    <ChosenResult date={group.date} choice={winner} optionNumber={winnerNumber ?? undefined} order={orders.find(order => order.planId === winner.id)} />
    <Link className="btn" to={`/g/${group.id}/vote`}>Change my vote</Link>
    {timed ? <><MeetupCalendarAction key={`${runId}:${winner.id}`} runId={runId} planId={winner.id} /><CalendarDownload key={`calendar:${runId}:${winner.id}`} date={group.date} plan={timed} runId={runId} /></> : null}
    <ShareResultAction key={`${runId}:${winner.id}`} runId={runId} planId={winner.id} />
  </div>;
}
