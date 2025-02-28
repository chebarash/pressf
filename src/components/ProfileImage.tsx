import Image from "next/image";
import { useState } from "react";

export default function ProfileImage({
  id,
  name,
  fill,
}: {
  id: string;
  name: string;
  fill?: boolean;
}) {
  const [src, setSrc] = useState(`/${id}.png`);

  return (
    <Image
      src={src}
      alt={name}
      width={fill ? undefined : 100}
      height={fill ? undefined : 100}
      fill={fill}
      onError={() => setSrc("/pfp.png")}
    />
  );
}
