import { Closing } from "@/components/home/closing";
import { FindsTable } from "@/components/home/finds-table";
import { LiveReport } from "@/components/home/live-report";
import { Masthead } from "@/components/home/masthead";
import { PricingFields } from "@/components/home/pricing-fields";
import { ProductsMosaic } from "@/components/home/products-mosaic";
import { Showcase } from "@/components/home/showcase";
import { Staircase } from "@/components/home/staircase";

export default function Home() {
  return (
    <>
      <Masthead />
      <Showcase />
      <Staircase />
      <LiveReport />
      <ProductsMosaic />
      <FindsTable />
      <PricingFields />
      <Closing />
    </>
  );
}
