import { SiteHeader } from "@/components/ui/site-header";
import { ButtonLink } from "@/components/ui/button";
import { DemoModelButton } from "@/components/demo-model-button";

function Plate({ src, label, alt }: { src: string; label: string; alt: string }) {
  return (
    <figure className="flex-1">
      <div className="aspect-[2/3] overflow-hidden rounded-[2px] bg-stone">
        {/* eslint-disable-next-line @next/next/no-img-element -- local SVG illustration */}
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </div>
      <figcaption className="eyebrow mt-3 text-muted">{label}</figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-4 pb-12 pt-6 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:pt-0">
        <section className="max-w-xl animate-fade-in">
          <p className="eyebrow text-muted">Virtual suit studio</p>
          <h1 className="mt-5 font-serif text-[3.25rem] leading-[0.98] tracking-[-0.01em] sm:text-7xl lg:text-[5.5rem]">
            See the look <em className="text-burgundy">before</em> you wear it.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            Create your digital model and experiment with suits, shirts, ties and shoes.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/create" size="lg">
              Create My Model
            </ButtonLink>
            <DemoModelButton />
          </div>
        </section>

        <section aria-label="Example: original photo and finished look" className="flex items-start gap-4 sm:gap-6">
          <Plate src="/demo-assets/model.svg" label="Original" alt="Illustrated model in a knit sweater" />
          <span aria-hidden className="mt-[40%] hidden font-serif text-3xl text-muted sm:block">
            →
          </span>
          <Plate
            src="/demo-assets/look.svg"
            label="Midnight Navy · Burgundy"
            alt="The same model wearing a navy suit, white shirt, burgundy tie and black Oxford shoes"
          />
        </section>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted sm:px-8">
        Visual try-on shows how a look could appear. It does not predict size or fit.
      </footer>
    </>
  );
}
