import { Extension } from "@/components/landing/extension";
import { Features } from "@/components/landing/features";
import { ClosingCta, Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Honest } from "@/components/landing/honest";
import { Nav } from "@/components/landing/nav";
import { Steps } from "@/components/landing/steps";
import { Story } from "@/components/landing/story";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <Story />
        <Steps />
        <Honest />
        <Features />
        <Extension />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
