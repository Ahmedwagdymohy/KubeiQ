import type { Metadata } from "next";

import { RestartDialog } from "@/components/fragments";
import { Block, Close, MarginList, PageIntro } from "@/components/page-parts";
import { PanelNotes } from "@/components/panel-notes";
import { PrimaryLink, Rise, Screen, TextLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Cluster Manager",
  description:
    "Browse every Kubernetes resource, including custom resources. Read YAML, events and logs, read-only by default.",
};

export default function ManagerProductPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Cluster Manager. <br className="hidden sm:block" />
            Every resource, read safely.
          </>
        }
        lead="Browse every Kubernetes resource, custom resources included. Read YAML, events and logs, read-only until an admin says otherwise"
        actions={
          <>
            <TextLink href="/products/map">Cluster Map</TextLink>
            <PrimaryLink href="/install">Get Started</PrimaryLink>
          </>
        }
      >
        <Rise>
          <Screen
            light="/screens/manager-light.png"
            dark="/screens/manager-dark.png"
            alt="Cluster Manager listing deployments with one deployment open"
            width={1600}
            height={1000}
            priority
          />
        </Rise>
      </PageIntro>

      <Block title="What You Can Do">
        <MarginList
          items={[
            ["Every resource", "Workloads, networking, config, storage, access and your custom resources, found on the cluster itself"],
            ["YAML, events and logs", "Open any object to read its YAML and recent events. Pods show live logs, including the run before the last crash"],
            ["Safe by default", "Read-only until an admin turns changes on. Secret values are never read, only names and metadata"],
          ]}
        />
      </Block>

      <Block title="Logs Without a Terminal" lead="Follow a pod's logs live, switch containers, or read the run before the last restart. When something looks wrong, Investigate opens Cluster Doctor on that workload">
        <Rise>
          <Screen
            dark="/screens/manager-logs-dark.png"
            alt="Live logs of a pod in Cluster Manager"
            width={1600}
            height={1000}
          />
        </Rise>
      </Block>

      <Block title="Changes You Can Trust">
        <div className="grid12 gap-y-10">
          <div className="col-span-12 lg:col-span-6">
            <MarginList
              items={[
                ["Off by default", "An admin switches changes on in Settings. Until then every button that would change the cluster stays locked"],
                ["Editors only", "Scale, restart, cordon and delete are for admins and project editors, inside their own namespaces"],
                ["Confirmed and recorded", "Every change asks first, deleting asks for the name, and every attempt is recorded in Activity"],
              ]}
            />
          </div>
          <Rise delay={120} className="col-span-12 lg:col-span-5 lg:col-start-8">
            <RestartDialog />
          </Rise>
        </div>
      </Block>

      <Block title="Where the Products Meet" lead="Open an object and Cluster Map and Cluster Doctor are one click away from it">
        <PanelNotes />
      </Block>

      <Close sentence="Cluster Manager comes with every install, read-only from the first minute." />
    </>
  );
}
