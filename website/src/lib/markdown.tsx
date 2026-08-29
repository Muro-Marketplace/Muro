// A small, safe markdown renderer for artist-authored blog bodies.
//
// A32: the blog page split `body_markdown` on blank lines and printed each
// chunk inside a <p whitespace-pre-wrap>. The editor's own label says "Body
// (markdown)", so every heading, link and list an artist wrote was published
// as literal `##` and `[text](url)` syntax on a public page.
//
// Why this exists rather than a markdown dependency: everything here returns
// React ELEMENTS, never HTML strings, and nothing reaches
// dangerouslySetInnerHTML. That makes injection impossible by construction
// rather than by trusting a sanitiser's configuration, which matters because
// this input is user-authored and published publicly. It covers the subset
// the editor's help text implies: headings, emphasis, inline code, links,
// lists, blockquotes, rules and fenced code.
//
// Images are deliberately rendered as a labelled link rather than an <img>:
// next/image only loads hosts allow-listed in next.config, so an arbitrary
// author URL would break the page at runtime. If inline images become a real
// requirement, that is a next.config decision, not a renderer one.

import type { ReactNode } from "react";

/** http(s), mailto and site-relative only. Anything else (javascript:, data:) is dropped. */
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  return null;
}

const INLINE = /(`[^`]+`)|(!?\[[^\]]*\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)/;

/** Emphasis, code and links inside a single block of text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;

  while (rest.length > 0) {
    const m = rest.match(INLINE);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      out.push(
        <code key={key} className="px-1 py-0.5 bg-surface border border-border rounded-sm text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("![")) {
      // Image: labelled link, see the header note.
      const label = token.slice(2, token.indexOf("]"));
      const href = safeHref(token.slice(token.indexOf("(") + 1, -1));
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline">
            {label || "Image"}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = safeHref(token.slice(token.indexOf("(") + 1, -1));
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline">
            {label}
          </a>
        ) : (
          // An unsafe scheme keeps the author's words, loses the link.
          <span key={key}>{label}</span>
        ),
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    rest = rest.slice(m.index + token.length);
  }

  return out;
}

/**
 * Render a markdown body as React elements.
 *
 * Unknown or malformed syntax degrades to plain text rather than throwing, so
 * a published post can never be broken by what someone typed.
 */
export function renderMarkdown(source: string): ReactNode[] {
  const lines = (source ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const para = "text-foreground/80 leading-relaxed mb-6 text-base";

  while (i < lines.length) {
    const line = lines[i];

    // Blank
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push(
        <pre key={`b${key++}`} className="mb-6 p-4 bg-surface border border-border rounded-sm overflow-x-auto text-sm">
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={`b${key++}`} className="my-8 border-border" />);
      i++;
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], `h${key}`);
      const sizes: Record<number, string> = {
        1: "font-serif text-3xl text-foreground mt-10 mb-4",
        2: "font-serif text-2xl text-foreground mt-10 mb-4",
        3: "font-serif text-xl text-foreground mt-8 mb-3",
        4: "font-medium text-lg text-foreground mt-6 mb-2",
        5: "font-medium text-base text-foreground mt-6 mb-2",
        6: "font-medium text-sm text-foreground mt-6 mb-2",
      };
      const cls = sizes[level];
      const k = `b${key++}`;
      blocks.push(
        level === 1 ? <h1 key={k} className={cls}>{content}</h1>
        : level === 2 ? <h2 key={k} className={cls}>{content}</h2>
        : level === 3 ? <h3 key={k} className={cls}>{content}</h3>
        : level === 4 ? <h4 key={k} className={cls}>{content}</h4>
        : level === 5 ? <h5 key={k} className={cls}>{content}</h5>
        : <h6 key={k} className={cls}>{content}</h6>,
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`b${key++}`} className="mb-6 pl-4 border-l-2 border-accent/40 text-foreground/70 italic">
          {renderInline(body.join(" "), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`b${key++}`} className="mb-6 list-disc pl-6 space-y-1 text-foreground/80">
          {items.map((it, n) => <li key={n}>{renderInline(it, `ul${key}-${n}`)}</li>)}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`b${key++}`} className="mb-6 list-decimal pl-6 space-y-1 text-foreground/80">
          {items.map((it, n) => <li key={n}>{renderInline(it, `ol${key}-${n}`)}</li>)}
        </ol>,
      );
      continue;
    }

    // Paragraph: consecutive lines until a blank or a new block starts.
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*(#{1,6}\s|>|[-*]\s|\d+\.\s|```)/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])
    ) {
      body.push(lines[i]);
      i++;
    }
    if (body.length > 0) {
      blocks.push(
        <p key={`b${key++}`} className={para}>
          {renderInline(body.join(" "), `p${key}`)}
        </p>,
      );
    }
  }

  return blocks;
}
