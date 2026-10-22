import Image from "next/image";

export function Logo() {
  return (
    <span className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
      <Image src="/logo.png" alt="" width={36} height={36} priority />
      KubeiQ
    </span>
  );
}
