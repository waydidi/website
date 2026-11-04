"use client";

import Image from "next/image";
import Link from "next/link";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

export type ShowcaseSlide = { title: string; action: string; href: string; image: string; width: number; height: number };

// Full-width photo slides with a headline and one button. Customers move them with the arrows or a
// swipe; they never move on their own, so nobody loses their place while reading.
export function HomeShowcase({ label, slides }: { label: string; slides: ShowcaseSlide[] }) {
  return <section aria-label={label} data-testid="home-showcase" className="mx-auto w-full max-w-[1440px] px-4 pt-8 sm:px-8 sm:pt-12">
    <Carousel opts={{ loop: true }} className="overflow-hidden rounded-[22px]">
      <CarouselContent className="ml-0">
        {slides.map((slide, index) => <CarouselItem key={slide.href} className="pl-0">
          <div className="relative h-[340px] overflow-hidden bg-charcoal sm:h-[400px]">
            <Image src={slide.image} alt="" width={slide.width} height={slide.height} priority={index === 0} sizes="(max-width: 1440px) 100vw, 1376px" className="absolute inset-0 h-full w-full object-cover" />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/5" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
              <h3 className="max-w-[900px] text-[32px] font-black leading-[1.1] tracking-[-.035em] text-white sm:text-5xl lg:text-[64px]">{slide.title}</h3>
              <Link href={slide.href} className="mt-5 inline-flex min-h-12 items-center rounded-full bg-brand px-6 font-bold text-ink transition hover:bg-brand-hover">{slide.action}</Link>
            </div>
          </div>
        </CarouselItem>)}
      </CarouselContent>
      <CarouselPrevious className="left-4 top-8 size-11 translate-y-0 border-0 bg-white text-ink shadow-md hover:bg-white sm:top-1/2 sm:-translate-y-1/2" />
      <CarouselNext className="right-4 top-8 size-11 translate-y-0 border-0 bg-white text-ink shadow-md hover:bg-white sm:top-1/2 sm:-translate-y-1/2" />
    </Carousel>
  </section>;
}
