import { getPrisma } from "@/lib/db";
import {
  listPlatformVendors,
  listPlatformDomains,
  getPlatformOverviewMetrics,
  getPlatformHealthSummary,
  type PlatformVendorSummary,
  type PlatformDomainSummary,
  type PlatformOverviewMetrics,
  type PlatformHealthSummary,
} from "@/lib/repositories/platform-admin";

/**
 * Service wrapper for Platform Administration (issue #1269).
 * Bridges Server Components and Server Actions to pure repository data calls.
 */

export async function fetchPlatformVendors(): Promise<PlatformVendorSummary[]> {
  return listPlatformVendors(getPrisma());
}

export async function fetchPlatformDomains(): Promise<PlatformDomainSummary[]> {
  return listPlatformDomains(getPrisma());
}

export async function fetchPlatformOverviewMetrics(): Promise<PlatformOverviewMetrics> {
  return getPlatformOverviewMetrics(getPrisma());
}

export async function fetchPlatformHealthSummary(): Promise<PlatformHealthSummary> {
  return getPlatformHealthSummary(getPrisma());
}
