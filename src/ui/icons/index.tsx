import type { SVGProps } from "react";

/**
 * Icons from Figma "02 Components" → Icons (24 px grid, 2.5 px round stroke).
 * They draw in currentColor; the stroke stays 2.5 px at every size, as in the
 * Figma instances (20 px in buttons, 18 px in the search field, 14 px in rows).
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  title?: string;
};

function Svg({ size = 24, title, strokeWidth = 2.5, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

const P = (d: string) => <path d={d} vectorEffect="non-scaling-stroke" />;

export const ArrowRightIcon = (p: IconProps) => <Svg {...p}>{P("M5 12H19")}{P("M12 5L19 12L12 19")}</Svg>;
export const ChevronRightIcon = (p: IconProps) => <Svg {...p}>{P("M9 18L15 12L9 6")}</Svg>;
export const ChevronLeftIcon = (p: IconProps) => <Svg {...p}>{P("M15 18L9 12L15 6")}</Svg>;
export const ChevronDownIcon = (p: IconProps) => <Svg {...p}>{P("M6 9L12 15L18 9")}</Svg>;
export const XIcon = (p: IconProps) => <Svg {...p}>{P("M18 6L6 18")}{P("M6 6L18 18")}</Svg>;
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z")}
    {P("M21 21L16.7 16.7")}
  </Svg>
);
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15")}
    {P("M7 10L12 15L17 10")}
    {P("M12 15V3")}
  </Svg>
);
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M15 3H21V9")}
    {P("M10 14L21 3")}
    {P("M18 13V19C18 19.5304 17.7893 20.0391 17.4142 20.4142C17.0391 20.7893 16.5304 21 16 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V8C3 7.46957 3.21071 6.96086 3.58579 6.58579C3.96086 6.21071 4.46957 6 5 6H11")}
  </Svg>
);
export const FileIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z")}
    {P("M14 2V8H20")}
  </Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z")}
    {P("M12 6V12L16 14")}
  </Svg>
);
export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M20 10C20 16 12 22 12 22C12 22 4 16 4 10C4 7.87827 4.84285 5.84344 6.34315 4.34315C7.84344 2.84285 9.87827 2 12 2C14.1217 2 16.1566 2.84285 17.6569 4.34315C19.1571 5.84344 20 7.87827 20 10Z")}
    {P("M15 10C15 11.6569 13.6569 13 12 13C10.3431 13 9 11.6569 9 10C9 8.34315 10.3431 7 12 7C13.6569 7 15 8.34315 15 10Z")}
  </Svg>
);
export const MailIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M4 4H20C21.1046 4 22 4.89543 22 6V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V6C2 4.89543 2.89543 4 4 4Z")}
    {P("M22 7L12 13L2 7")}
  </Svg>
);
export const SendIcon = (p: IconProps) => <Svg {...p}>{P("M22 2L11 13")}{P("M22 2L15 22L11 13L2 9L22 2Z")}</Svg>;
export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M21 12.8C20.8407 14.5011 20.2005 16.1217 19.1542 17.4723C18.1079 18.823 16.6988 19.848 15.0915 20.4274C13.4843 21.0068 11.7453 21.1168 10.0778 20.7445C8.41038 20.3721 6.88335 19.5329 5.67525 18.3247C4.46715 17.1166 3.62788 15.5896 3.25554 13.9222C2.8832 12.2547 2.99317 10.5157 3.57261 8.90848C4.15204 7.30122 5.177 5.89209 6.52767 4.84581C7.87834 3.79953 9.49893 3.15931 11.2 3C10.189 4.348 9.69816 6.01546 9.81761 7.69622C9.93706 9.37699 10.6588 10.9583 11.8503 12.1497C13.0417 13.3412 14.623 14.0629 16.3038 14.1824C17.9845 14.3018 19.652 13.811 21 12.8Z")}
  </Svg>
);
export const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20V2H6.5C5.83696 2 5.20107 2.26339 4.73223 2.73223C4.26339 3.20107 4 3.83696 4 4.5V19.5Z")}
    {P("M4 19.5V22H20V17")}
  </Svg>
);
export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H6C4.93913 15 3.92172 15.4214 3.17157 16.1716C2.42143 16.9217 2 17.9391 2 19V21")}
    {P("M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z")}
    {P("M22 21V19C21.9993 18.1137 21.7044 17.2528 21.1614 16.5523C20.6184 15.8519 19.8581 15.3516 19 15.13")}
    {P("M16 3.13C16.8604 3.3503 17.623 3.8507 18.1676 4.55231C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88")}
  </Svg>
);
export const CheckIcon = (p: IconProps) => <Svg {...p}>{P("M20 6L9 17L4 12")}</Svg>;
export const MenuIcon = (p: IconProps) => <Svg {...p}>{P("M4 7H20")}{P("M4 12H20")}{P("M4 17H20")}</Svg>;
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    {P("M5 4H19C20.1 4 21 4.9 21 6V20C21 21.1 20.1 22 19 22H5C3.9 22 3 21.1 3 20V6C3 4.9 3.9 4 5 4Z")}
    <path d="M8 2V6M16 2V6M4 10H20" strokeLinecap="butt" vectorEffect="non-scaling-stroke" />
  </Svg>
);
export const QrIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3H9V9H3V3ZM15 3H21V9H15V3ZM3 15H9V21H3V15Z" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
    <path d="M15 15V15.1M19 15H21V17M15 19H17M21 21V21.1" strokeLinecap="butt" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
  </Svg>
);

/** Indeterminate spinner from the Button/MainButton Loading states (3/4 ring). */
export function SpinnerIcon({ size = 16, title = "Loading", className, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" role="img" className={className} {...rest}>
      <title>{title}</title>
      <path d="M14.75 8A6.75 6.75 0 1 1 8 1.25" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const icons = {
  "arrow-right": ArrowRightIcon,
  "chevron-right": ChevronRightIcon,
  "chevron-left": ChevronLeftIcon,
  "chevron-down": ChevronDownIcon,
  x: XIcon,
  search: SearchIcon,
  download: DownloadIcon,
  external: ExternalIcon,
  file: FileIcon,
  clock: ClockIcon,
  pin: PinIcon,
  mail: MailIcon,
  send: SendIcon,
  moon: MoonIcon,
  book: BookIcon,
  users: UsersIcon,
  check: CheckIcon,
  menu: MenuIcon,
  calendar: CalendarIcon,
  qr: QrIcon,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, ...p }: IconProps & { name: IconName }) {
  const C = icons[name];
  return <C {...p} />;
}
