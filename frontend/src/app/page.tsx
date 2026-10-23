import { AppHeader } from "@/components/app-header";
import { Overview } from "@/components/home/overview";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <Overview />
    </div>
  );
}
