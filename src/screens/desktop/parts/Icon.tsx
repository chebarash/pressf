import { BookIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, DownloadIcon, ExternalIcon, FileIcon, MailIcon, MoonIcon, PinIcon, SearchIcon, SendIcon, UsersIcon, XIcon } from "@/ui/icons";

const ICONS = {
  book: BookIcon,
  calendar: CalendarIcon,
  check: CheckIcon,
  "chevron-right": ChevronRightIcon,
  "chevron-left": ChevronLeftIcon,
  "chevron-down": ChevronDownIcon,
  clock: ClockIcon,
  file: FileIcon,
  mail: MailIcon,
  moon: MoonIcon,
  pin: PinIcon,
  search: SearchIcon,
  send: SendIcon,
  users: UsersIcon,
  external: ExternalIcon,
  download: DownloadIcon,
  x: XIcon,
} as const;

export type IconName = keyof typeof ICONS;

/** The UI kit icons by name, for data-driven places (palette, feed badges). */
export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  const C = ICONS[name];
  return <C size={size} className={className} style={{ flex: "none" }} />;
}
