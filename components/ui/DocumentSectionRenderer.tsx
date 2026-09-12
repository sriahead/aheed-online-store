import Markdown from "react-markdown";

export function DocumentSectionRenderer({ content }: { content: string }) {
  // Split by markdown h2 headers (## )
  const sections = content.split(/(?=^##\s)/m);

  return (
    <div className="space-y-6">
      {sections.map((section, idx) => (
        <div key={idx} className="bg-surface-muted p-6 rounded-3xl border border-black/5">
          <div className="prose prose-base max-w-4xl mx-auto prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-a:text-action hover:prose-a:text-primary prose-img:rounded-2xl">
            <Markdown>{section}</Markdown>
          </div>
        </div>
      ))}
    </div>
  );
}
