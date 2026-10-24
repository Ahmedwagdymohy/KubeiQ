import Link from "next/link";

/** The close: the whole band is one link, and the word on it is the action itself. */
export function InstallBand({ sentence = "One command installs every product on your own servers" }: { sentence?: string }) {
  return (
    <Link
      href="/install"
      data-reveal
      className="group mt-[clamp(96px,12vw,200px)] flex flex-col gap-[10vw] overflow-hidden bg-field pt-6 text-field-ink transition-colors duration-0 hover:bg-field-ink hover:text-field focus-visible:bg-field-ink focus-visible:text-field focus-visible:outline-none md:gap-[7vw]"
    >
      <span className="frame flex items-start justify-between gap-6">
        <span data-rise className="max-w-[30ch] text-lg font-semibold leading-snug md:text-xl">
          {sentence}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 48 48"
          className="h-8 w-8 shrink-0 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 md:h-12 md:w-12"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="square"
        >
          <path d="M12 36 36 12M16 12h20v20" />
        </svg>
      </span>
      <span className="frame block pb-6">
        <span className="block whitespace-nowrap text-[33vw] font-extrabold leading-[0.74] tracking-[-0.065em]">
          Install
        </span>
      </span>
    </Link>
  );
}
