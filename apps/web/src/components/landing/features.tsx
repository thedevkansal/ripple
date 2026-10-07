import { CalendarClock, FileDown, Gauge, ListFilter, Sheet, Users } from "lucide-react";

const FEATURES = [
  {
    icon: Sheet,
    title: "Campaigns from a spreadsheet",
    body: "Drop in a CSV of speakers or sponsors. Every email goes out personal, with their name and company.",
  },
  {
    icon: Gauge,
    title: "Send limits that keep Gmail happy",
    body: "Daily caps per account and spaced-out sends, so your address never looks like a spammer's.",
  },
  {
    icon: Users,
    title: "One dashboard for the team",
    body: "Everyone connects their own Gmail. Outreach from the whole team lands in one shared view.",
  },
  {
    icon: ListFilter,
    title: "Follow-up lists that build themselves",
    body: "Opened three times but no reply. Not opened after three days. Clicked the deck. Ready when you are.",
  },
  {
    icon: CalendarClock,
    title: "The best hour to send",
    body: "A heatmap of when your audience actually reads, so the next invite lands at the top of the inbox.",
  },
  {
    icon: FileDown,
    title: "Reports you can forward",
    body: "Export any campaign to CSV or PDF for the weekly sync, with real opens kept apart from prefetches.",
  },
];

export function Features() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h2 className="max-w-xl text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl">
          Made for outreach that has to land.
        </h2>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
          Speaker invites, sponsor decks, investor intros. Ripple was built running outreach for a
          college entrepreneurship summit, and it works for any list you care about.
        </p>
        <ul className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon className="size-5 text-glow" strokeWidth={1.75} aria-hidden />
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
