"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type RichTextNode = {
  plain: string;
  href?: string;
  annotations?: any;
};

type GuideBlock = {
  id: string;
  type: string;
  richText?: RichTextNode[];
  checked?: boolean;
  url?: string;
  caption?: RichTextNode[];
  children?: GuideBlock[];
};

type GuideDetail = {
  id: string;
  title: string;
  lastEdited: string;
};

export default function GuideDetailPage() {
  const params = useParams();
  const router = useRouter();
  const guideId = useMemo(() => params?.guideId as string, [params]);

  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [blocks, setBlocks] = useState<GuideBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!guideId) return;

    const loadGuide = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/guides?id=${encodeURIComponent(guideId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load guide");
        setGuide(data.guide);
        setBlocks(data.blocks || []);
      } catch (err) {
        console.error(err);
        setError("Unable to load this guide right now. Please try again shortly.");
      } finally {
        setLoading(false);
      }
    };

    loadGuide();
  }, [guideId]);

  function renderRichText(text?: RichTextNode[]) {
    if (!text?.length) return null;
    return text.map((t, idx) => {
      const classNames = ["text-[#3e4c24]"];
      if (t.annotations?.bold) classNames.push("font-semibold");
      if (t.annotations?.italic) classNames.push("italic");
      if (t.annotations?.underline) classNames.push("underline");
      if (t.annotations?.code) classNames.push("font-mono bg-[#f3f0e2] px-1 rounded");

      const content = t.href ? (
        <a
          key={`${t.plain}-${idx}`}
          href={t.href}
          className="text-[#2f5ba0] underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          {t.plain}
        </a>
      ) : (
        <span key={`${t.plain}-${idx}`}>{t.plain}</span>
      );

      return (
        <span key={`${t.plain}-${idx}`} className={classNames.join(" ")}>
          {content}
        </span>
      );
    });
  }

  function renderBlock(block: GuideBlock) {
    const children = block.children?.length ? (
      <div className="ml-4 space-y-2">{block.children.map(renderBlock)}</div>
    ) : null;

    switch (block.type) {
      case "heading_1":
        return (
          <h2 key={block.id} className="text-2xl font-semibold text-[#3b4224]">
            {renderRichText(block.richText)}
          </h2>
        );
      case "heading_2":
        return (
          <h3 key={block.id} className="text-xl font-semibold text-[#445330]">
            {renderRichText(block.richText)}
          </h3>
        );
      case "heading_3":
        return (
          <h4 key={block.id} className="text-lg font-semibold text-[#4d5b38]">
            {renderRichText(block.richText)}
          </h4>
        );
      case "paragraph":
        return (
          <p key={block.id} className="text-sm leading-relaxed text-[#3e4c24]">
            {renderRichText(block.richText)}
            {children}
          </p>
        );
      case "bulleted_list_item":
        return (
          <ul key={block.id} className="list-disc pl-5 text-sm text-[#3e4c24] space-y-1">
            <li>
              {renderRichText(block.richText)}
              {children}
            </li>
          </ul>
        );
      case "numbered_list_item":
        return (
          <ol key={block.id} className="list-decimal pl-5 text-sm text-[#3e4c24] space-y-1">
            <li>
              {renderRichText(block.richText)}
              {children}
            </li>
          </ol>
        );
      case "to_do":
        return (
          <div key={block.id} className="flex items-start gap-2 text-sm text-[#3e4c24]">
            <input type="checkbox" checked={block.checked} readOnly className="mt-1" />
            <div>
              {renderRichText(block.richText)}
              {children}
            </div>
          </div>
        );
      case "quote":
        return (
          <blockquote
            key={block.id}
            className="border-l-4 border-[#d0c9a4] bg-white/70 px-4 py-2 text-sm italic text-[#4b522d]"
          >
            {renderRichText(block.richText)}
            {children}
          </blockquote>
        );
      case "callout":
        return (
          <div
            key={block.id}
            className="rounded-lg border border-[#d0c9a4] bg-[#f2efde] px-4 py-3 text-sm text-[#374220]"
          >
            {renderRichText(block.richText)}
            {children}
          </div>
        );
      case "bookmark":
        return (
          <a
            key={block.id}
            href={block.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-[#cdd7ab] bg-white/80 px-4 py-3 text-sm text-[#2f5ba0] underline underline-offset-2"
          >
            {renderRichText(block.caption) || block.url}
          </a>
        );
      case "image":
        return (
          <figure key={block.id} className="space-y-2">
            {block.url && (
              <img
                src={block.url}
                alt={block.caption?.[0]?.plain || "Guide image"}
                className="w-full rounded-lg border border-[#d0c9a4] bg-white shadow-sm"
              />
            )}
            {block.caption?.length ? (
              <figcaption className="text-xs text-[#6b7348]">
                {renderRichText(block.caption)}
              </figcaption>
            ) : null}
            {children}
          </figure>
        );
      case "divider":
        return <hr key={block.id} className="border-t border-[#e2d7b5]" />;
      default:
        return (
          <p key={block.id} className="text-sm text-[#7a7f54] italic">
            {renderRichText(block.richText)}
            {children}
          </p>
        );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="rounded-full border border-[#d0c9a4] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#4b522d] shadow-sm hover:bg-[#f1edd8]"
        >
          ← Back
        </button>
        <Link
          href="/hub/guides/how-to"
          className="rounded-full border border-[#cdd7ab] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#4b522d] shadow-sm hover:bg-[#f1edd8]"
        >
          All Guides
        </Link>
      </div>

      <header className="rounded-xl bg-[#a0b764] text-white px-4 py-3 shadow">
        <h1 className="text-2xl font-semibold tracking-[0.14em] uppercase">
          {guide?.title || "Guide"}
        </h1>
        <p className="text-sm text-white/80">
          Updated {guide ? new Date(guide.lastEdited).toLocaleString() : "—"}
        </p>
      </header>

      {loading && (
        <div className="rounded-lg border border-dashed border-[#d5d7bc] bg-white/70 p-6 text-center text-sm text-[#737b54]">
          Loading guide...
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <article className="rounded-xl border border-[#d0c9a4] bg-[#f8f4e3] p-5 shadow-sm space-y-3">
          {blocks.length === 0 ? (
            <p className="text-sm text-[#7a7f54]">No content available for this guide yet.</p>
          ) : (
            <div className="space-y-3">{blocks.map((block) => renderBlock(block))}</div>
          )}
        </article>
      )}
    </div>
  );
}
