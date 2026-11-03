"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import type { Banner as BannerView } from "@/server/views";
import { Banner, Button } from "@/ui/components";
import { dismissRating, retrySync } from "../actions";
import s from "../mobile.module.css";
import { BottomBar } from "../parts/BottomBar";
import { QrFlow } from "../parts/QrFlow";
import { ratingBody, ratingEyebrow, type RatingAskView } from "./model";

/** The interactive pieces of Today: rating ask, banners, bottom button. */

export function RatingCard({ ask }: { ask: RatingAskView }) {
  const [hidden, hide] = useOptimistic(false, () => true);
  const [, start] = useTransition();
  if (hidden) return null;
  return (
    <section className={s.rate} aria-label={`Rate ${ask.term}`}>
      <p className={s.rateEyebrow}>{ratingEyebrow(ask.courses.length)}</p>
      <h2 className={`${s.rateTitle} t-display-xs`}>Rate {ask.term}</h2>
      <p className={`${s.rateBody} t-body-sm`}>{ratingBody(ask.courses)}</p>
      <div className={s.rateActions}>
        <Button href="/rate" label="Rate now" />
        <Button
          variant="ghost"
          label="Later"
          onClick={() =>
            start(async () => {
              hide(null);
              await dismissRating(ask.term);
            })
          }
        />
      </div>
    </section>
  );
}

/** In-app banners (Figma 9.4): sign in again, LMS not answering, first day, exams, absences. */
export function TodayBanner({ banner }: { banner: BannerView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const action = banner.action.href
    ? { label: banner.action.label, href: banner.action.href }
    : { label: pending ? "Retrying…" : banner.action.label, onClick: () => start(async () => (await retrySync(), router.refresh())) };
  return (
    <Banner tone={banner.kind === "semester-start" ? "info" : "warning"} action={action} className={s.bannerBleed}>
      {banner.text}
    </Banner>
  );
}

/**
 * The one bottom button Today shows: "Scan attendance QR" while a class is
 * open for check-in (10.1), else the loudest rating ask with shine (2.11).
 */
export function TodayBar({ checkIn, classEnd, classLine, course, rating }: { checkIn: boolean; classEnd?: string; classLine?: string; course?: string | null; rating: RatingAskView | null }) {
  const router = useRouter();
  if (checkIn) return <QrFlow classEnd={classEnd} classLine={classLine} course={course} />;
  if (rating?.level === "shine")
    return <BottomBar main={{ text: `Rate ${rating.term} · ${rating.courses.length} ${rating.courses.length === 1 ? "course" : "courses"}`, shine: true, onClick: () => router.push("/rate") }} />;
  return null;
}
