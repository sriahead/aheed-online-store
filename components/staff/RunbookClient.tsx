"use client";

import { useState } from "react";
import Markdown from "react-markdown";

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

export function RunbookClient({ docs }: { docs: DocArticle[] }) {
  // Filter out pure dev docs (they go to the dev KMS site) and pure customer docs (they go to /help)
  const staffAdminDocs = docs.filter(
    (d) => d.audience.includes("staff") || d.audience.includes("admin"),
  );

  const [filter, setFilter] = useState<"all" | "staff" | "admin">("all");
  const filteredDocs =
    filter === "all" ? staffAdminDocs : staffAdminDocs.filter((d) => d.audience.includes(filter));

  const [selectedDoc, setSelectedDoc] = useState<DocArticle>(staffAdminDocs[0] || null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-4">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {(["all", "staff", "admin"] as const).map((aud) => (
            <button
              key={aud}
              type="button"
              onClick={() => setFilter(aud)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono capitalize transition-all ${
                filter === aud
                  ? "bg-white font-bold text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {aud}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
          {filteredDocs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelectedDoc(doc)}
              className={`w-full text-left p-4 rounded-2xl border font-mono text-xs transition-all ${
                selectedDoc?.id === doc.id
                  ? "bg-slate-950 text-white border-slate-800 ring-1 ring-emerald-500"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[9px] uppercase px-2 py-0.5 rounded font-extrabold ${
                    doc.visibility === "public"
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {doc.visibility || "internal"} • {doc.audience}
                </span>
                <span className="text-[10px] text-slate-400">{doc.lastUpdated}</span>
              </div>
              <h3 className="font-bold">{doc.title}</h3>
              <p
                className={`text-[11px] line-clamp-2 mt-1 ${
                  selectedDoc?.id === doc.id ? "text-slate-400" : "text-slate-500"
                }`}
              >
                {doc.summary}
              </p>
            </button>
          ))}
          {filteredDocs.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-200 rounded-2xl">
              No documents found for this filter.
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-8">
        {selectedDoc ? (
          <div className="bg-slate-950 text-slate-100 rounded-3xl p-6 sm:p-8 border border-slate-800 font-mono text-xs leading-relaxed space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
              <div>
                <span className="text-emerald-400 font-bold">// Nextra Docs-as-Code Renderer</span>
                <h2 className="text-xl font-bold text-white mt-1">{selectedDoc.title}</h2>
              </div>
              <div className="sm:text-right text-[11px] text-slate-400 flex flex-row sm:flex-col gap-4 sm:gap-0">
                <p>
                  Frontmatter:{" "}
                  <span className="text-amber-400">
                    visibility: {selectedDoc.visibility || "internal"}
                  </span>
                </p>
                <p>
                  Audience: <span className="text-emerald-400">{selectedDoc.audience}</span>
                </p>
              </div>
            </div>

            <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-800 overflow-x-auto">
              <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800">
                <Markdown>{selectedDoc.content}</Markdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950 text-slate-500 rounded-3xl p-12 border border-slate-800 flex items-center justify-center font-mono text-sm">
            Select a document to read
          </div>
        )}
      </div>
    </div>
  );
}
