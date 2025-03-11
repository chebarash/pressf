import Image from "next/image";

export default function ProfileImage({
  image,
  name,
  fill,
}: {
  image?: string;
  name: string;
  fill?: boolean;
}) {
  return (
    <Image
      src={image || "/pfp.png"}
      alt={name}
      width={fill ? undefined : 100}
      height={fill ? undefined : 100}
      fill={fill}
      unoptimized
    />
  );
}
