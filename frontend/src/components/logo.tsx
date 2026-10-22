import Image from "next/image";

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <Image src="/logo.png" alt="" width={28} height={28} priority />
      KubeiQ
    </span>
  );
}
