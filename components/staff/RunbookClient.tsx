"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import {
  audienceLabel,
  deriveAudienceTabs,
  docsWithAudience,
  type RunbookAudience,
} from "@/lib/runbook-audiences";

type DocArticle = {
  id: string;
  title: string;
  audience: string[];
  visibility?: "internal" | "public";
  category: string;
  summary: string;
  lastUpdated: string;
  content: string;
};

/**
 * The runbook reader (#633).
 *
 * THIS COMPONENT DOES NOT FILTER BY AUDIENCE. `app/(admin)/staff/runbook/page.tsx` has already
 * decided what this viewer may see; a second filter here is what produced #625, where the page
 * admitted `staff`/`store-admin` and this component re-filtered for `staff`/`admin`, silently
 * dropping the Store Admin Management Guide and leaving a permanently empty "Admin" tab.
 *
 * The tab list is derived from the audiences the delivered documents actually carry
 * (`deriveAudienceTabs`), so a tab exists only when it has something behind it. See
 * `lib/runbook-audiences.ts` for the full reasoning.
 */
export function RunbookClient({ docs }: { docs: DocArticle[] }) {
  const tabs = deriveAudienceTabs(docs);

  // `null` is the "All" tab. Not a member of RunbookAudience — "all" is not an audience, and
  // modelling it as one is how the old hardcoded list came to include a value nothing matched.
  const [filter, setFilter] = useState<RunbookAudience | null>(null);
  const filteredDocs = filter === null ? docs : docsWithAudience(docs, filter);

  const [selectedDoc, setSelectedDoc] = useState<DocArticle>(docs[0] || null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-4">
        <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setFilter(null)}
            aria-pressed={filter === null}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === null
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            All
          </button>
          {tabs.map((audience) => (
            <button
              key={audience}
              type="button"
              onClick={() => setFilter(audience)}
              aria-pressed={filter === audience}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === audience
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {audienceLabel(audience)}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
          {filteredDocs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelectedDoc(doc)}
              className={`w-full text-left p-4 rounded-2xl border text-sm transition ${
                selectedDoc?.id === doc.id
                  ? "bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-500 shadow-sm"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold ${
                    doc.visibility === "public"
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {doc.visibility || "internal"} • {doc.audience.join(", ")}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">{doc.lastUpdated}</span>
              </div>
              <h3
                className={`font-semibold mt-2 ${
                  selectedDoc?.id === doc.id ? "text-emerald-900" : "text-slate-900"
                }`}
              >
                {doc.title}
              </h3>
              <p
                className={`text-xs line-clamp-2 mt-1 ${
                  selectedDoc?.id === doc.id ? "text-emerald-700/80" : "text-slate-500"
                }`}
              >
                {doc.summary}
              </p>
            </button>
          ))}
          {filteredDocs.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm border border-dashed border-slate-200 rounded-2xl">
              No documents found for this filter.
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-8">
        {selectedDoc ? (
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-6 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                    {selectedDoc.category}
                  </span>
                  <span className="text-slate-300">/</span>
                  <span className="text-xs font-medium text-slate-500">{selectedDoc.id}</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mt-2">{selectedDoc.title}</h2>
              </div>
              <div className="sm:text-right text-xs text-slate-500 flex flex-row sm:flex-col gap-4 sm:gap-1">
                <p>
                  Visibility:{" "}
                  <span className="font-medium text-amber-600 capitalize">
                    {selectedDoc.visibility || "internal"}
                  </span>
                </p>
                <p>
                  Audience:{" "}
                  <span className="font-medium text-emerald-600 capitalize">
                    {selectedDoc.audience.join(", ")}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-8">
              <div className="prose prose-slate prose-base max-w-4xl mx-auto prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-a:text-emerald-600 hover:prose-a:text-emerald-700 prose-img:rounded-2xl">
                <Markdown>{selectedDoc.content}</Markdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white text-slate-500 rounded-3xl p-12 border border-slate-200 flex items-center justify-center text-sm shadow-sm">
            Select a document to read
          </div>
        )}
      </div>
    </div>
  );
}
