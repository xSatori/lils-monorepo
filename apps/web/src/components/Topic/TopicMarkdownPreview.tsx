import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";

interface TopicMarkdownPreviewProps {
  children?: string;
  title: string;
  className?: string;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getPreviewMarkdown(markdown: string, title: string) {
  const trimmed = markdown.trim();
  if (!trimmed) return "";

  const lines = trimmed.split(/\r?\n/);
  const firstLine = lines[0] || "";
  const headingMatch = firstLine.match(/^#{1,6}\s+(.+)$/);

  if (!headingMatch) {
    return trimmed;
  }

  const headingText = headingMatch[1].trim();
  const normalizedHeading = normalize(headingText);
  const normalizedTitle = normalize(title);

  if (normalizedHeading === normalizedTitle) {
    return lines.slice(1).join("\n").trim();
  }

  if (headingText.toLowerCase().startsWith(title.trim().toLowerCase())) {
    const withoutTitle = headingText.slice(title.trim().length).trim();
    lines[0] = withoutTitle || headingText;
    return lines.join("\n").trim();
  }

  lines[0] = headingText;
  return lines.join("\n").trim();
}

export default function TopicMarkdownPreview({
  children,
  title,
  className,
}: TopicMarkdownPreviewProps) {
  const previewMarkdown = getPreviewMarkdown(children || "", title);
  const hasCustomLineClamp = className?.includes("line-clamp-");

  if (!previewMarkdown) {
    return null;
  }

  return (
    <ReactMarkdown
      className={clsx(
        !hasCustomLineClamp && "line-clamp-3",
        "text-content-secondary paragraph-sm",
        className,
      )}
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <>{children} </>,
        h1: ({ children }) => <>{children} </>,
        h2: ({ children }) => <>{children} </>,
        h3: ({ children }) => <>{children} </>,
        h4: ({ children }) => <>{children} </>,
        h5: ({ children }) => <>{children} </>,
        h6: ({ children }) => <>{children} </>,
        a: ({ children }) => (
          <span className="font-medium text-semantic-accent">{children}</span>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em>{children}</em>,
        code: ({ children }) => (
          <code className="rounded bg-background-secondary px-1">
            {children}
          </code>
        ),
        pre: ({ children }) => <>{children}</>,
        ul: ({ children }) => <>{children}</>,
        ol: ({ children }) => <>{children}</>,
        li: ({ children }) => <span>{children} </span>,
        blockquote: ({ children }) => <>{children}</>,
        img: () => null,
      }}
    >
      {previewMarkdown}
    </ReactMarkdown>
  );
}
