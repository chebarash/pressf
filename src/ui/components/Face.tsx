import Image from "next/image";
import { cx } from "./cx";
import s from "./Face.module.css";

const DEFAULT_FACE = "/ui/face-default.png";
const MASCOT_FACE = "/ui/face-mascot.png";

export type FaceProps = {
  /**
   * A DRAWN face (admin-uploaded line drawing). Never a real photo.
   * Omit to show the Default "404" face, or use kind="mascot".
   */
  src?: string | null;
  /** Figma Person: Photo (= drawn face via src) · Default · Mascot. */
  kind?: "drawn" | "default" | "mascot";
  /** Pixel size (Figma uses 28, 40, 96, 120). */
  size?: number;
  /** Person's name for alt text; omit when the name is printed next to it. */
  name?: string;
  className?: string;
  priority?: boolean;
};

/** Drawn face (Figma Face 4007:1296). Faces are line art; in dark mode they sit on a paper disc. */
export function Face({ src, kind, size = 40, name, className, priority }: FaceProps) {
  const which = kind ?? (src ? "drawn" : "default");
  const image = which === "mascot" ? MASCOT_FACE : which === "drawn" && src ? src : DEFAULT_FACE;
  const alt = name ? (which === "default" ? `${name} (no drawing yet)` : name) : "";
  return (
    <span className={cx(s.face, className)} style={{ width: size, height: size }}>
      <Image src={image} alt={alt} width={size} height={size} sizes={`${size}px`} className={s.img} priority={priority} unoptimized={/^https?:/.test(image)} />
    </span>
  );
}
