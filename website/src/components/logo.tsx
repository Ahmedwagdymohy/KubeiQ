import Image from "next/image";

export function Logo() {
  return (
    <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
      <Image src="/logo.png" alt="" width={30} height={30} priority />
      KubeiQ
    </span>
  );
}
