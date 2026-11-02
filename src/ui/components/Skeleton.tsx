import type { CSSProperties } from "react";
import { cx } from "./cx";
import s from "./Skeleton.module.css";

export type SkeletonProps = {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  /** Corner radius token: sm 8 · md 14 · lg 20 · full. */
  radius?: "sm" | "md" | "lg" | "full";
  className?: string;
};

/** One loading block (Figma SkeletonCard blocks, loading screens 1.1 / 3.7). */
export function Skeleton({ width = "100%", height = 16, radius = "sm", className }: SkeletonProps) {
  return <span aria-hidden className={cx(s.block, s[radius], className)} style={{ width, height }} />;
}

/** Card placeholder (Figma SkeletonCard 4018:1509). */
export function SkeletonCard({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div className={cx(s.card, className)} role="status" aria-label={label}>
      <div className={s.top}>
        <Skeleton width={72} height={24} />
        <Skeleton width={220} height={44} />
      </div>
      <div className={s.bottom}>
        <Skeleton width={44} height={44} radius="full" />
        <Skeleton width={150} height={16} />
        <Skeleton width={52} height={52} radius="md" />
      </div>
    </div>
  );
}
