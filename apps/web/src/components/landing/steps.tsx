const STEPS = [
  {
    title: "Connect Gmail",
    body: "Sign in with Google. Ripple sends from your own address, so replies land in your inbox like any other email.",
  },
  {
    title: "Send",
    body: "Write a campaign with {{name}} and {{company}} fields and send to a list, or switch on tracking for a single email in Gmail.",
  },
  {
    title: "Watch it land",
    body: "Opens, clicks and the gaps between them show up in your dashboard within seconds.",
  },
];

export function Steps() {
  return (
    <section id="how" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h2 className="max-w-lg text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl">
          Set up before your coffee cools.
        </h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <span className="tabular block text-5xl font-semibold tracking-[-0.04em] text-transparent [-webkit-text-stroke:1.25px_rgb(124_243_224/0.55)]">
                {i + 1}
              </span>
              <h3 className="mt-4 text-xl font-medium">{s.title}</h3>
              <p className="mt-2 max-w-[34ch] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
