import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";
import type { MDXComponents } from "mdx/types";

const docsComponents = getDocsMDXComponents();

export function PlatformName() {
  const name = process.env.NEXT_PUBLIC_PLATFORM_NAME || process.env.PLATFORM_NAME || "Platform";
  return <>{name}</>;
}

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...docsComponents,
    PlatformName,
    ...components,
  };
}
