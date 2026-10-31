import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import {
  CATALOGUE,
  CATALOGUE_BOTTOM_LINE,
  STATUS_LABEL,
  featuresOf,
  statusCounts,
  type Feature,
  type FeatureStatus,
  type RoleCatalogue,
} from "@/features/feature-catalogue/catalogue";

export const metadata: Metadata = { title: "Feature Catalogue" };

const STATUS_STYLE: Record<FeatureStatus, { badge: string; icon: IconName }> = {
  live: { badge: "bg-action-tint text-action", icon: "circle-check" },
  partial: { badge: "bg-accent-tint text-accent", icon: "circle-alert" },
  unavailable: { badge: "bg-danger-tint text-danger", icon: "circle-x" },
};

function StatusBadge({ status }: { status: FeatureStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
    >
      <Icon name={style.icon} className="h-3 w-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <li className="flex flex-col rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold text-primary">{feature.name}</h4>
        <StatusBadge status={feature.status} />
      </div>
      <p className="mt-2 text-sm text-primary">{feature.what}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div>
          <dt className="inline font-semibold text-primary">Value: </dt>
          <dd className="inline text-primary-muted">{feature.value}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-primary">Demo: </dt>
          <dd className="inline text-primary-muted">{feature.demo}</dd>
        </div>
      </dl>
      {feature.note && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            feature.status === "unavailable"
              ? "bg-danger-tint text-danger"
              : "bg-accent-tint text-accent"
          }`}
        >
          {feature.note}
        </p>
      )}
      {feature.route && (
        <Link
          href={feature.route}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-action hover:underline"
        >
          Open {feature.route}
          <Icon name="arrow-right" className="h-3 w-3" />
        </Link>
      )}
    </li>
  );
}

function RoleSection({ role }: { role: RoleCatalogue }) {
  const counts = statusCounts([role]);
  return (
    <section id={role.role} className="mt-10 scroll-mt-6" aria-labelledby={`${role.role}-heading`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${role.role}-heading`} className="text-xl font-semibold text-primary">
          {role.label}
        </h2>
        <p className="text-xs text-primary-muted">
          {featuresOf(role).length} features · {counts.live} live · {counts.partial} partial ·{" "}
          {counts.unavailable} unavailable
        </p>
      </div>
      <p className="mt-1 text-sm text-primary">{role.bottomLine}</p>
      <p className="mt-1 text-xs text-primary-muted">Who can use it: {role.access}</p>

      {role.areas.map((area) => (
        <div key={area.id} className="mt-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary-muted">
            {area.label}
          </h3>
          <ul className="grid gap-4 md:grid-cols-2">
            {area.features.map((feature) => (
              <FeatureCard key={feature.name} feature={feature} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default async function FeatureCataloguePage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Platform admin only"
        message="The Feature Catalogue is restricted to platform administrators."
      />
    );
  }
  // Platform admins only: a store admin also passes requireVendorRole("ADMIN"), so refuse them here.
  if (auth.via !== "platform-admin") {
    return (
      <PanelRefusal
        title="Platform admin only"
        message="The Feature Catalogue is restricted to platform administrators."
      />
    );
  }

  const counts = statusCounts(CATALOGUE);
  const total = counts.live + counts.partial + counts.unavailable;
  const notReady = CATALOGUE.flatMap((role) =>
    featuresOf(role)
      .filter((f) => f.status !== "live")
      .map((f) => ({ role: role.label, feature: f })),
  );

  return (
    <PageContainer width="wide">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="list-checks" className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold text-primary">Feature catalogue</h1>
      </div>
      <p className="max-w-3xl text-sm text-primary">{CATALOGUE_BOTTOM_LINE}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {(["live", "partial", "unavailable"] as const).map((status) => (
          <div key={status} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <StatusBadge status={status} />
            <p className="mt-3 text-4xl font-bold text-primary">{counts[status]}</p>
            <p className="mt-1 text-xs text-primary-muted">of {total} catalogued features</p>
          </div>
        ))}
      </div>

      <nav aria-label="Roles" className="mt-6 flex flex-wrap gap-2">
        {CATALOGUE.map((role) => (
          <a
            key={role.role}
            href={`#${role.role}`}
            className="rounded-full border border-action px-4 py-2 text-sm font-medium text-action hover:bg-action hover:text-white"
          >
            {role.label}
          </a>
        ))}
        <a
          href="#not-ready"
          className="rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent hover:text-white"
        >
          Not ready to demo
        </a>
      </nav>

      {CATALOGUE.map((role) => (
        <RoleSection key={role.role} role={role} />
      ))}

      <section id="not-ready" className="mt-12 scroll-mt-6" aria-labelledby="not-ready-heading">
        <h2 id="not-ready-heading" className="text-xl font-semibold text-primary">
          Not ready to demonstrate
        </h2>
        <p className="mt-1 text-sm text-primary">
          Partial and unavailable features, with what is missing. Check these before promising them.
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-black/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 text-xs uppercase tracking-wider text-primary-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Feature</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">What is missing</th>
              </tr>
            </thead>
            <tbody>
              {notReady.map(({ role, feature }) => (
                <tr
                  key={`${role}-${feature.name}`}
                  className="border-b border-black/5 last:border-0"
                >
                  <td className="px-4 py-3 font-semibold text-primary">{feature.name}</td>
                  <td className="px-4 py-3 text-primary-muted">{role}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={feature.status} />
                  </td>
                  <td className="px-4 py-3 text-primary-muted">{feature.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageContainer>
  );
}
