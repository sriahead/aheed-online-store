import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "../../mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

// nextra-theme-docs always provides `wrapper`; the type only marks it optional
// because MDXComponents is a general-purpose shape.
const Wrapper = getMDXComponents().wrapper!;

type Params = { mdxPath?: string[] };

export async function generateMetadata(props: { params: Promise<Params> }) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  return metadata;
}

export default async function Page(props: { params: Promise<Params> }) {
  const params = await props.params;
  const result = await importPage(params.mdxPath);
  const { default: MDXContent, toc, metadata } = result;
  return (
    <Wrapper toc={toc} metadata={metadata}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
